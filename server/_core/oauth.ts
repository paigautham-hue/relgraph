import type { Express, Request, Response } from "express";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import {
  createUser,
  getUserByEmail,
  getUserByOpenId,
  isEmailApprovedForRegistration,
  normalizeEmail,
  RESERVED_SUPER_ADMIN_EMAIL,
} from "../services/auth.service";
import { COOKIE_NAME } from "@shared/const";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function getSafeRedirectTarget(state: string): string {
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      origin?: string;
      returnPath?: string;
    };

    if (parsed?.returnPath && parsed.returnPath.startsWith("/")) {
      return parsed.returnPath;
    }
  } catch {
    // ignore malformed state and fall back to root
  }

  return "/";
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      const oauthEmail = userInfo.email ? normalizeEmail(userInfo.email) : `${userInfo.openId}@manus.local`;
      const reservedSuperAdmin = oauthEmail === RESERVED_SUPER_ADMIN_EMAIL;

      let user = await getUserByOpenId(userInfo.openId);
      if (!user && userInfo.email) {
        user = await getUserByEmail(oauthEmail);
      }

      if (!user) {
        const approved = reservedSuperAdmin || (userInfo.email ? await isEmailApprovedForRegistration(oauthEmail) : false);
        if (!approved) {
          res.redirect(302, `/login?error=${encodeURIComponent("This email has not been approved for registration yet. Please ask an admin to add it first.")}`);
          return;
        }

        user = await createUser({
          email: oauthEmail,
          name: userInfo.name || "Manus User",
          openId: userInfo.openId,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? "manus_oauth",
          role: reservedSuperAdmin ? "super_admin" : "viewer",
          isActive: true,
        });
      }

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, getSafeRedirectTarget(state));
    } catch (error) {
      if (error instanceof TRPCError) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
