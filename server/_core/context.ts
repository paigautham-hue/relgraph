import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { COOKIE_NAME } from "@shared/const";
import { RELGRAPH_SESSION_COOKIE } from "@shared/constants";
import type { User } from "../db/schema";
import { verifyAccessToken, getUserById, getUserByOpenId, createUser } from "../services/auth.service";
import { parse as parseCookieHeader } from "cookie";
import { jwtVerify } from "jose";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

async function authenticateRelGraph(req: CreateExpressContextOptions["req"]): Promise<User | null> {
  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = await verifyAccessToken(token);
    if (payload) {
      return getUserById(payload.userId);
    }
  }

  // Check RelGraph session cookie
  const cookies = parseCookieHeader(req.headers.cookie || "");
  const sessionToken = cookies[RELGRAPH_SESSION_COOKIE];
  if (sessionToken) {
    const payload = await verifyAccessToken(sessionToken);
    if (payload) {
      return getUserById(payload.userId);
    }
  }

  return null;
}

async function authenticateManus(req: CreateExpressContextOptions["req"]): Promise<User | null> {
  const secret = ENV.cookieSecret;
  if (!secret) return null;

  const cookies = parseCookieHeader(req.headers.cookie || "");
  const sessionCookie = cookies[COOKIE_NAME];
  if (!sessionCookie) return null;

  try {
    const secretKey = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(sessionCookie, secretKey, { algorithms: ["HS256"] });
    const openId = payload.openId as string;
    if (!openId) return null;

    // Look up by openId
    let user = await getUserByOpenId(openId);
    if (!user) {
      // Auto-create viewer user for Manus OAuth users
      try {
        const name = (payload.name as string) || "Manus User";
        user = await createUser({
          email: `${openId}@manus.local`,
          name,
          openId,
          loginMethod: "manus_oauth",
          role: "viewer",
        });
      } catch {
        return null;
      }
    }
    return user;
  } catch {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // Try RelGraph JWT first
    user = await authenticateRelGraph(opts.req);

    // Fall back to Manus OAuth
    if (!user) {
      user = await authenticateManus(opts.req);
    }
  } catch {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
