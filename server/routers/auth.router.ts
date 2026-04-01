import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { loginSchema, changePasswordSchema, registerSchema } from "@shared/validation";
import { RELGRAPH_SESSION_COOKIE, RELGRAPH_REFRESH_COOKIE } from "@shared/constants";
import {
  loginUser,
  getUserByEmail,
  getUserById,
  verifyPassword,
  hashPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  isEmailApprovedForRegistration,
  normalizeEmail,
  createUser,
  RESERVED_SUPER_ADMIN_EMAIL,
} from "../services/auth.service";
import { getDb } from "../db";
import { users } from "../db/schema";
import { getSessionCookieOptions } from "../_core/cookies";

async function issueSessionCookies(ctx: { req: any; res: any }, user: { id: string; email: string; role: string; name: string }) {
  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    }),
    generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    }),
  ]);

  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.cookie(RELGRAPH_SESSION_COOKIE, accessToken, {
    ...cookieOptions,
    maxAge: 86_400_000,
  });
  ctx.res.cookie(RELGRAPH_REFRESH_COOKIE, refreshToken, {
    ...cookieOptions,
    maxAge: 604_800_000,
  });
}

export const authRouter = router({
  login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
    const result = await loginUser(input.email, input.password);
    if (!result) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
    }

    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.cookie(RELGRAPH_SESSION_COOKIE, result.accessToken, {
      ...cookieOptions,
      maxAge: 86_400_000,
    });
    ctx.res.cookie(RELGRAPH_REFRESH_COOKIE, result.refreshToken, {
      ...cookieOptions,
      maxAge: 604_800_000,
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        avatarUrl: result.user.avatarUrl,
      },
    };
  }),

  register: publicProcedure.input(registerSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const email = normalizeEmail(input.email);
    const approved = await isEmailApprovedForRegistration(email);

    if (!approved) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "This email has not been approved for registration yet. Please ask an admin to add it first.",
      });
    }

    let user = await getUserByEmail(email);

    if (user && user.passwordHash && user.loginMethod !== "allowlist_pending") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "An account with this email already exists. Please sign in instead.",
      });
    }

    const passwordHash = await hashPassword(input.password);

    if (user) {
      const [updatedUser] = await db
        .update(users)
        .set({
          name: input.name.trim(),
          passwordHash,
          loginMethod: "password",
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id))
        .returning();

      user = updatedUser ?? user;
    } else {
      user = await createUser({
        email,
        name: input.name.trim(),
        password: input.password,
        role: email === RESERVED_SUPER_ADMIN_EMAIL ? "super_admin" : "viewer",
        loginMethod: "password",
        isActive: true,
      });
    }

    await issueSessionCookies(ctx, {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
    };
  }),

  me: protectedProcedure.query(({ ctx }) => {
    return {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      role: ctx.user.role,
      avatarUrl: ctx.user.avatarUrl,
    };
  }),

  logout: protectedProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(RELGRAPH_SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
    ctx.res.clearCookie(RELGRAPH_REFRESH_COOKIE, { ...cookieOptions, maxAge: -1 });
    return { success: true };
  }),

  refresh: publicProcedure.mutation(async ({ ctx }) => {
    const cookies = ctx.req.cookies || {};
    const refreshToken = cookies[RELGRAPH_REFRESH_COOKIE];
    if (!refreshToken) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "No refresh token" });
    }
    const payload = await verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid refresh token" });
    }
    const user = await getUserById(payload.userId);
    if (!user || !user.isActive) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found or inactive" });
    }
    const newAccessToken = await generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.cookie(RELGRAPH_SESSION_COOKIE, newAccessToken, {
      ...cookieOptions,
      maxAge: 86_400_000,
    });
    return { success: true };
  }),

  changePassword: protectedProcedure
    .input(changePasswordSchema)
    .mutation(async ({ input, ctx }) => {
      const user = await getUserById(ctx.user.id);
      if (!user?.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot change password for OAuth users",
        });
      }
      const valid = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Current password is incorrect",
        });
      }
      const newHash = await hashPassword(input.newPassword);
      const db = getDb();
      await db
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, ctx.user.id));
      return { success: true };
    }),
});
