import { z } from "zod";
import { router, domainScopedProcedure, contributorProcedure } from "../_core/trpc";
import { createReflectionSchema, paginationSchema } from "@shared/validation";
import { recordEntityProvenance } from "../services/provenance-helpers";
import { REFLECTION_CATEGORIES, VISIBILITY_LEVELS, ROLE_LEVELS, type UserRole } from "@shared/enums";
import { getDb } from "../db";
import { reflections, persons, users } from "../db/schema";
import { eq, and, desc, asc, count, inArray, lte } from "drizzle-orm";
import { logAudit, getClientIp } from "../middleware/audit";
import { TRPCError } from "@trpc/server";

const reflectionFilterSchema = paginationSchema.extend({
  personId: z.string().uuid().optional(),
  category: z.enum(REFLECTION_CATEGORIES).optional(),
});

const updateReflectionSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(REFLECTION_CATEGORIES).optional(),
  content: z.string().min(1).optional(),
  confidenceLevel: z.enum(["low", "medium", "high"]).optional(),
  confidenceBasis: z.string().nullable().optional(),
  linkedInteractionId: z.string().uuid().nullable().optional(),
  linkedOpportunity: z.string().nullable().optional(),
  visibilityLevel: z.enum(VISIBILITY_LEVELS).optional(),
});

/**
 * Map the user's role to the maximum visibility level they can see.
 * Visibility levels: contributor < manager < admin
 */
function getVisibleLevels(role: string): string[] {
  const userLevel = ROLE_LEVELS[role as UserRole] ?? 0;
  const levels: string[] = [];
  if (userLevel >= ROLE_LEVELS.contributor) levels.push("contributor");
  if (userLevel >= ROLE_LEVELS.manager) levels.push("manager");
  if (userLevel >= ROLE_LEVELS.admin) levels.push("admin");
  return levels;
}

export const reflectionsRouter = router({
  list: domainScopedProcedure.input(reflectionFilterSchema).query(async ({ input, ctx }) => {
    const db = getDb();
    const { page, pageSize, personId, category, sortOrder } = input;
    const offset = (page - 1) * pageSize;

    const visibleLevels = getVisibleLevels(ctx.user.role);

    const conditions: ReturnType<typeof eq>[] = [];
    if (personId) conditions.push(eq(reflections.personId, personId));
    if (category) conditions.push(eq(reflections.category, category));
    // Visibility filtering: show only reflections whose visibilityLevel the user can see
    conditions.push(inArray(reflections.visibilityLevel, visibleLevels as any));

    const where = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: reflections.id,
          personId: reflections.personId,
          category: reflections.category,
          content: reflections.content,
          confidenceLevel: reflections.confidenceLevel,
          confidenceBasis: reflections.confidenceBasis,
          linkedInteractionId: reflections.linkedInteractionId,
          linkedOpportunity: reflections.linkedOpportunity,
          visibilityLevel: reflections.visibilityLevel,
          createdAt: reflections.createdAt,
          personName: persons.name,
          authorName: users.name,
        })
        .from(reflections)
        .leftJoin(persons, eq(reflections.personId, persons.id))
        .leftJoin(users, eq(reflections.authorId, users.id))
        .where(where)
        .orderBy(sortOrder === "asc" ? asc(reflections.createdAt) : desc(reflections.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(reflections).where(where),
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
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const [reflection] = await db
        .select({
          id: reflections.id,
          personId: reflections.personId,
          category: reflections.category,
          content: reflections.content,
          confidenceLevel: reflections.confidenceLevel,
          confidenceBasis: reflections.confidenceBasis,
          linkedInteractionId: reflections.linkedInteractionId,
          linkedOpportunity: reflections.linkedOpportunity,
          visibilityLevel: reflections.visibilityLevel,
          createdAt: reflections.createdAt,
          updatedAt: reflections.updatedAt,
          personName: persons.name,
          authorName: users.name,
        })
        .from(reflections)
        .leftJoin(persons, eq(reflections.personId, persons.id))
        .leftJoin(users, eq(reflections.authorId, users.id))
        .where(eq(reflections.id, input.id))
        .limit(1);

      if (!reflection)
        throw new TRPCError({ code: "NOT_FOUND", message: "Reflection not found" });

      // Visibility check
      const visibleLevels = getVisibleLevels(ctx.user.role);
      if (!visibleLevels.includes(reflection.visibilityLevel)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this reflection" });
      }

      return reflection;
    }),

  create: contributorProcedure.input(createReflectionSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const reflectionId = crypto.randomUUID();

    await db
      .insert(reflections)
      .values({
        ...input,
        id: reflectionId,
        authorId: ctx.user.id,
      });

    const [reflection] = await db
      .select()
      .from(reflections)
      .where(eq(reflections.id, reflectionId))
      .limit(1);

    if (!reflection) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Reflection could not be created" });
    }

    logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "reflection",
      entityId: reflection.id,
      newValue: JSON.stringify(input),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    await recordEntityProvenance({
      entityType: "reflection",
      entityId: reflection.id,
      capturedBy: ctx.user.id,
      inputMethod: input.inputMethod ?? null,
    });

    return reflection;
  }),

  update: contributorProcedure.input(updateReflectionSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const { id, ...data } = input;

    const [existing] = await db
      .select()
      .from(reflections)
      .where(eq(reflections.id, id))
      .limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Reflection not found" });

    await db
      .update(reflections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(reflections.id, id));

    const [updated] = await db
      .select()
      .from(reflections)
      .where(eq(reflections.id, id))
      .limit(1);

    if (!updated) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Reflection could not be updated" });
    }

    logAudit({
      userId: ctx.user.id,
      actionType: "update",
      entityType: "reflection",
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
        .from(reflections)
        .where(eq(reflections.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Reflection not found" });

      await db.delete(reflections).where(eq(reflections.id, input.id));

      logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "reflection",
        entityId: input.id,
        oldValue: JSON.stringify(existing),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return { success: true };
    }),
});
