import { z } from "zod";
import { router, domainScopedProcedure, contributorProcedure } from "../_core/trpc";
import { createPersonSchema, updatePersonSchema, personFilterSchema } from "@shared/validation";
import { getDb } from "../db";
import { persons, organizations, domains } from "../db/schema";
import { eq, and, like, desc, asc, count, inArray } from "drizzle-orm";
import { logAudit, getClientIp } from "../middleware/audit";
import { TRPCError } from "@trpc/server";

export const personsRouter = router({
  list: domainScopedProcedure.input(personFilterSchema).query(async ({ input, ctx }) => {
    const db = getDb();
    const { page, pageSize, search, domainId, category, isTracked, orgId, sortOrder } = input;
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (ctx.accessibleDomainIds) {
      conditions.push(inArray(organizations.domainId, ctx.accessibleDomainIds));
    }
    if (search) {
      conditions.push(like(persons.name, `%${search}%`));
    }
    if (category) {
      conditions.push(eq(persons.category, category));
    }
    if (isTracked !== undefined) {
      conditions.push(eq(persons.isTracked, isTracked));
    }
    if (orgId) {
      conditions.push(eq(persons.currentOrgId, orgId));
    }
    if (domainId) {
      conditions.push(eq(organizations.domainId, domainId));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: persons.id,
          name: persons.name,
          currentTitle: persons.currentTitle,
          category: persons.category,
          photoUrl: persons.photoUrl,
          isTracked: persons.isTracked,
          currentOrgId: persons.currentOrgId,
          createdAt: persons.createdAt,
          orgName: organizations.name,
          domainName: domains.name,
          domainColor: domains.color,
        })
        .from(persons)
        .leftJoin(organizations, eq(persons.currentOrgId, organizations.id))
        .leftJoin(domains, eq(organizations.domainId, domains.id))
        .where(where)
        .orderBy(sortOrder === "asc" ? asc(persons.name) : desc(persons.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(persons)
        .leftJoin(organizations, eq(persons.currentOrgId, organizations.id))
        .where(where),
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
      const [person] = await db
        .select({
          id: persons.id,
          name: persons.name,
          currentTitle: persons.currentTitle,
          currentOrgId: persons.currentOrgId,
          category: persons.category,
          photoUrl: persons.photoUrl,
          isTracked: persons.isTracked,
          createdAt: persons.createdAt,
          updatedAt: persons.updatedAt,
          orgName: organizations.name,
          domainName: domains.name,
          domainColor: domains.color,
        })
        .from(persons)
        .leftJoin(organizations, eq(persons.currentOrgId, organizations.id))
        .leftJoin(domains, eq(organizations.domainId, domains.id))
        .where(eq(persons.id, input.id))
        .limit(1);

      if (!person) throw new TRPCError({ code: "NOT_FOUND", message: "Person not found" });
      return person;
    }),

  create: contributorProcedure.input(createPersonSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const [person] = await db
      .insert(persons)
      .values({
        ...input,
        createdBy: ctx.user.id,
      })
      .returning();

    logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "person",
      entityId: person.id,
      newValue: JSON.stringify(input),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return person;
  }),

  update: contributorProcedure.input(updatePersonSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const { id, ...data } = input;

    const [existing] = await db.select().from(persons).where(eq(persons.id, id)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Person not found" });

    const [updated] = await db
      .update(persons)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(persons.id, id))
      .returning();

    logAudit({
      userId: ctx.user.id,
      actionType: "update",
      entityType: "person",
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
      const [existing] = await db.select().from(persons).where(eq(persons.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Person not found" });

      await db.delete(persons).where(eq(persons.id, input.id));

      logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "person",
        entityId: input.id,
        oldValue: JSON.stringify(existing),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return { success: true };
    }),
});
