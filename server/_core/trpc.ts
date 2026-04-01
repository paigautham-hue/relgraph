import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { ROLE_LEVELS, type UserRole } from '@shared/enums';
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { getDb } from "../db";
import { userDomainAccess } from "../db/schema";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

// Require any authenticated user
const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

// Require minimum role level
function requireRole(minRole: UserRole) {
  return t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    const userLevel = ROLE_LEVELS[ctx.user.role as UserRole] ?? 0;
    const requiredLevel = ROLE_LEVELS[minRole];
    if (userLevel < requiredLevel) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Requires ${minRole} role or higher` });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

// Load domain IDs the user has access to
const loadDomainAccess = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const userLevel = ROLE_LEVELS[ctx.user.role as UserRole] ?? 0;

  // Admins and super_admins see all domains
  let accessibleDomainIds: string[] | null = null; // null means all domains
  if (userLevel < ROLE_LEVELS.admin) {
    const db = getDb();
    const access = await db.select({ domainId: userDomainAccess.domainId })
      .from(userDomainAccess)
      .where(eq(userDomainAccess.userId, ctx.user.id));
    accessibleDomainIds = access.map(a => a.domainId);
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      accessibleDomainIds,
    },
  });
});

// Procedure levels
export const contributorProcedure = t.procedure.use(requireRole('contributor'));
export const managerProcedure = t.procedure.use(requireRole('manager'));
export const adminProcedure = t.procedure.use(requireRole('admin'));
export const superAdminProcedure = t.procedure.use(requireRole('super_admin'));

// Domain-scoped procedure (loads accessible domain IDs into context)
export const domainScopedProcedure = t.procedure.use(requireUser).use(loadDomainAccess);
