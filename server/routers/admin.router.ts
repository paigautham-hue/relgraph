import { z } from "zod";
import { eq } from "drizzle-orm";
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
  updateContactImportTemplateConfigSchema,
} from "@shared/validation";
import { getDb } from "../db";
import { users, userDomainAccess } from "../db/schema";
import {
  ACCESS_REQUEST_LOGIN_METHOD,
  createUser,
  getAccessRequestByEmail,
  getPendingRegistrationByEmail,
  getUserByEmail,
  getUserById,
  listManagedUsers,
  listUsersByLoginMethod,
  normalizeEmail,
  PENDING_ALLOWLIST_LOGIN_METHOD,
  RESERVED_SUPER_ADMIN_EMAIL,
  updateManagedUserProfile,
  updateManagedUserStatus,
} from "../services/auth.service";
import {
  getContactImportTemplateFieldLibrary,
  getContactImportTemplatePayload,
  getStoredContactImportTemplateConfig,
} from "../services/contact-import.service";
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
    const { page, pageSize, search, role, isActive, sortOrder } = input;
    const offset = (page - 1) * pageSize;

    const rows = await listManagedUsers({
      search,
      role,
      isActive,
      sortOrder,
    });

    const data = rows.slice(offset, offset + pageSize).map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      avatarUrl: row.avatarUrl,
      isActive: row.isActive,
      lastActiveAt: row.lastActiveAt,
      createdAt: row.createdAt,
    }));
    const total = rows.length;

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }),

  getContactImportTemplateConfig: adminProcedure.query(async () => {
    const stored = await getStoredContactImportTemplateConfig();
    const template = await getContactImportTemplatePayload(stored.categories);

    return {
      ...stored,
      headers: template.headers,
      columns: template.columns,
      fieldLibrary: getContactImportTemplateFieldLibrary(),
    };
  }),

  updateContactImportTemplateConfig: adminProcedure
    .input(updateContactImportTemplateConfigSchema)
    .mutation(async ({ input, ctx }) => {
      const previous = await getStoredContactImportTemplateConfig();
      const template = await getContactImportTemplatePayload(input.categories);

      await logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "person",
        fieldName: "contact_import.template_config",
        oldValue: JSON.stringify({
          templateVersion: previous.templateVersion,
          categories: previous.categories,
        }),
        newValue: JSON.stringify({
          templateVersion: input.templateVersion,
          categories: input.categories,
        }),
        inputMethod: "system",
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers["user-agent"] as string,
        metadata: {
          templateVersion: input.templateVersion,
          headerCount: template.headers.length,
        },
      });

      return {
        success: true,
        templateVersion: input.templateVersion,
        categories: input.categories,
        headers: template.headers,
        columns: template.columns,
        fieldLibrary: getContactImportTemplateFieldLibrary(),
      };
    }),

  getUser: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = getDb();
      const user = await getUserById(input.id);

      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      const domainAccessRows = await db
        .select({ domainId: userDomainAccess.domainId })
        .from(userDomainAccess)
        .where(eq(userDomainAccess.userId, input.id));

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        isActive: user.isActive,
        lastActiveAt: user.lastActiveAt,
        createdAt: user.createdAt,
        domainIds: domainAccessRows.map((r) => r.domainId),
      };
    }),

  listRegistrationAllowlist: adminProcedure.query(async () => {
    const rows = await listUsersByLoginMethod(PENDING_ALLOWLIST_LOGIN_METHOD, { sortByCreatedAt: "asc" });

    return rows
      .slice()
      .sort((left, right) => left.email.localeCompare(right.email))
      .map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role,
        invitedBy: row.invitedBy,
        createdAt: row.createdAt,
      }));
  }),

  listAccessRequests: adminProcedure.query(async () => {
    const rows = await listUsersByLoginMethod(ACCESS_REQUEST_LOGIN_METHOD, { sortByCreatedAt: "desc" });

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
      createdAt: row.createdAt,
    }));
  }),

  approveAccessRequest: adminProcedure
    .input(allowlistEmailSchema)
    .mutation(async ({ input, ctx }) => {
      const email = normalizeEmail(input.email);
      requireSuperAdminForReservedIdentity(email, ctx.user.role);
      requireSuperAdminForSuperAdminRole(input.role, ctx.user.role);

      const requestUser = await getAccessRequestByEmail(email);
      if (!requestUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Access request not found" });
      }

      const updated = await updateManagedUserStatus(requestUser.id, {
        role: input.role,
        invitedBy: ctx.user.id,
        loginMethod: PENDING_ALLOWLIST_LOGIN_METHOD,
        isActive: true,
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
      const approved: Array<{ id: string; email: string; role: string; invitedBy: string | null }> = [];

      for (const request of input.requests) {
        const email = normalizeEmail(request.email);
        requireSuperAdminForReservedIdentity(email, ctx.user.role);
        requireSuperAdminForSuperAdminRole(request.role, ctx.user.role);

        const requestUser = await getAccessRequestByEmail(email);
        if (!requestUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Access request not found for ${email}` });
        }

        const updatedUser = await updateManagedUserStatus(requestUser.id, {
          role: request.role,
          invitedBy: ctx.user.id,
          loginMethod: PENDING_ALLOWLIST_LOGIN_METHOD,
          isActive: true,
        });

        const updated = {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role,
          invitedBy: updatedUser.invitedBy,
        };

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

      const existingUser = await getPendingRegistrationByEmail(email);
      const existingAccount = await getUserByEmail(email);

      if (existingAccount && existingAccount.loginMethod !== PENDING_ALLOWLIST_LOGIN_METHOD) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with this email already exists",
        });
      }

      if (existingUser) {
        const updated = await updateManagedUserStatus(existingUser.id, {
          role: input.role,
          invitedBy: ctx.user.id,
          loginMethod: PENDING_ALLOWLIST_LOGIN_METHOD,
          isActive: true,
        });

        return {
          id: updated.id,
          email: updated.email,
          role: updated.role,
          invitedBy: updated.invitedBy,
        };
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
    const existingUser = await getUserByEmail(email);

    if (existingUser) {
      throw new TRPCError({ code: "CONFLICT", message: "A user with this email already exists" });
    }

    const newUser = await createUser({
      email,
      name: input.name,
      password: input.password,
      role: input.role,
      invitedBy: ctx.user.id,
      loginMethod: "password",
      isActive: true,
    });

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

    const existing = await getUserById(id);
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
      await updateManagedUserProfile(id, data);
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
      if (input.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot deactivate your own account" });
      }

      const existing = await getUserById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      requireSuperAdminForReservedIdentity(existing.email, ctx.user.role);
      if (existing.role === "super_admin") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The reserved super-admin account cannot be deactivated",
        });
      }

      await updateManagedUserProfile(input.id, { isActive: false });

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
