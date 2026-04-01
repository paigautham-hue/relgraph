import bcrypt from "bcrypt";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";
import type { User } from "../db/schema";

const SALT_ROUNDS = 12;

const getSecret = (key: string) => new TextEncoder().encode(key);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
}

export async function generateAccessToken(payload: JwtPayload): Promise<string> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not configured");

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .setIssuedAt()
    .sign(getSecret(secret));
}

export async function generateRefreshToken(payload: JwtPayload): Promise<string> {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_REFRESH_SECRET not configured");

  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(getSecret(secret));
}

export async function verifyAccessToken(token: string): Promise<JwtPayload | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(secret), { algorithms: ["HS256"] });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<JwtPayload | null> {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(secret), { algorithms: ["HS256"] });
    return payload as unknown as JwtPayload;
  } catch {
    return null;
  }
}

export async function loginUser(email: string, password: string): Promise<{ user: User; accessToken: string; refreshToken: string } | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user || !user.passwordHash) return null;
  if (!user.isActive) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, user.id));

  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };

  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken(payload),
    generateRefreshToken(payload),
  ]);

  return { user, accessToken, refreshToken };
}

export async function getUserById(id: string): Promise<User | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export async function getUserByOpenId(openId: string): Promise<User | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return user ?? null;
}

export async function createUser(data: {
  email: string;
  name: string;
  password?: string;
  role?: string;
  openId?: string;
  loginMethod?: string;
  invitedBy?: string;
}): Promise<User> {
  const db = getDb();
  const passwordHash = data.password ? await hashPassword(data.password) : null;

  const [user] = await db.insert(users).values({
    email: data.email,
    name: data.name,
    passwordHash,
    role: (data.role as any) || "viewer",
    openId: data.openId ?? null,
    loginMethod: data.loginMethod ?? null,
    invitedBy: data.invitedBy ?? null,
  }).returning();

  return user;
}
