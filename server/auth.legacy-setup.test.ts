import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  columns: new Set(["id", "openId", "name", "email", "loginMethod", "role", "createdAt", "updatedAt", "lastSignedIn"]),
  users: [] as Array<Record<string, any>>,
  nextId: 1,
  queries: [] as Array<{ sql: string; params: any[] }>,
};

const mockPool = {
  query: vi.fn(async (sql: string, params: any[] = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim();
    state.queries.push({ sql: normalized, params });

    if (normalized.includes("from information_schema.columns")) {
      return [
        Array.from(state.columns).map((columnName) => ({
          columnName,
          isNullable: columnName === "openId" ? "NO" : "YES",
          columnType: columnName === "role" ? "enum('user','admin')" : "varchar(255)",
        })),
      ];
    }

    if (normalized.startsWith("alter table users add column passwordHash")) {
      state.columns.add("passwordHash");
      return [[], []];
    }
    if (normalized.startsWith("alter table users add column avatarUrl")) {
      state.columns.add("avatarUrl");
      return [[], []];
    }
    if (normalized.startsWith("alter table users add column isActive")) {
      state.columns.add("isActive");
      return [[], []];
    }
    if (normalized.startsWith("alter table users add column lastActiveAt")) {
      state.columns.add("lastActiveAt");
      return [[], []];
    }
    if (normalized.startsWith("alter table users add column invitedBy")) {
      state.columns.add("invitedBy");
      return [[], []];
    }
    if (normalized.startsWith("alter table users modify column openId")) {
      return [[], []];
    }
    if (normalized.startsWith("alter table users modify column role")) {
      return [[], []];
    }
    if (normalized.startsWith("update users set isActive = true where isActive is null")) {
      for (const user of state.users) {
        if (user.isActive == null) user.isActive = true;
      }
      return [[], []];
    }
    if (normalized.startsWith("update users set role = 'viewer' where role = 'user'")) {
      for (const user of state.users) {
        if (user.role === "user") user.role = "viewer";
      }
      return [[], []];
    }
    if (normalized.startsWith("update users set role = 'super_admin' where lower(email) = ?")) {
      const target = params[0];
      for (const user of state.users) {
        if ((user.email ?? "").toLowerCase() === target) user.role = "super_admin";
      }
      return [[], []];
    }

    if (normalized.startsWith("select * from users where lower(email) = ? limit 1")) {
      const email = params[0];
      const user = state.users.find((entry) => (entry.email ?? "").toLowerCase() === email);
      return [user ? [user] : []];
    }
    if (normalized.startsWith("select * from users where id = ? limit 1")) {
      const id = String(params[0]);
      const user = state.users.find((entry) => String(entry.id) === id);
      return [user ? [user] : []];
    }
    if (normalized.startsWith("insert into users (")) {
      const [email, name, passwordHash, role, openId, loginMethod, invitedBy, isActive, createdAt, updatedAt, lastSignedIn] = params;
      const user = {
        id: state.nextId++,
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
        lastSignedIn,
        lastActiveAt: null,
        avatarUrl: null,
      };
      state.users.push(user);
      return [{ insertId: user.id }];
    }
    if (normalized.startsWith("update users set name = ?, passwordHash = ?, loginMethod = 'password', isActive = true, updatedAt = ?, lastSignedIn = ? where id = ?")) {
      const [name, passwordHash, updatedAt, lastSignedIn, id] = params;
      const user = state.users.find((entry) => String(entry.id) === String(id));
      if (user) {
        user.name = name;
        user.passwordHash = passwordHash;
        user.loginMethod = "password";
        user.isActive = true;
        user.updatedAt = updatedAt;
        user.lastSignedIn = lastSignedIn;
      }
      return [[], []];
    }
    if (normalized.startsWith("update users set role = 'super_admin', updatedAt = ? where id = ?")) {
      const [updatedAt, id] = params;
      const user = state.users.find((entry) => String(entry.id) === String(id));
      if (user) {
        user.role = "super_admin";
        user.updatedAt = updatedAt;
      }
      return [[], []];
    }

    throw new Error(`Unhandled SQL in test: ${normalized}`);
  }),
};

vi.mock("mysql2/promise", () => ({
  default: {
    createPool: vi.fn(() => mockPool),
  },
}));

beforeEach(() => {
  state.columns = new Set(["id", "openId", "name", "email", "loginMethod", "role", "createdAt", "updatedAt", "lastSignedIn"]);
  state.users = [];
  state.nextId = 1;
  state.queries = [];
  mockPool.query.mockClear();
  vi.resetModules();
  process.env.DATABASE_URL = "mysql://test:test@localhost:4000/relgraph";
  process.env.JWT_SECRET = "test-secret";
});

describe("legacy users table first-time password setup", () => {
  it("adds auth compatibility columns and activates the reserved super-admin account", async () => {
    const auth = await import("./services/auth.service");

    state.users.push({
      id: 1,
      openId: "legacy-open-id",
      email: "gautham@manipalgroup.info",
      name: "Gautham",
      loginMethod: auth.PENDING_ALLOWLIST_LOGIN_METHOD,
      role: "user",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      lastSignedIn: new Date("2026-01-01T00:00:00Z"),
    });

    const before = await auth.getUserByEmail("gautham@manipalgroup.info");
    expect(before?.role).toBe("super_admin");

    const updated = await auth.activatePasswordUser("1", {
      name: "Gautham Manipal",
      password: "StrongPass123!",
    });

    expect(updated.role).toBe("super_admin");
    expect(updated.loginMethod).toBe("password");
    expect(updated.isActive).toBe(true);
    expect(updated.passwordHash).toBeTruthy();
    expect(updated.passwordHash).not.toBe("StrongPass123!");
    expect(state.columns.has("passwordHash")).toBe(true);
    expect(state.columns.has("isActive")).toBe(true);
    expect(state.columns.has("lastActiveAt")).toBe(true);
    expect(state.columns.has("invitedBy")).toBe(true);

    const compatibilityQueries = state.queries.map((entry) => entry.sql);
    expect(compatibilityQueries.some((sql) => sql.includes("alter table users add column passwordHash"))).toBe(true);
    expect(compatibilityQueries.some((sql) => sql.includes("alter table users modify column openId varchar(64) null"))).toBe(true);
    expect(compatibilityQueries.some((sql) => sql.includes("alter table users modify column role varchar(32) not null default 'viewer'"))).toBe(true);
  });
});
