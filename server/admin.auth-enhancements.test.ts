import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { auditFilterSchema } from "../shared/validation";
import type { TrpcContext } from "./_core/context";

const authServiceMocks = vi.hoisted(() => ({
  normalizeEmail: vi.fn((email: string) => email.trim().toLowerCase()),
  getAccessRequestByEmail: vi.fn(),
  getPendingRegistrationByEmail: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  updateManagedUserProfile: vi.fn(),
  updateManagedUserStatus: vi.fn(),
  listManagedUsers: vi.fn(),
  listUsersByLoginMethod: vi.fn(),
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
    getPendingRegistrationByEmail: authServiceMocks.getPendingRegistrationByEmail,
    getUserByEmail: authServiceMocks.getUserByEmail,
    getUserById: authServiceMocks.getUserById,
    updateManagedUserProfile: authServiceMocks.updateManagedUserProfile,
    updateManagedUserStatus: authServiceMocks.updateManagedUserStatus,
    listManagedUsers: authServiceMocks.listManagedUsers,
    listUsersByLoginMethod: authServiceMocks.listUsersByLoginMethod,
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
  authServiceMocks.getPendingRegistrationByEmail.mockReset();
  authServiceMocks.getUserByEmail.mockReset();
  authServiceMocks.getUserById.mockReset();
  authServiceMocks.updateManagedUserProfile.mockReset();
  authServiceMocks.updateManagedUserStatus.mockReset();
  authServiceMocks.listManagedUsers.mockReset();
  authServiceMocks.listUsersByLoginMethod.mockReset();
});

describe("admin authentication enhancements", () => {
  it("adds an approved email without querying brittle Drizzle auth columns", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    authServiceMocks.getPendingRegistrationByEmail.mockResolvedValue(null);
    authServiceMocks.getUserByEmail.mockResolvedValue(null);

    const result = await caller.admin.addRegistrationAllowlistEmail({
      email: "rajesh.shet@manipalgroup.info",
      role: "viewer",
    });

    expect(result).toEqual({
      id: expect.any(String),
      email: "rajesh.shet@manipalgroup.info",
      role: "viewer",
      invitedBy: "admin-1",
    });
    expect(authServiceMocks.getPendingRegistrationByEmail).toHaveBeenCalledWith("rajesh.shet@manipalgroup.info");
    expect(authServiceMocks.getUserByEmail).toHaveBeenCalledWith("rajesh.shet@manipalgroup.info");
    expect(auditMocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        entityType: "user",
        ipAddress: "203.0.113.42",
      }),
    );
  });

  it("updates an existing pending approved email through the compatibility helper", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    authServiceMocks.getPendingRegistrationByEmail.mockResolvedValue({
      id: "pending-1",
      email: "rajesh.shet@manipalgroup.info",
      role: "viewer",
      invitedBy: null,
    });
    authServiceMocks.getUserByEmail.mockResolvedValue({
      id: "pending-1",
      email: "rajesh.shet@manipalgroup.info",
      loginMethod: "allowlist_pending",
    });
    authServiceMocks.updateManagedUserStatus.mockResolvedValue({
      id: "pending-1",
      email: "rajesh.shet@manipalgroup.info",
      role: "manager",
      invitedBy: "admin-1",
    });

    const result = await caller.admin.addRegistrationAllowlistEmail({
      email: "rajesh.shet@manipalgroup.info",
      role: "manager",
    });

    expect(authServiceMocks.updateManagedUserStatus).toHaveBeenCalledWith("pending-1", {
      role: "manager",
      invitedBy: "admin-1",
      loginMethod: "allowlist_pending",
      isActive: true,
    });
    expect(result).toEqual({
      id: "pending-1",
      email: "rajesh.shet@manipalgroup.info",
      role: "manager",
      invitedBy: "admin-1",
    });
  });

  it("lists approved registration emails through the compatibility helper", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    authServiceMocks.listUsersByLoginMethod.mockResolvedValue([
      {
        id: "allow-2",
        email: "zeta@example.com",
        role: "viewer",
        invitedBy: "admin-1",
        createdAt: new Date("2026-04-02T00:00:00Z"),
      },
      {
        id: "allow-1",
        email: "alpha@example.com",
        role: "manager",
        invitedBy: null,
        createdAt: new Date("2026-04-01T00:00:00Z"),
      },
    ]);

    const result = await caller.admin.listRegistrationAllowlist();

    expect(authServiceMocks.listUsersByLoginMethod).toHaveBeenCalledWith("allowlist_pending", { sortByCreatedAt: "asc" });
    expect(result.map((row: any) => row.email)).toEqual(["alpha@example.com", "zeta@example.com"]);
  });

  it("lists access requests through the compatibility helper", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    authServiceMocks.listUsersByLoginMethod.mockResolvedValue([
      {
        id: "req-1",
        email: "requester@example.com",
        name: "Requester",
        role: "viewer",
        createdAt: new Date("2026-04-03T00:00:00Z"),
      },
    ]);

    const result = await caller.admin.listAccessRequests();

    expect(authServiceMocks.listUsersByLoginMethod).toHaveBeenCalledWith("access_request", { sortByCreatedAt: "desc" });
    expect(result).toEqual([
      {
        id: "req-1",
        email: "requester@example.com",
        name: "Requester",
        role: "viewer",
        createdAt: new Date("2026-04-03T00:00:00Z"),
      },
    ]);
  });

  it("lists users through the compatibility helper instead of brittle Drizzle auth columns", async () => {
    const ctx = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    authServiceMocks.listManagedUsers.mockResolvedValue([
      {
        id: "user-1",
        email: "alpha@example.com",
        name: "Alpha",
        role: "viewer",
        avatarUrl: null,
        isActive: true,
        lastActiveAt: null,
        createdAt: new Date("2026-04-01T00:00:00Z"),
      },
      {
        id: "user-2",
        email: "beta@example.com",
        name: "Beta",
        role: "manager",
        avatarUrl: null,
        isActive: false,
        lastActiveAt: null,
        createdAt: new Date("2026-04-02T00:00:00Z"),
      },
    ]);

    const result = await caller.admin.listUsers({
      page: 1,
      pageSize: 20,
      search: undefined,
      role: undefined,
      isActive: undefined,
      sortOrder: "desc",
    });

    expect(authServiceMocks.listManagedUsers).toHaveBeenCalledWith({
      search: undefined,
      role: undefined,
      isActive: undefined,
      sortOrder: "desc",
    });
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: "user-1",
        email: "alpha@example.com",
      }),
    );
  });

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
    authServiceMocks.updateManagedUserStatus
      .mockResolvedValueOnce({ id: "req-1", email: "first@example.com", role: "manager", invitedBy: "admin-1" })
      .mockResolvedValueOnce({ id: "req-2", email: "second@example.com", role: "viewer", invitedBy: "admin-1" });

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
    expect(authServiceMocks.updateManagedUserStatus).toHaveBeenCalledTimes(2);
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
