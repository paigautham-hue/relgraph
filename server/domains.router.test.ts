import { describe, it, expect, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("crypto", () => ({
  randomUUID: () => "domain-uuid-1",
}));

const auditMocks = vi.hoisted(() => ({
  logAudit: vi.fn(),
  getClientIp: vi.fn(() => "203.0.113.42"),
}));

const dbState = vi.hoisted(() => ({
  current: null as any,
}));

vi.mock("./middleware/audit", () => ({
  logAudit: auditMocks.logAudit,
  getClientIp: auditMocks.getClientIp,
}));

vi.mock("./db", () => ({
  getDb: () => dbState.current,
}));

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin User",
      role: "super_admin",
      avatarUrl: null,
      isActive: true,
    },
    req: {
      protocol: "https",
      headers: { "user-agent": "vitest" },
      cookies: {},
      ip: "203.0.113.42",
    } as TrpcContext["req"],
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as TrpcContext["res"],
  };
}

function createDomainsDbMock(domainRow: Record<string, any>) {
  const insertValues = vi.fn(async () => undefined);
  const insert = vi.fn(() => ({ values: insertValues }));

  const limit = vi.fn(async () => [domainRow]);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where, orderBy: vi.fn(async () => [domainRow]) }));
  const select = vi.fn(() => ({ from }));

  return {
    insert,
    select,
    spies: {
      insert,
      insertValues,
      select,
      from,
      where,
      limit,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.current = null;
  auditMocks.logAudit.mockResolvedValue(undefined);
});

describe("domains router", () => {
  it("creates a domain with an explicit UUID instead of relying on numeric insertId", async () => {
    const dbMock = createDomainsDbMock({
      id: "domain-uuid-1",
      name: "Indian Banks",
      description: "Database of Indian banks",
      color: "#12a57b",
      isActive: true,
    });
    dbState.current = dbMock;

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.domains.create({
      name: "Indian Banks",
      description: "Database of Indian banks",
      color: "#12a57b",
      isActive: true,
    });

    expect(dbMock.spies.insertValues).toHaveBeenCalledWith({
      id: "domain-uuid-1",
      name: "Indian Banks",
      description: "Database of Indian banks",
      color: "#12a57b",
      isActive: true,
    });
    expect(result).toEqual({
      id: "domain-uuid-1",
      name: "Indian Banks",
      description: "Database of Indian banks",
      color: "#12a57b",
      isActive: true,
    });
    expect(auditMocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        entityType: "domain",
        entityId: "domain-uuid-1",
        ipAddress: "203.0.113.42",
      }),
    );
  });
});
