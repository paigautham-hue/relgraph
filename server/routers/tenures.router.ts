import { z } from "zod";
import { router, domainScopedProcedure, contributorProcedure } from "../_core/trpc";
import { createTenureSchema, paginationSchema } from "@shared/validation";
import { getDb } from "../db";
import { tenures, organizations, persons } from "../db/schema";
import { eq, and, desc, asc, count } from "drizzle-orm";
import { logAudit, getClientIp } from "../middleware/audit";
import { TRPCError } from "@trpc/server";

const tenureFilterSchema = paginationSchema.extend({
  personId: z.string().uuid().optional(),
  orgId: z.string().uuid().optional(),
  isCurrent: z.boolean().optional(),
});

const updateTenureSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  department: z.string().max(255).optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  isCurrent: z.boolean().optional(),
  source: z.enum(["manual", "auto_scraped"]).optional(),
  sourceUrl: z.string().url().nullable().optional(),
});

export const tenuresRouter = router({
  list: domainScopedProcedure.input(tenureFilterSchema).query(async ({ input }) => {
    const db = getDb();
    const { page, pageSize, personId, orgId, isCurrent, sortOrder } = input;
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (personId) conditions.push(eq(tenures.personId, personId));
    if (orgId) conditions.push(eq(tenures.orgId, orgId));
    if (isCurrent !== undefined) conditions.push(eq(tenures.isCurrent, isCurrent));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: tenures.id,
          personId: tenures.personId,
          orgId: tenures.orgId,
          title: tenures.title,
          department: tenures.department,
          startDate: tenures.startDate,
          endDate: tenures.endDate,
          isCurrent: tenures.isCurrent,
          source: tenures.source,
          sourceUrl: tenures.sourceUrl,
          createdAt: tenures.createdAt,
          orgName: organizations.name,
          personName: persons.name,
        })
        .from(tenures)
        .leftJoin(organizations, eq(tenures.orgId, organizations.id))
        .leftJoin(persons, eq(tenures.personId, persons.id))
        .where(where)
        .orderBy(sortOrder === "asc" ? asc(tenures.startDate) : desc(tenures.startDate))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(tenures).where(where),
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
      const [tenure] = await db
        .select({
          id: tenures.id,
          personId: tenures.personId,
          orgId: tenures.orgId,
          title: tenures.title,
          department: tenures.department,
          startDate: tenures.startDate,
          endDate: tenures.endDate,
          isCurrent: tenures.isCurrent,
          source: tenures.source,
          sourceUrl: tenures.sourceUrl,
          createdAt: tenures.createdAt,
          updatedAt: tenures.updatedAt,
          orgName: organizations.name,
          personName: persons.name,
        })
        .from(tenures)
        .leftJoin(organizations, eq(tenures.orgId, organizations.id))
        .leftJoin(persons, eq(tenures.personId, persons.id))
        .where(eq(tenures.id, input.id))
        .limit(1);

      if (!tenure) throw new TRPCError({ code: "NOT_FOUND", message: "Tenure not found" });
      return tenure;
    }),

  create: contributorProcedure.input(createTenureSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const [tenure] = await db
      .insert(tenures)
      .values({
        ...input,
        createdBy: ctx.user.id,
      })
      .returning();

    logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "tenure",
      entityId: tenure.id,
      newValue: JSON.stringify(input),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return tenure;
  }),

  update: contributorProcedure.input(updateTenureSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const { id, ...data } = input;

    const [existing] = await db.select().from(tenures).where(eq(tenures.id, id)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Tenure not found" });

    const [updated] = await db
      .update(tenures)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tenures.id, id))
      .returning();

    logAudit({
      userId: ctx.user.id,
      actionType: "update",
      entityType: "tenure",
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
      const [existing] = await db.select().from(tenures).where(eq(tenures.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Tenure not found" });

      await db.delete(tenures).where(eq(tenures.id, input.id));

      logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "tenure",
        entityId: input.id,
        oldValue: JSON.stringify(existing),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return { success: true };
    }),
});
