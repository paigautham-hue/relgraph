import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { createDomainSchema, updateDomainSchema } from "@shared/validation";
import { getDb } from "../db";
import { domains } from "../db/schema";
import { eq, desc, asc, count } from "drizzle-orm";
import { logAudit, getClientIp } from "../middleware/audit";
import { TRPCError } from "@trpc/server";

export const domainsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = getDb();
    const data = await db
      .select({
        id: domains.id,
        name: domains.name,
        description: domains.description,
        color: domains.color,
        isActive: domains.isActive,
        createdAt: domains.createdAt,
      })
      .from(domains)
      .orderBy(asc(domains.name));

    return data;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [domain] = await db
        .select()
        .from(domains)
        .where(eq(domains.id, input.id))
        .limit(1);

      if (!domain) throw new TRPCError({ code: "NOT_FOUND", message: "Domain not found" });
      return domain;
    }),

  create: adminProcedure.input(createDomainSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const [domain] = await db.insert(domains).values(input).returning();

    logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "domain",
      entityId: domain.id,
      newValue: JSON.stringify(input),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return domain;
  }),

  update: adminProcedure.input(updateDomainSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const { id, ...data } = input;

    const [existing] = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Domain not found" });

    const [updated] = await db
      .update(domains)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(domains.id, id))
      .returning();

    logAudit({
      userId: ctx.user.id,
      actionType: "update",
      entityType: "domain",
      entityId: id,
      oldValue: JSON.stringify(existing),
      newValue: JSON.stringify(data),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return updated;
  }),
});
