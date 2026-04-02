import { z } from "zod";
import { router, domainScopedProcedure, contributorProcedure } from "../_core/trpc";
import { createIntelSchema, paginationSchema } from "@shared/validation";
import { getDb } from "../db";
import { personIntel, persons, users } from "../db/schema";
import { eq, and, desc, asc, count } from "drizzle-orm";
import { logAudit, getClientIp } from "../middleware/audit";
import { TRPCError } from "@trpc/server";

const intelFilterSchema = paginationSchema.extend({
  personId: z.string().uuid().optional(),
  fieldName: z.string().optional(),
});

const updateIntelSchema = z.object({
  id: z.string().uuid(),
  fieldName: z.string().min(1).max(100).optional(),
  fieldValue: z.string().min(1).optional(),
  sourceUrl: z.string().url().nullable().optional(),
  aiConfidence: z.number().min(0).max(1).nullable().optional(),
});

export const intelRouter = router({
  list: domainScopedProcedure.input(intelFilterSchema).query(async ({ input }) => {
    const db = getDb();
    const { page, pageSize, personId, fieldName, sortOrder } = input;
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (personId) conditions.push(eq(personIntel.personId, personId));
    if (fieldName) conditions.push(eq(personIntel.fieldName, fieldName));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: personIntel.id,
          personId: personIntel.personId,
          fieldName: personIntel.fieldName,
          fieldValue: personIntel.fieldValue,
          inputMethod: personIntel.inputMethod,
          sourceUrl: personIntel.sourceUrl,
          aiConfidence: personIntel.aiConfidence,
          lastVerifiedAt: personIntel.lastVerifiedAt,
          createdAt: personIntel.createdAt,
          personName: persons.name,
        })
        .from(personIntel)
        .leftJoin(persons, eq(personIntel.personId, persons.id))
        .where(where)
        .orderBy(sortOrder === "asc" ? asc(personIntel.fieldName) : desc(personIntel.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(personIntel).where(where),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }),

  getById: domainScopedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [intel] = await db
        .select({
          id: personIntel.id,
          personId: personIntel.personId,
          fieldName: personIntel.fieldName,
          fieldValue: personIntel.fieldValue,
          inputMethod: personIntel.inputMethod,
          sourceUrl: personIntel.sourceUrl,
          aiConfidence: personIntel.aiConfidence,
          lastVerifiedAt: personIntel.lastVerifiedAt,
          createdAt: personIntel.createdAt,
          updatedAt: personIntel.updatedAt,
          personName: persons.name,
        })
        .from(personIntel)
        .leftJoin(persons, eq(personIntel.personId, persons.id))
        .where(eq(personIntel.id, input.id))
        .limit(1);

      if (!intel)
        throw new TRPCError({ code: "NOT_FOUND", message: "Intel entry not found" });
      return intel;
    }),

  create: contributorProcedure.input(createIntelSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    await db
      .insert(personIntel)
      .values({
        ...input,
        contributedBy: ctx.user.id,
      });

    const [intel] = await db
      .select()
      .from(personIntel)
      .where(eq(personIntel.personId, input.personId))
      .orderBy(desc(personIntel.createdAt))
      .limit(1);

    if (!intel) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create intel entry" });
    }

    logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "intel_field",
      entityId: intel.id,
      newValue: JSON.stringify(input),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return intel;
  }),

  update: contributorProcedure.input(updateIntelSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const { id, ...data } = input;

    const [existing] = await db
      .select()
      .from(personIntel)
      .where(eq(personIntel.id, id))
      .limit(1);
    if (!existing)
      throw new TRPCError({ code: "NOT_FOUND", message: "Intel entry not found" });

    await db
      .update(personIntel)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(personIntel.id, id));

    const [updated] = await db
      .select()
      .from(personIntel)
      .where(eq(personIntel.id, id))
      .limit(1);

    if (!updated) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to update intel entry" });
    }

    logAudit({
      userId: ctx.user.id,
      actionType: "update",
      entityType: "intel_field",
      entityId: id,
      oldValue: JSON.stringify(existing),
      newValue: JSON.stringify(data),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return updated;
  }),

  delete: contributorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(personIntel)
        .where(eq(personIntel.id, input.id))
        .limit(1);
      if (!existing)
        throw new TRPCError({ code: "NOT_FOUND", message: "Intel entry not found" });

      await db.delete(personIntel).where(eq(personIntel.id, input.id));

      logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "intel_field",
        entityId: input.id,
        oldValue: JSON.stringify(existing),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return { success: true };
    }),

  fieldHistory: domainScopedProcedure
    .input(
      z.object({
        personId: z.string().uuid(),
        fieldName: z.string().min(1),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const data = await db
        .select({
          id: personIntel.id,
          fieldValue: personIntel.fieldValue,
          inputMethod: personIntel.inputMethod,
          sourceUrl: personIntel.sourceUrl,
          aiConfidence: personIntel.aiConfidence,
          lastVerifiedAt: personIntel.lastVerifiedAt,
          createdAt: personIntel.createdAt,
          contributorName: users.name,
          contributorId: personIntel.contributedBy,
        })
        .from(personIntel)
        .leftJoin(users, eq(personIntel.contributedBy, users.id))
        .where(
          and(
            eq(personIntel.personId, input.personId),
            eq(personIntel.fieldName, input.fieldName),
          ),
        )
        .orderBy(desc(personIntel.createdAt));

      return data;
    }),
});
