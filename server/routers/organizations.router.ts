import { z } from "zod";
import { router, domainScopedProcedure, contributorProcedure } from "../_core/trpc";
import { createOrganizationSchema, updateOrganizationSchema, paginationSchema } from "@shared/validation";
import { getDb } from "../db";
import { organizations, domains } from "../db/schema";
import { eq, and, like, desc, asc, count, inArray } from "drizzle-orm";
import { logAudit, getClientIp } from "../middleware/audit";
import { TRPCError } from "@trpc/server";

const orgFilterSchema = paginationSchema.extend({
  search: z.string().optional(),
  domainId: z.string().uuid().optional(),
  type: z.string().optional(),
});

export const organizationsRouter = router({
  list: domainScopedProcedure.input(orgFilterSchema).query(async ({ input, ctx }) => {
    const db = getDb();
    const { page, pageSize, search, domainId, type, sortOrder } = input;
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];

    if (ctx.accessibleDomainIds) {
      conditions.push(inArray(organizations.domainId, ctx.accessibleDomainIds));
    }
    if (search) {
      conditions.push(like(organizations.name, `%${search}%`));
    }
    if (domainId) {
      conditions.push(eq(organizations.domainId, domainId));
    }
    if (type) {
      conditions.push(eq(organizations.type, type as any));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: organizations.id,
          name: organizations.name,
          shortName: organizations.shortName,
          domainId: organizations.domainId,
          type: organizations.type,
          city: organizations.city,
          website: organizations.website,
          createdAt: organizations.createdAt,
          domainName: domains.name,
          domainColor: domains.color,
        })
        .from(organizations)
        .leftJoin(domains, eq(organizations.domainId, domains.id))
        .where(where)
        .orderBy(sortOrder === "asc" ? asc(organizations.name) : desc(organizations.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(organizations).where(where),
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
      const [org] = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          shortName: organizations.shortName,
          domainId: organizations.domainId,
          type: organizations.type,
          city: organizations.city,
          website: organizations.website,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
          domainName: domains.name,
          domainColor: domains.color,
        })
        .from(organizations)
        .leftJoin(domains, eq(organizations.domainId, domains.id))
        .where(eq(organizations.id, input.id))
        .limit(1);

      if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      return org;
    }),

  create: contributorProcedure.input(createOrganizationSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const orgId = crypto.randomUUID();

    await db.insert(organizations).values({
      id: orgId,
      ...input,
    });

    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Organization could not be created" });
    }

    logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "organization",
      entityId: org.id,
      newValue: JSON.stringify(input),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return org;
  }),

  update: contributorProcedure.input(updateOrganizationSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const { id, ...data } = input;

    const [existing] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });

    await db
      .update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id));

    const [updated] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    if (!updated) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Organization could not be updated" });
    }

    logAudit({
      userId: ctx.user.id,
      actionType: "update",
      entityType: "organization",
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
        .from(organizations)
        .where(eq(organizations.id, input.id))
        .limit(1);
      if (!existing)
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });

      await db.delete(organizations).where(eq(organizations.id, input.id));

      logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "organization",
        entityId: input.id,
        oldValue: JSON.stringify(existing),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return { success: true };
    }),
});
