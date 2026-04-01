import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { auditFilterSchema } from "@shared/validation";
import { getDb } from "../db";
import { auditLog, users } from "../db/schema";
import { eq, and, desc, asc, count, gte, lte, like } from "drizzle-orm";

export const auditRouter = router({
  list: adminProcedure.input(auditFilterSchema).query(async ({ input }) => {
    const db = getDb();
    const {
      page,
      pageSize,
      userId,
      actionType,
      entityType,
      entityId,
      email,
      outcome,
      authOnly,
      startDate,
      endDate,
      sortOrder,
    } = input;
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (userId) conditions.push(eq(auditLog.userId, userId));
    if (actionType) conditions.push(eq(auditLog.actionType, actionType as any));
    if (entityType) conditions.push(eq(auditLog.entityType, entityType as any));
    if (entityId) conditions.push(eq(auditLog.entityId, entityId));
    if (email) conditions.push(like(users.email, `%${email}%`));
    if (outcome) conditions.push(like(auditLog.newValue, `%\"outcome\":\"${outcome}\"%`));
    if (authOnly) conditions.push(like(auditLog.fieldName, "auth.%"));
    if (startDate) conditions.push(gte(auditLog.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(auditLog.createdAt, new Date(endDate)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: auditLog.id,
          userId: auditLog.userId,
          actionType: auditLog.actionType,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          fieldName: auditLog.fieldName,
          oldValue: auditLog.oldValue,
          newValue: auditLog.newValue,
          ipAddress: auditLog.ipAddress,
          createdAt: auditLog.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.userId, users.id))
        .where(where)
        .orderBy(sortOrder === "asc" ? asc(auditLog.createdAt) : desc(auditLog.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(auditLog).where(where),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }),

  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [entry] = await db
        .select({
          id: auditLog.id,
          userId: auditLog.userId,
          actionType: auditLog.actionType,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          fieldName: auditLog.fieldName,
          oldValue: auditLog.oldValue,
          newValue: auditLog.newValue,
          inputMethod: auditLog.inputMethod,
          rawInputText: auditLog.rawInputText,
          ipAddress: auditLog.ipAddress,
          userAgent: auditLog.userAgent,
          metadata: auditLog.metadata,
          createdAt: auditLog.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.userId, users.id))
        .where(eq(auditLog.id, input.id))
        .limit(1);

      if (!entry) {
        const { TRPCError } = await import("@trpc/server");
        throw new TRPCError({ code: "NOT_FOUND", message: "Audit entry not found" });
      }
      return entry;
    }),
});
