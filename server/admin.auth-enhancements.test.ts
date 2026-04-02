import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { auditFilterSchema } from "../shared/validation";
import type { TrpcContext } from "./_core/context";

const authServiceMocks = vi.hoisted(() => ({
  normalizeEmail: vi.fn((email: string) => email.trim().toLowerCase()),
  getAccessRequestByEmail: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  logAudit: vi.fn(),
  getClientIp: vi.fn(() => "203.0.113.42"),
}));

const dbState = vi.hoisted(() => ({
  current: null as any,
}));

vi.mock("./services/auth.service", async () => {
  const actual = await vi.importActual<typeof import("./services/auth.service")>("./services/auth.service");
  return {
    ...actual,
    normalizeEmail: authServiceMocks.normalizeEmail,
    getAccessRequestByEmail: authServiceMocks.getAccessRequestByEmail,
    RESERVED_SUPER_ADMIN_EMAIL: "gautham@manipalgroup.info",
    ACCESS_REQUEST_LOGIN_METHOD: "access_request",
    PENDING_ALLOWLIST_LOGIN_METHOD: "allowlist_pending",
  };
});

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

function createDbMock(updatedRows: Array<{ id: string; email: string; role: string; invitedBy: string | null }>) {
  let updateIndex = 0;
  const returning = vi.fn(async () => [updatedRows[updateIndex++]]);
  const whereForUpdate = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where: whereForUpdate }));
  const update = vi.fn(() => ({ set }));

  let selectIndex = 0;
  const limit = vi.fn(async () => {
    const row = updatedRows[selectIndex++];
    return row ? [row] : [];
  });
  const whereForSelect = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where: whereForSelect }));
  const select = vi.fn(() => ({ from }));

  const deleteWhere = vi.fn(async () => undefined);
  const del = vi.fn(() => ({ where: deleteWhere }));

  return {
    update,
    select,
    delete: del,
    spies: {
      returning,
      whereForUpdate,
      set,
      update,
      select,
      from,
      whereForSelect,
      limit,
      deleteWhere,
      del,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbState.current = null;
  auditMocks.logAudit.mockResolvedValue(undefined);
});

describe("admin authentication enhancements", () => {
  it("bulk approves selected access requests and logs auth approval outcomes", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const dbMock = createDbMock([
      {
        id: "req-1",
        email: "first@example.com",
        role: "manager",
        invitedBy: "admin-1",
      },
      {
        id: "req-2",
        email: "second@example.com",
        role: "viewer",
        invitedBy: "admin-1",
      },
    ]);

    dbState.current = dbMock;
    authServiceMocks.getAccessRequestByEmail
      .mockResolvedValueOnce({ id: "req-1", email: "first@example.com", role: "viewer" })
      .mockResolvedValueOnce({ id: "req-2", email: "second@example.com", role: "viewer" });

    const result = await caller.admin.bulkApproveAccessRequests({
      requests: [
        { email: "first@example.com", role: "manager" },
        { email: "second@example.com", role: "viewer" },
      ],
    });

    expect(result).toEqual({
      success: true,
      count: 2,
      data: [
        {
          id: "req-1",
          email: "first@example.com",
          role: "manager",
          invitedBy: "admin-1",
        },
        {
          id: "req-2",
          email: "second@example.com",
          role: "viewer",
          invitedBy: "admin-1",
        },
      ],
    });
    expect(dbMock.spies.update).toHaveBeenCalledTimes(2);
    expect(auditMocks.logAudit).toHaveBeenCalledTimes(2);

    const firstAuditCall = auditMocks.logAudit.mock.calls[0]?.[0];
    const secondAuditCall = auditMocks.logAudit.mock.calls[1]?.[0];

    expect(firstAuditCall).toEqual(
      expect.objectContaining({
        userId: "admin-1",
        entityId: "req-1",
        fieldName: "auth.access_request_approved",
        ipAddress: "203.0.113.42",
        userAgent: "vitest",
      }),
    );
    expect(JSON.parse(firstAuditCall.newValue)).toEqual(
      expect.objectContaining({
        email: "first@example.com",
        role: "manager",
        outcome: "approved",
        bulk: true,
      }),
    );
    expect(JSON.parse(secondAuditCall.newValue)).toEqual(
      expect.objectContaining({
        email: "second@example.com",
        role: "viewer",
        outcome: "approved",
        bulk: true,
      }),
    );
  });

  it("bulk denies selected access requests and logs denied outcomes", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);
    const dbMock = createDbMock([]);

    dbState.current = dbMock;
    authServiceMocks.getAccessRequestByEmail
      .mockResolvedValueOnce({ id: "req-3", email: "deny.one@example.com", role: "viewer" })
      .mockResolvedValueOnce({ id: "req-4", email: "deny.two@example.com", role: "viewer" });

    const result = await caller.admin.bulkDenyAccessRequests({
      emails: ["deny.one@example.com", "deny.two@example.com"],
    });

    expect(result).toEqual({
      success: true,
      count: 2,
      emails: ["deny.one@example.com", "deny.two@example.com"],
    });
    expect(dbMock.spies.del).toHaveBeenCalledTimes(2);
    expect(dbMock.spies.deleteWhere).toHaveBeenCalledTimes(2);
    expect(auditMocks.logAudit).toHaveBeenCalledTimes(2);

    const firstAuditCall = auditMocks.logAudit.mock.calls[0]?.[0];
    const secondAuditCall = auditMocks.logAudit.mock.calls[1]?.[0];

    expect(firstAuditCall).toEqual(
      expect.objectContaining({
        userId: "admin-1",
        entityId: "req-3",
        fieldName: "auth.access_request_denied",
      }),
    );
    expect(JSON.parse(firstAuditCall.newValue)).toEqual(
      expect.objectContaining({
        email: "deny.one@example.com",
        outcome: "denied",
        bulk: true,
      }),
    );
    expect(JSON.parse(secondAuditCall.newValue)).toEqual(
      expect.objectContaining({
        email: "deny.two@example.com",
        outcome: "denied",
        bulk: true,
      }),
    );
  });

  it("accepts richer authentication audit filters for email, date range, and outcome", () => {
    const parsed = auditFilterSchema.parse({
      page: 1,
      pageSize: 25,
      email: "approvals@example.com",
      outcome: "approved",
      authOnly: true,
      startDate: "2026-04-01T00:00:00.000Z",
      endDate: "2026-04-01T23:59:59.000Z",
    });

    expect(parsed).toMatchObject({
      page: 1,
      pageSize: 25,
      email: "approvals@example.com",
      outcome: "approved",
      authOnly: true,
      startDate: "2026-04-01T00:00:00.000Z",
      endDate: "2026-04-01T23:59:59.000Z",
    });
  });
});
