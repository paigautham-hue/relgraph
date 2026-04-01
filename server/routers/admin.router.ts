import { z } from "zod";
import { and, asc, count, desc, eq, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import {
  inviteUserSchema,
  updateUserSchema,
  paginationSchema,
  allowlistEmailSchema,
  removeAllowlistEmailSchema,
  bulkAccessRequestApprovalSchema,
  bulkAccessRequestDenialSchema,
} from "@shared/validation";
import { getDb } from "../db";
import { users, userDomainAccess } from "../db/schema";
import {
  ACCESS_REQUEST_LOGIN_METHOD,
  createUser,
  getAccessRequestByEmail,
  getPendingRegistrationByEmail,
  hashPassword,
  normalizeEmail,
  PENDING_ALLOWLIST_LOGIN_METHOD,
  RESERVED_SUPER_ADMIN_EMAIL,
} from "../services/auth.service";
import { logAudit, getClientIp } from "../middleware/audit";

const userFilterSchema = paginationSchema.extend({
  search: z.string().optional(),
  role: z.string().optional(),
  isActive: z.boolean().optional(),
});

function requireSuperAdminForReservedIdentity(targetEmail: string, actorRole: string) {
  const normalizedEmail = normalizeEmail(targetEmail);
  if (normalizedEmail === RESERVED_SUPER_ADMIN_EMAIL && actorRole !== "super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the super admin can modify the reserved super-admin account",
    });
  }
}

function requireSuperAdminForSuperAdminRole(targetRole: string | undefined, actorRole: string) {
  if (targetRole === "super_admin" && actorRole !== "super_admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the super admin can assign the super_admin role",
    });
  }
}

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

      const domainAccessRows = await db
        .select({ domainId: userDomainAccess.domainId })
        .from(userDomainAccess)
        .where(eq(userDomainAccess.userId, input.id));

      return {
        ...user,
        domainIds: domainAccessRows.map((r) => r.domainId),
      };
    }),

  listRegistrationAllowlist: adminProcedure.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        invitedBy: users.invitedBy,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.loginMethod, PENDING_ALLOWLIST_LOGIN_METHOD))
      .orderBy(asc(users.email));

    return rows;
  }),

  listAccessRequests: adminProcedure.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.loginMethod, ACCESS_REQUEST_LOGIN_METHOD))
      .orderBy(desc(users.createdAt));

    return rows;
  }),

  approveAccessRequest: adminProcedure
    .input(allowlistEmailSchema)
    .mutation(async ({ input, ctx }) => {
      const email = normalizeEmail(input.email);
      requireSuperAdminForReservedIdentity(email, ctx.user.role);
      requireSuperAdminForSuperAdminRole(input.role, ctx.user.role);

      const db = getDb();
      const requestUser = await getAccessRequestByEmail(email);
      if (!requestUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Access request not found" });
      }

      const [updated] = await db
        .update(users)
        .set({
          role: input.role as any,
          invitedBy: ctx.user.id,
          loginMethod: PENDING_ALLOWLIST_LOGIN_METHOD,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, requestUser.id))
        .returning({
          id: users.id,
          email: users.email,
          role: users.role,
          invitedBy: users.invitedBy,
        });

      logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "user",
        entityId: requestUser.id,
        fieldName: "auth.access_request_approved",
        oldValue: JSON.stringify({ email: requestUser.email, status: "access_requested" }),
        newValue: JSON.stringify({ email: requestUser.email, role: input.role, status: "registration_approved", outcome: "approved" }),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return updated;
    }),

  denyAccessRequest: adminProcedure
    .input(removeAllowlistEmailSchema)
    .mutation(async ({ input, ctx }) => {
      const email = normalizeEmail(input.email);
      requireSuperAdminForReservedIdentity(email, ctx.user.role);

      const db = getDb();
      const requestUser = await getAccessRequestByEmail(email);
      if (!requestUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Access request not found" });
      }

      await db.delete(users).where(eq(users.id, requestUser.id));

      logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "user",
        entityId: requestUser.id,
        fieldName: "auth.access_request_denied",
        oldValue: JSON.stringify({ email: requestUser.email, status: "access_requested" }),
        newValue: JSON.stringify({ email: requestUser.email, status: "access_denied", outcome: "denied" }),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return { success: true };
    }),

  bulkApproveAccessRequests: adminProcedure
    .input(bulkAccessRequestApprovalSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const approved: Array<{ id: string; email: string; role: string; invitedBy: string | null }> = [];

      for (const request of input.requests) {
        const email = normalizeEmail(request.email);
        requireSuperAdminForReservedIdentity(email, ctx.user.role);
        requireSuperAdminForSuperAdminRole(request.role, ctx.user.role);

        const requestUser = await getAccessRequestByEmail(email);
        if (!requestUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Access request not found for ${email}` });
        }

        const [updated] = await db
          .update(users)
          .set({
            role: request.role as any,
            invitedBy: ctx.user.id,
            loginMethod: PENDING_ALLOWLIST_LOGIN_METHOD,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, requestUser.id))
          .returning({
            id: users.id,
            email: users.email,
            role: users.role,
            invitedBy: users.invitedBy,
          });

        logAudit({
          userId: ctx.user.id,
          actionType: "update",
          entityType: "user",
          entityId: requestUser.id,
          fieldName: "auth.access_request_approved",
          oldValue: JSON.stringify({ email: requestUser.email, status: "access_requested" }),
          newValue: JSON.stringify({
            email: requestUser.email,
            role: request.role,
            status: "registration_approved",
            outcome: "approved",
            bulk: true,
          }),
          ipAddress: getClientIp(ctx.req),
          userAgent: ctx.req.headers["user-agent"] as string,
        });

        approved.push(updated);
      }

      return { success: true, count: approved.length, data: approved };
    }),

  bulkDenyAccessRequests: adminProcedure
    .input(bulkAccessRequestDenialSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const denied: string[] = [];

      for (const requestedEmail of input.emails) {
        const email = normalizeEmail(requestedEmail);
        requireSuperAdminForReservedIdentity(email, ctx.user.role);

        const requestUser = await getAccessRequestByEmail(email);
        if (!requestUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Access request not found for ${email}` });
        }

        await db.delete(users).where(eq(users.id, requestUser.id));

        logAudit({
          userId: ctx.user.id,
          actionType: "delete",
          entityType: "user",
          entityId: requestUser.id,
          fieldName: "auth.access_request_denied",
          oldValue: JSON.stringify({ email: requestUser.email, status: "access_requested" }),
          newValue: JSON.stringify({ email: requestUser.email, status: "access_denied", outcome: "denied", bulk: true }),
          ipAddress: getClientIp(ctx.req),
          userAgent: ctx.req.headers["user-agent"] as string,
        });

        denied.push(email);
      }

      return { success: true, count: denied.length, emails: denied };
    }),

  addRegistrationAllowlistEmail: adminProcedure
    .input(allowlistEmailSchema)
    .mutation(async ({ input, ctx }) => {
      const email = normalizeEmail(input.email);
      requireSuperAdminForReservedIdentity(email, ctx.user.role);
      requireSuperAdminForSuperAdminRole(input.role, ctx.user.role);

      const db = getDb();
      const [existingUser] = await db
        .select({ id: users.id, loginMethod: users.loginMethod })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existingUser && existingUser.loginMethod !== PENDING_ALLOWLIST_LOGIN_METHOD) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with this email already exists",
        });
      }

      if (existingUser) {
        const [updated] = await db
          .update(users)
          .set({ role: input.role as any, invitedBy: ctx.user.id, updatedAt: new Date() })
          .where(eq(users.id, existingUser.id))
          .returning({
            id: users.id,
            email: users.email,
            role: users.role,
            invitedBy: users.invitedBy,
          });

        return updated;
      }

      const created = await createUser({
        email,
        name: email,
        role: input.role,
        loginMethod: PENDING_ALLOWLIST_LOGIN_METHOD,
        invitedBy: ctx.user.id,
        isActive: true,
      });

      logAudit({
        userId: ctx.user.id,
        actionType: "create",
        entityType: "user",
        entityId: created.id,
        newValue: JSON.stringify({ email: created.email, role: created.role, registrationApproved: true }),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return {
        id: created.id,
        email: created.email,
        role: created.role,
        invitedBy: created.invitedBy,
      };
    }),

  removeRegistrationAllowlistEmail: adminProcedure
    .input(removeAllowlistEmailSchema)
    .mutation(async ({ input, ctx }) => {
      const email = normalizeEmail(input.email);
      requireSuperAdminForReservedIdentity(email, ctx.user.role);

      const db = getDb();
      const pendingUser = await getPendingRegistrationByEmail(email);
      if (!pendingUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Allowlisted email not found" });
      }

      await db.delete(users).where(eq(users.id, pendingUser.id));

      logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "user",
        entityId: pendingUser.id,
        oldValue: JSON.stringify({ email: pendingUser.email, role: pendingUser.role, registrationApproved: true }),
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
      });

      return { success: true };
    }),

  inviteUser: adminProcedure.input(inviteUserSchema).mutation(async ({ input, ctx }) => {
    const email = normalizeEmail(input.email);
    requireSuperAdminForReservedIdentity(email, ctx.user.role);
    requireSuperAdminForSuperAdminRole(input.role, ctx.user.role);

    const db = getDb();
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser) {
      throw new TRPCError({ code: "CONFLICT", message: "A user with this email already exists" });
    }

    const passwordHash = await hashPassword(input.password);

    const [newUser] = await db
      .insert(users)
      .values({
        email,
        name: input.name,
        role: input.role as any,
        passwordHash,
        invitedBy: ctx.user.id,
        loginMethod: "password",
      })
      .returning();

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
      newValue: JSON.stringify({ email: newUser.email, name: newUser.name, role: newUser.role }),
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

    requireSuperAdminForReservedIdentity(existing.email, ctx.user.role);
    requireSuperAdminForSuperAdminRole(data.role, ctx.user.role);

    if (existing.role === "super_admin" && data.role && data.role !== "super_admin") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The reserved super-admin role cannot be downgraded through this action",
      });
    }

    if (Object.keys(data).length > 0) {
      await db
        .update(users)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(eq(users.id, id));
    }

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

      if (input.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot deactivate your own account" });
      }

      const [existing] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      requireSuperAdminForReservedIdentity(existing.email, ctx.user.role);
      if (existing.role === "super_admin") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The reserved super-admin account cannot be deactivated",
        });
      }

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
