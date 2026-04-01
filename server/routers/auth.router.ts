import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import {
  loginSchema,
  changePasswordSchema,
  registerSchema,
  requestAccessSchema,
  setupPasswordSchema,
} from "@shared/validation";
import { RELGRAPH_SESSION_COOKIE, RELGRAPH_REFRESH_COOKIE } from "@shared/constants";
import {
  loginUser,
  getUserByEmail,
  getUserById,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  isEmailApprovedForRegistration,
  normalizeEmail,
  createUser,
  activatePasswordUser,
  RESERVED_SUPER_ADMIN_EMAIL,
  ACCESS_REQUEST_LOGIN_METHOD,
  getAccessRequestByEmail,
} from "../services/auth.service";
import { getSessionCookieOptions } from "../_core/cookies";

async function issueSessionCookies(
  ctx: { req: any; res: any },
  user: { id: string; email: string; role: string; name: string },
) {
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

async function finalizePasswordSetup(
  ctx: { req: any; res: any },
  input: { email: string; name: string; password: string },
) {
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

  if (user) {
    user = await activatePasswordUser(user.id, {
      name: input.name,
      password: input.password,
    });
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

  requestAccess: publicProcedure.input(requestAccessSchema).mutation(async ({ input }) => {
    const email = normalizeEmail(input.email);

    if (email === RESERVED_SUPER_ADMIN_EMAIL) {
      return {
        status: "approved" as const,
        message: "This reserved super-admin account can go directly to first-time password setup.",
      };
    }

    const approved = await isEmailApprovedForRegistration(email);
    if (approved) {
      return {
        status: "approved" as const,
        message: "This email is already approved. You can continue to create your password.",
      };
    }

    const existingUser = await getUserByEmail(email);
    if (existingUser && existingUser.passwordHash) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "An account with this email already exists. Please sign in instead.",
      });
    }

    const existingRequest = await getAccessRequestByEmail(email);
    if (existingRequest) {
      return {
        status: "pending" as const,
        message: "Your access request is already pending admin review.",
      };
    }

    await createUser({
      email,
      name: input.name?.trim() || email,
      role: "viewer",
      loginMethod: ACCESS_REQUEST_LOGIN_METHOD,
      isActive: false,
    });

    return {
      status: "requested" as const,
      message: "Your access request has been submitted for admin review.",
    };
  }),

  register: publicProcedure.input(registerSchema).mutation(async ({ input, ctx }) => {
    return finalizePasswordSetup(ctx, input);
  }),

  setupPassword: publicProcedure.input(setupPasswordSchema).mutation(async ({ input, ctx }) => {
    return finalizePasswordSetup(ctx, input);
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
      await activatePasswordUser(ctx.user.id, {
        name: user.name,
        password: input.newPassword,
      });
      return { success: true };
    }),
});
