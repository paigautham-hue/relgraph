import bcrypt from "bcrypt";
import { SignJWT, jwtVerify } from "jose";
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import type { UserRole } from "../../shared/enums";
import { ROLE_LEVELS } from "../../shared/enums";

const SALT_ROUNDS = 12;
const RESERVED_SUPER_ADMIN_EMAIL = "gautham@manipalgroup.info";
const PENDING_ALLOWLIST_LOGIN_METHOD = "allowlist_pending";
const ACCESS_REQUEST_LOGIN_METHOD = "access_request";

const getSecret = (key: string) => new TextEncoder().encode(key);

export interface AuthUser {
  id: string;
  openId: string | null;
  email: string;
  name: string;
  loginMethod: string | null;
  role: UserRole;
  avatarUrl: string | null;
  domainAccess: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date | null;
  lastActiveAt: Date | null;
  passwordHash: string | null;
  invitedBy: string | null;
}

type UserRow = RowDataPacket & {
  id: number | string;
  openId?: string | null;
  email?: string | null;
  name?: string | null;
  loginMethod?: string | null;
  role?: string | null;
  passwordHash?: string | null;
  avatarUrl?: string | null;
  isActive?: number | boolean | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  lastSignedIn?: Date | string | null;
  lastActiveAt?: Date | string | null;
  invitedBy?: string | null;
};

type ColumnRow = RowDataPacket & {
  columnName: string;
  isNullable: "YES" | "NO";
  columnType: string;
};

let pool: Pool | null = null;
let ensureUsersAuthColumnsPromise: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not configured");
    }

    pool = mysql.createPool(connectionString);
  }

  return pool;
}

async function queryRows<T extends RowDataPacket>(statement: string, params: any[] = []): Promise<T[]> {
  const [rows] = await getPool().query(statement, params as any);
  return rows as T[];
}

async function executeStatement(statement: string, params: any[] = []): Promise<void> {
  await getPool().query(statement, params as any);
}

function asDate(value?: Date | string | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function asBoolean(value?: number | boolean | null): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  return value == null ? true : Boolean(value);
}

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

function mapUserRow(row: UserRow): AuthUser {
  const normalizedRole = normalizeStoredRole(row.role);
  const email = row.email ? normalizeEmail(row.email) : (row.openId ? `${row.openId}@manus.local` : "");
  const name = row.name?.trim() || deriveDisplayNameFromEmail(email || "pending.user");

  return {
    id: String(row.id),
    openId: row.openId ?? null,
    email,
    name,
    loginMethod: row.loginMethod ?? null,
    role: isReservedSuperAdminEmail(email) ? "super_admin" : normalizedRole,
    avatarUrl: row.avatarUrl ?? null,
    domainAccess: [],
    isActive: asBoolean(row.isActive),
    createdAt: asDate(row.createdAt) ?? new Date(),
    updatedAt: asDate(row.updatedAt) ?? new Date(),
    lastSignedIn: asDate(row.lastSignedIn),
    lastActiveAt: asDate(row.lastActiveAt),
    passwordHash: row.passwordHash ?? null,
    invitedBy: row.invitedBy ?? null,
  };
}

async function loadUsersColumns(): Promise<Map<string, ColumnRow>> {
  const rows = await queryRows<ColumnRow>(
    `
      select
        COLUMN_NAME as columnName,
        IS_NULLABLE as isNullable,
        COLUMN_TYPE as columnType
      from information_schema.columns
      where table_schema = database() and table_name = 'users'
    `,
  );

  return new Map(rows.map((row) => [row.columnName, row]));
}

async function ensureUsersAuthCompatibility(): Promise<void> {
  if (!ensureUsersAuthColumnsPromise) {
    ensureUsersAuthColumnsPromise = (async () => {
      const columns = await loadUsersColumns();
      if (columns.size === 0) {
        return;
      }

      const statements: string[] = [];

      if (!columns.has("passwordHash")) {
        statements.push("alter table users add column passwordHash text null");
      }
      if (!columns.has("avatarUrl")) {
        statements.push("alter table users add column avatarUrl text null");
      }
      if (!columns.has("isActive")) {
        statements.push("alter table users add column isActive boolean not null default true");
      }
      if (!columns.has("lastActiveAt")) {
        statements.push("alter table users add column lastActiveAt timestamp null");
      }
      if (!columns.has("invitedBy")) {
        statements.push("alter table users add column invitedBy varchar(191) null");
      }

      const openIdColumn = columns.get("openId");
      if (openIdColumn && openIdColumn.isNullable === "NO") {
        statements.push("alter table users modify column openId varchar(64) null");
      }

      const roleColumn = columns.get("role");
      if (roleColumn && roleColumn.columnType.startsWith("enum(")) {
        statements.push("alter table users modify column role varchar(32) not null default 'viewer'");
      }

      for (const statement of statements) {
        await executeStatement(statement);
      }

      await executeStatement("update users set isActive = true where isActive is null");
      await executeStatement("update users set role = 'viewer' where role = 'user'");
      await executeStatement("update users set role = 'super_admin' where lower(email) = ?", [RESERVED_SUPER_ADMIN_EMAIL]);
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

async function syncReservedRole(user: AuthUser): Promise<AuthUser> {
  if (!isReservedSuperAdminEmail(user.email) || user.role === "super_admin") {
    return user;
  }

  await executeStatement("update users set role = 'super_admin', updatedAt = ? where id = ?", [new Date(), user.id]);
  return { ...user, role: "super_admin", updatedAt: new Date() };
}

async function selectOneBy(statement: string, params: unknown[]): Promise<AuthUser | null> {
  await ensureUsersAuthCompatibility();
  const rows = await queryRows<UserRow>(statement, params);
  if (rows.length === 0) return null;
  return syncReservedRole(mapUserRow(rows[0]));
}

async function selectManyBy(statement: string, params: unknown[] = []): Promise<AuthUser[]> {
  await ensureUsersAuthCompatibility();
  const rows = await queryRows<UserRow>(statement, params);
  return Promise.all(rows.map((row) => syncReservedRole(mapUserRow(row))));
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

export async function loginUser(email: string, password: string): Promise<{ user: AuthUser; accessToken: string; refreshToken: string } | null> {
  const user = await getUserByEmail(email);
  if (!user || !user.passwordHash || !user.isActive) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  const now = new Date();
  await executeStatement(
    "update users set lastActiveAt = ?, lastSignedIn = ?, updatedAt = ? where id = ?",
    [now, now, now, user.id],
  );

  const refreshedUser = { ...user, lastActiveAt: now, lastSignedIn: now, updatedAt: now };
  const payload: JwtPayload = {
    userId: refreshedUser.id,
    email: refreshedUser.email,
    role: refreshedUser.role,
    name: refreshedUser.name,
  };

  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken(payload),
    generateRefreshToken(payload),
  ]);

  return { user: refreshedUser, accessToken, refreshToken };
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  return selectOneBy("select * from users where id = ? limit 1", [id]);
}

export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  return selectOneBy("select * from users where lower(email) = ? limit 1", [normalizeEmail(email)]);
}

export async function getUserByOpenId(openId: string): Promise<AuthUser | null> {
  return selectOneBy("select * from users where openId = ? limit 1", [openId]);
}

export async function getPendingRegistrationByEmail(email: string): Promise<AuthUser | null> {
  return selectOneBy(
    "select * from users where lower(email) = ? and loginMethod = ? limit 1",
    [normalizeEmail(email), PENDING_ALLOWLIST_LOGIN_METHOD],
  );
}

export async function getAccessRequestByEmail(email: string): Promise<AuthUser | null> {
  return selectOneBy(
    "select * from users where lower(email) = ? and loginMethod = ? limit 1",
    [normalizeEmail(email), ACCESS_REQUEST_LOGIN_METHOD],
  );
}

export async function isEmailApprovedForRegistration(email: string): Promise<boolean> {
  if (isReservedSuperAdminEmail(email)) {
    return true;
  }

  const pendingUser = await getPendingRegistrationByEmail(email);
  return Boolean(pendingUser);
}

export async function listUsersByLoginMethod(
  loginMethod: string,
  options: { sortByCreatedAt?: "asc" | "desc" } = {},
): Promise<AuthUser[]> {
  const direction = options.sortByCreatedAt === "asc" ? "asc" : "desc";
  return selectManyBy(`select * from users where loginMethod = ? order by createdAt ${direction}`, [loginMethod]);
}

export async function updateManagedUserStatus(
  userId: string,
  data: {
    role?: string;
    invitedBy?: string | null;
    loginMethod?: string | null;
    isActive?: boolean;
  },
): Promise<AuthUser> {
  await ensureUsersAuthCompatibility();

  const existing = await getUserById(userId);
  if (!existing) {
    throw new Error(`User ${userId} not found`);
  }

  const now = new Date();
  await executeStatement(
    "update users set role = ?, invitedBy = ?, loginMethod = ?, isActive = ?, updatedAt = ? where id = ?",
    [
      resolveManagedRole(existing.email, data.role ?? existing.role),
      data.invitedBy ?? existing.invitedBy,
      data.loginMethod ?? existing.loginMethod,
      data.isActive ?? existing.isActive,
      now,
      userId,
    ],
  );

  const updated = await getUserById(userId);
  if (!updated) {
    throw new Error(`Failed to load updated user ${userId}`);
  }

  return updated;
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
}): Promise<AuthUser> {
  await ensureUsersAuthCompatibility();

  const normalizedEmail = normalizeEmail(data.email);
  const passwordHash = data.password ? await hashPassword(data.password) : null;
  const now = new Date();
  const role = resolveManagedRole(normalizedEmail, data.role);

  const [result] = await getPool().query(
    `
      insert into users (
        email,
        name,
        passwordHash,
        role,
        openId,
        loginMethod,
        invitedBy,
        isActive,
        createdAt,
        updatedAt,
        lastSignedIn
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizedEmail,
      data.name?.trim() || deriveDisplayNameFromEmail(normalizedEmail),
      passwordHash,
      role,
      data.openId ?? null,
      data.loginMethod ?? null,
      data.invitedBy ?? null,
      data.isActive ?? true,
      now,
      now,
      now,
    ] as any,
  ) as [ResultSetHeader, any];

  const inserted = await getUserById(String(result.insertId));
  if (!inserted) {
    throw new Error("Failed to load newly created user");
  }

  return inserted;
}

export async function activatePasswordUser(userId: string, input: { name: string; password: string }): Promise<AuthUser> {
  await ensureUsersAuthCompatibility();

  const now = new Date();
  const passwordHash = await hashPassword(input.password);
  await executeStatement(
    `
      update users
      set name = ?, passwordHash = ?, loginMethod = 'password', isActive = true, updatedAt = ?, lastSignedIn = ?
      where id = ?
    `,
    [input.name.trim(), passwordHash, now, now, userId],
  );

  const updated = await getUserById(userId);
  if (!updated) {
    throw new Error("Failed to load updated user after password setup");
  }

  return updated;
}

export async function ensureAuthStorageReady(): Promise<void> {
  await ensureUsersAuthCompatibility();
}

export { ACCESS_REQUEST_LOGIN_METHOD, PENDING_ALLOWLIST_LOGIN_METHOD, RESERVED_SUPER_ADMIN_EMAIL };
