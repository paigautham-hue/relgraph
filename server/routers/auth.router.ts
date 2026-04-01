import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { loginSchema, changePasswordSchema } from "@shared/validation";
import { RELGRAPH_SESSION_COOKIE, RELGRAPH_REFRESH_COOKIE } from "@shared/constants";
import {
  loginUser,
  getUserById,
  verifyPassword,
  hashPassword,
  generateAccessToken,
  verifyRefreshToken,
} from "../services/auth.service";
import { getDb } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { getSessionCookieOptions } from "../_core/cookies";
import { TRPCError } from "@trpc/server";

export const authRouter = router({
  login: publicProcedure.input(loginSchema).mutation(async ({ input, ctx }) => {
    const result = await loginUser(input.email, input.password);
    if (!result) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
    }
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.cookie(RELGRAPH_SESSION_COOKIE, result.accessToken, {
      ...cookieOptions,
      maxAge: 86_400_000, // 24h
    });
    ctx.res.cookie(RELGRAPH_REFRESH_COOKIE, result.refreshToken, {
      ...cookieOptions,
      maxAge: 604_800_000, // 7d
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
