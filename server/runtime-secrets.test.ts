import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 30001,
      openId: "qa-user",
      email: "gautham@manipalgroup.info",
      name: "Gauthaam",
      loginMethod: "password",
      role: "super_admin",
      avatarUrl: null,
      domainAccess: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
      cookies: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("runtime secrets", () => {
  it("returns a Gemini token from the configured runtime secret", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    const result = await caller.chat.geminiToken();

    expect(result).toHaveProperty("token");
    expect(typeof (result as { token: string }).token).toBe("string");
    expect((result as { token: string }).token.length).toBeGreaterThan(20);
    expect(result).toMatchObject({
      model: "gemini-2.5-flash-preview-native-audio-dialog",
      mode: "raw_key",
    });
  }, 20000);

  it("classifies a Today command using the configured Anthropic runtime secret", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    const result = await caller.today.classify({
      utterance: "Where are we weak in private banks?",
    });

    expect(result.tool).toBe("coverageGap");
    expect(result.args).toHaveProperty("sector");
    expect(typeof result.args.sector).toBe("string");
    expect(result.args.sector.toLowerCase()).toContain("private");
    expect(result.confidence).toBeGreaterThan(0);
  }, 30000);
});
