import bcrypt from "bcrypt";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../db/schema";
import type { User } from "../db/schema";
import type { UserRole } from "../../shared/enums";
import { ROLE_LEVELS } from "../../shared/enums";

const SALT_ROUNDS = 12;
const RESERVED_SUPER_ADMIN_EMAIL = "gautham@manipalgroup.info";
const PENDING_ALLOWLIST_LOGIN_METHOD = "allowlist_pending";
const ACCESS_REQUEST_LOGIN_METHOD = "access_request";

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

function normalizeStoredRole(role?: string | null): UserRole {
  if (!role) return "viewer";
  if (role === "user") return "viewer";
  if (role in ROLE_LEVELS) return role as UserRole;
  return "viewer";
}

let ensureUsersAuthColumnsPromise: Promise<void> | null = null;

async function ensureUsersAuthCompatibility(): Promise<void> {
  if (!ensureUsersAuthColumnsPromise) {
    ensureUsersAuthColumnsPromise = (async () => {
      const db = getDb();
      const result = await db.execute(sql`
        select column_name
        from information_schema.columns
        where table_schema = 'public' and table_name = 'users'
      `);

      const rows = (result as { rows?: Array<{ column_name?: string | null }> }).rows ?? [];
      const columns = new Set(rows.map((row) => row.column_name).filter(Boolean) as string[]);

      if (columns.size === 0) {
        return;
      }

      const statements: string[] = [
        `alter table users add column if not exists password_hash text`,
        `alter table users add column if not exists avatar_url text`,
        `alter table users add column if not exists is_active boolean not null default true`,
        `alter table users add column if not exists last_active_at timestamp`,
        `alter table users add column if not exists open_id varchar(64)`,
        `alter table users add column if not exists login_method varchar(64)`,
        `alter table users add column if not exists invited_by uuid`,
        `alter table users add column if not exists created_at timestamp not null default now()`,
        `alter table users add column if not exists updated_at timestamp not null default now()`,
      ];

      if (columns.has("openId")) {
        statements.push(`alter table users alter column "openId" drop not null`);
        statements.push(`update users set open_id = "openId" where open_id is null and "openId" is not null`);
      }
      if (columns.has("loginMethod")) {
        statements.push(`update users set login_method = "loginMethod" where login_method is null and "loginMethod" is not null`);
      }
      if (columns.has("createdAt")) {
        statements.push(`update users set created_at = "createdAt" where created_at is null and "createdAt" is not null`);
      }
      if (columns.has("updatedAt")) {
        statements.push(`update users set updated_at = "updatedAt" where updated_at is null and "updatedAt" is not null`);
      }
      if (columns.has("lastSignedIn")) {
        statements.push(`update users set last_active_at = "lastSignedIn" where last_active_at is null and "lastSignedIn" is not null`);
      }

      statements.push(`update users set is_active = true where is_active is null`);
      statements.push(`alter table users alter column role type text using role::text`);
      statements.push(`update users set role = 'viewer' where role = 'user'`);
      statements.push(`update users set role = 'super_admin' where lower(email) = '${RESERVED_SUPER_ADMIN_EMAIL}'`);

      for (const statement of statements) {
        await db.execute(sql.raw(statement));
      }
    })().catch((error) => {
      ensureUsersAuthColumnsPromise = null;
      throw error;
    });
  }

  await ensureUsersAuthColumnsPromise;
}

export function resolveManagedRole(email: string, requestedRole?: string | null): UserRole {
  if (isReservedSuperAdminEmail(email)) {
    return "super_admin";
  }

  return normalizeStoredRole(requestedRole);
}

async function syncReservedRole(user: User): Promise<User> {
  await ensureUsersAuthCompatibility();

  const normalizedRole = normalizeStoredRole(user.role);
  if (!isReservedSuperAdminEmail(user.email)) {
    return normalizedRole === user.role ? user : { ...user, role: normalizedRole };
  }

  if (normalizedRole === "super_admin") {
    return normalizedRole === user.role ? user : { ...user, role: normalizedRole };
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
  await ensureUsersAuthCompatibility();

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
  await ensureUsersAuthCompatibility();

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ? syncReservedRole(user) : null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await ensureUsersAuthCompatibility();

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return user ? syncReservedRole(user) : null;
}

export async function getUserByOpenId(openId: string): Promise<User | null> {
  await ensureUsersAuthCompatibility();

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return user ? syncReservedRole(user) : null;
}

export async function getPendingRegistrationByEmail(email: string): Promise<User | null> {
  await ensureUsersAuthCompatibility();

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

export async function getAccessRequestByEmail(email: string): Promise<User | null> {
  await ensureUsersAuthCompatibility();

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.email, normalizeEmail(email)),
        eq(users.loginMethod, ACCESS_REQUEST_LOGIN_METHOD),
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
  await ensureUsersAuthCompatibility();

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

export async function ensureAuthStorageReady(): Promise<void> {
  await ensureUsersAuthCompatibility();
}

export { ACCESS_REQUEST_LOGIN_METHOD, PENDING_ALLOWLIST_LOGIN_METHOD, RESERVED_SUPER_ADMIN_EMAIL };
