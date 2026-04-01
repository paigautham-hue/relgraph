import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { inviteUserSchema, updateUserSchema, paginationSchema } from "@shared/validation";
import { getDb } from "../db";
import { users, userDomainAccess } from "../db/schema";
import { eq, and, like, desc, asc, count } from "drizzle-orm";
import { hashPassword } from "../services/auth.service";
import { logAudit, getClientIp } from "../middleware/audit";
import { TRPCError } from "@trpc/server";

const userFilterSchema = paginationSchema.extend({
  search: z.string().optional(),
  role: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const adminRouter = router({
  listUsers: adminProcedure.input(userFilterSchema).query(async ({ input }) => {
    const db = getDb();
    const { page, pageSize, search, role, isActive, sortOrder } = input;
    const offset = (page - 1) * pageSize;

    const conditions: ReturnType<typeof eq>[] = [];
    if (search) conditions.push(like(users.name, `%${search}%`));
    if (role) conditions.push(eq(users.role, role as any));
    if (isActive !== undefined) conditions.push(eq(users.isActive, isActive));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [data, [{ total }]] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          avatarUrl: users.avatarUrl,
          isActive: users.isActive,
          lastActiveAt: users.lastActiveAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(where)
        .orderBy(sortOrder === "asc" ? asc(users.name) : desc(users.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ total: count() }).from(users).where(where),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }),

  getUser: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          avatarUrl: users.avatarUrl,
          isActive: users.isActive,
          lastActiveAt: users.lastActiveAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.id, input.id))
        .limit(1);

      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      // Fetch domain access
      const domainAccessRows = await db
        .select({ domainId: userDomainAccess.domainId })
        .from(userDomainAccess)
        .where(eq(userDomainAccess.userId, input.id));

      return {
        ...user,
        domainIds: domainAccessRows.map((r) => r.domainId),
      };
    }),

  inviteUser: adminProcedure.input(inviteUserSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();

    // Check if email already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (existingUser) {
      throw new TRPCError({ code: "CONFLICT", message: "A user with this email already exists" });
    }

    const passwordHash = await hashPassword(input.password);

    const [newUser] = await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        role: input.role as any,
        passwordHash,
        invitedBy: ctx.user.id,
      })
      .returning();

    // Set domain access
    if (input.domainIds.length > 0) {
      await db.insert(userDomainAccess).values(
        input.domainIds.map((domainId) => ({
          userId: newUser.id,
          domainId,
        })),
      );
    }

    logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "user",
      entityId: newUser.id,
      newValue: JSON.stringify({ email: input.email, name: input.name, role: input.role }),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
    };
  }),

  updateUser: adminProcedure.input(updateUserSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const { id, domainIds, ...data } = input;

    const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

    // Update user fields
    if (Object.keys(data).length > 0) {
      await db
        .update(users)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(eq(users.id, id));
    }

    // Update domain access if provided
    if (domainIds !== undefined) {
      await db.delete(userDomainAccess).where(eq(userDomainAccess.userId, id));
      if (domainIds.length > 0) {
        await db.insert(userDomainAccess).values(
          domainIds.map((domainId) => ({
            userId: id,
            domainId,
          })),
        );
      }
    }

    logAudit({
      userId: ctx.user.id,
      actionType: "update",
      entityType: "user",
      entityId: id,
      oldValue: JSON.stringify(existing),
      newValue: JSON.stringify(input),
      ipAddress: getClientIp(ctx.req),
      userAgent: ctx.req.headers["user-agent"] as string,
    });

    return { success: true };
  }),

  deactivateUser: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      // Prevent self-deactivation
      if (input.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot deactivate your own account" });
      }

      const [existing] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      await db
        .update(users)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(users.id, input.id));

      logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "user",
        entityId: input.id,
        oldValue: JSON.stringify({ isActive: true }),
        newValue: JSON.stringify({ isActive: false }),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return { success: true };
    }),
});
