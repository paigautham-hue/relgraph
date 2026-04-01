import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { RELGRAPH_REFRESH_COOKIE, RELGRAPH_SESSION_COOKIE } from "../shared/constants";
import type { TrpcContext } from "./_core/context";

const authServiceMocks = vi.hoisted(() => ({
  loginUser: vi.fn(),
  getUserByEmail: vi.fn(),
  getUserById: vi.fn(),
  verifyPassword: vi.fn(),
  generateAccessToken: vi.fn(),
  generateRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
  isEmailApprovedForRegistration: vi.fn(),
  normalizeEmail: vi.fn((email: string) => email.trim().toLowerCase()),
  createUser: vi.fn(),
  activatePasswordUser: vi.fn(),
  getAccessRequestByEmail: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  logAudit: vi.fn(),
  getClientIp: vi.fn(() => "203.0.113.42"),
}));

vi.mock("./services/auth.service", () => ({
  loginUser: authServiceMocks.loginUser,
  getUserByEmail: authServiceMocks.getUserByEmail,
  getUserById: authServiceMocks.getUserById,
  verifyPassword: authServiceMocks.verifyPassword,
  generateAccessToken: authServiceMocks.generateAccessToken,
  generateRefreshToken: authServiceMocks.generateRefreshToken,
  verifyRefreshToken: authServiceMocks.verifyRefreshToken,
  isEmailApprovedForRegistration: authServiceMocks.isEmailApprovedForRegistration,
  normalizeEmail: authServiceMocks.normalizeEmail,
  createUser: authServiceMocks.createUser,
  activatePasswordUser: authServiceMocks.activatePasswordUser,
  RESERVED_SUPER_ADMIN_EMAIL: "gautham@manipalgroup.info",
  ACCESS_REQUEST_LOGIN_METHOD: "access_request",
  PENDING_ALLOWLIST_LOGIN_METHOD: "allowlist_pending",
  getAccessRequestByEmail: authServiceMocks.getAccessRequestByEmail,
}));

vi.mock("./middleware/audit", () => ({
  logAudit: auditMocks.logAudit,
  getClientIp: auditMocks.getClientIp,
}));

type CookieCall = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

function createPublicContext(): { ctx: TrpcContext; cookieCalls: CookieCall[] } {
  const cookieCalls: CookieCall[] = [];

  const ctx: TrpcContext = {
    user: null,
    req: {
      protocol: "https",
      headers: { "user-agent": "vitest" },
      cookies: {},
      ip: "203.0.113.42",
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookieCalls.push({ name, value, options });
      },
      clearCookie: vi.fn(),
    } as TrpcContext["res"],
  };

  return { ctx, cookieCalls };
}

beforeEach(() => {
  vi.clearAllMocks();

  authServiceMocks.generateAccessToken.mockResolvedValue("access-token");
  authServiceMocks.generateRefreshToken.mockResolvedValue("refresh-token");
  authServiceMocks.verifyRefreshToken.mockResolvedValue(null);
  authServiceMocks.verifyPassword.mockResolvedValue(true);
  authServiceMocks.getUserById.mockResolvedValue(null);
  authServiceMocks.getAccessRequestByEmail.mockResolvedValue(null);
  auditMocks.logAudit.mockResolvedValue(undefined);
});

describe("authentication audit trail", () => {
  it("logs successful password sign-ins", async () => {
    const { ctx, cookieCalls } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    authServiceMocks.loginUser.mockResolvedValue({
      user: {
        id: "user-1",
        email: "analyst@example.com",
        name: "Analyst User",
        role: "viewer",
        avatarUrl: null,
      },
      accessToken: "issued-access-token",
      refreshToken: "issued-refresh-token",
    });

    const result = await caller.auth.login({
      email: "analyst@example.com",
      password: "StrongPass123!",
    });

    expect(result.user.email).toBe("analyst@example.com");
    expect(cookieCalls.map((entry) => entry.name)).toEqual([
      RELGRAPH_SESSION_COOKIE,
      RELGRAPH_REFRESH_COOKIE,
    ]);
    expect(auditMocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        actionType: "update",
        entityType: "user",
        entityId: "user-1",
        fieldName: "auth.login",
        inputMethod: "form",
        ipAddress: "203.0.113.42",
        userAgent: "vitest",
      }),
    );
  });

  it("logs new access requests for admin review", async () => {
    const { ctx } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    authServiceMocks.isEmailApprovedForRegistration.mockResolvedValue(false);
    authServiceMocks.getUserByEmail.mockResolvedValue(null);
    authServiceMocks.getAccessRequestByEmail.mockResolvedValue(null);
    authServiceMocks.createUser.mockResolvedValue({
      id: "pending-1",
      email: "new.user@example.com",
      name: "New User",
      role: "viewer",
    });

    const result = await caller.auth.requestAccess({
      email: "new.user@example.com",
      name: "New User",
    });

    expect(result).toEqual({
      status: "requested",
      message: "Your access request has been submitted for admin review.",
    });
    expect(authServiceMocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new.user@example.com",
        name: "New User",
        role: "viewer",
        loginMethod: "access_request",
        isActive: false,
      }),
    );
    expect(auditMocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "pending-1",
        actionType: "create",
        entityType: "user",
        entityId: "pending-1",
        fieldName: "auth.access_request",
        inputMethod: "form",
      }),
    );
  });

  it("logs first-time password setup for approved users", async () => {
    const { ctx, cookieCalls } = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    authServiceMocks.isEmailApprovedForRegistration.mockResolvedValue(true);
    authServiceMocks.getUserByEmail.mockResolvedValue({
      id: "pending-2",
      email: "approved@example.com",
      name: "Approved User",
      role: "viewer",
      avatarUrl: null,
      passwordHash: null,
      loginMethod: "allowlist_pending",
    });
    authServiceMocks.activatePasswordUser.mockResolvedValue({
      id: "pending-2",
      email: "approved@example.com",
      name: "Approved User",
      role: "viewer",
      avatarUrl: null,
    });

    const result = await caller.auth.setupPassword({
      email: "approved@example.com",
      name: "Approved User",
      password: "StrongPass123!",
    });

    expect(result.user.email).toBe("approved@example.com");
    expect(cookieCalls).toHaveLength(2);
    expect(cookieCalls[0]?.name).toBe(RELGRAPH_SESSION_COOKIE);
    expect(cookieCalls[1]?.name).toBe(RELGRAPH_REFRESH_COOKIE);
    expect(auditMocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "pending-2",
        actionType: "update",
        entityType: "user",
        entityId: "pending-2",
        fieldName: "auth.password_setup",
        inputMethod: "form",
        ipAddress: "203.0.113.42",
        userAgent: "vitest",
      }),
    );
  });
});
