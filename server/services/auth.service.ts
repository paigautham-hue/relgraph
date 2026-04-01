import bcrypt from "bcrypt";
import { SignJWT, jwtVerify } from "jose";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";
import type { User } from "../db/schema";
import type { UserRole } from "../../shared/enums";
import { ROLE_LEVELS } from "../../shared/enums";

const SALT_ROUNDS = 12;
const RESERVED_SUPER_ADMIN_EMAIL = "gautham@manipalgroup.info";
const PENDING_ALLOWLIST_LOGIN_METHOD = "allowlist_pending";

const getSecret = (key: string) => new TextEncoder().encode(key);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isReservedSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return normalizeEmail(email) === RESERVED_SUPER_ADMIN_EMAIL;
}

function deriveDisplayNameFromEmail(email: string): string {
  const [localPart] = normalizeEmail(email).split("@");
  if (!localPart) return "Pending User";

  const label = localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return label || "Pending User";
}

export function resolveManagedRole(email: string, requestedRole?: string | null): UserRole {
  if (isReservedSuperAdminEmail(email)) {
    return "super_admin";
  }

  if (requestedRole && requestedRole in ROLE_LEVELS) {
    return requestedRole as UserRole;
  }

  return "viewer";
}

async function syncReservedRole(user: User): Promise<User> {
  if (!isReservedSuperAdminEmail(user.email) || user.role === "super_admin") {
    return user;
  }

  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({ role: "super_admin", updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .returning();

  return updated ?? { ...user, role: "super_admin" };
}

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
  const normalizedEmail = normalizeEmail(email);
  const [foundUser] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

  if (!foundUser || !foundUser.passwordHash) return null;

  const user = await syncReservedRole(foundUser);
  if (!user.isActive || !user.passwordHash) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  await db.update(users).set({ lastActiveAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));

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
  return user ? syncReservedRole(user) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return user ? syncReservedRole(user) : null;
}

export async function getUserByOpenId(openId: string): Promise<User | null> {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return user ? syncReservedRole(user) : null;
}

export async function getPendingRegistrationByEmail(email: string): Promise<User | null> {
  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.email, normalizeEmail(email)),
        eq(users.loginMethod, PENDING_ALLOWLIST_LOGIN_METHOD),
      ),
    )
    .limit(1);

  return user ? syncReservedRole(user) : null;
}

export async function isEmailApprovedForRegistration(email: string): Promise<boolean> {
  if (isReservedSuperAdminEmail(email)) {
    return true;
  }

  const pendingUser = await getPendingRegistrationByEmail(email);
  return Boolean(pendingUser);
}

export async function createUser(data: {
  email: string;
  name?: string;
  password?: string;
  role?: string;
  openId?: string;
  loginMethod?: string;
  invitedBy?: string;
  isActive?: boolean;
}): Promise<User> {
  const db = getDb();
  const normalizedEmail = normalizeEmail(data.email);
  const passwordHash = data.password ? await hashPassword(data.password) : null;

  const [user] = await db
    .insert(users)
    .values({
      email: normalizedEmail,
      name: data.name?.trim() || deriveDisplayNameFromEmail(normalizedEmail),
      passwordHash,
      role: resolveManagedRole(normalizedEmail, data.role),
      openId: data.openId ?? null,
      loginMethod: data.loginMethod ?? null,
      invitedBy: data.invitedBy ?? null,
      isActive: data.isActive ?? true,
    })
    .returning();

  return syncReservedRole(user);
}

export { PENDING_ALLOWLIST_LOGIN_METHOD, RESERVED_SUPER_ADMIN_EMAIL };
