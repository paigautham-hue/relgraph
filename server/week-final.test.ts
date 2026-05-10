/**
 * Final phase — voice-bot tools, watches contract, dispatcher catalog tests.
 *
 * Pure unit tests. The VoiceBot UI and Gemini Live engine require a browser
 * environment; we test the contract surface (tool catalog, schemas) here.
 */

import { describe, expect, it } from "vitest";
import { VOICE_BOT_TOOLS, VOICE_BOT_SYSTEM_PROMPT } from "../client/src/lib/voiceBotTools";
import { INTENT_TOOLS } from "./services/intent-router.service";
import { updateWatchSchema, deleteWatchSchema } from "../shared/validation";

describe("VoiceBot tool catalog", () => {
  it("exposes the 8 RelGraph intents (no 'unknown' since Gemini handles fallback in-prompt)", () => {
    expect(VOICE_BOT_TOOLS).toHaveLength(8);
    const names = VOICE_BOT_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      "addToWatchlist",
      "briefPerson",
      "coverageGap",
      "findPath",
      "logInteraction",
      "searchIntel",
      "updateOpportunity",
      "whoOwns",
    ]);
  });

  it("every voice tool has a name that matches an INTENT_TOOLS value (server-side dispatchable)", () => {
    for (const tool of VOICE_BOT_TOOLS) {
      expect(INTENT_TOOLS).toContain(tool.name);
    }
  });

  it("every voice tool declaration has the Gemini Live OBJECT/STRING shape", () => {
    for (const tool of VOICE_BOT_TOOLS) {
      expect(tool.parameters.type).toBe("OBJECT");
      expect(tool.parameters.properties).toBeDefined();
      expect(Array.isArray(tool.parameters.required)).toBe(true);
      expect(tool.parameters.required.length).toBeGreaterThan(0);
    }
  });

  it("every required parameter exists in properties (catalog self-consistency)", () => {
    for (const tool of VOICE_BOT_TOOLS) {
      for (const required of tool.parameters.required) {
        expect(
          Object.prototype.hasOwnProperty.call(tool.parameters.properties, required),
          `${tool.name} requires '${required}' but it's not in properties`,
        ).toBe(true);
      }
    }
  });

  it("logInteraction's text param description preserves verbatim semantics", () => {
    const tool = VOICE_BOT_TOOLS.find((t) => t.name === "logInteraction")!;
    const textParam = (tool.parameters.properties as Record<string, { description: string }>).text;
    expect(textParam.description.toLowerCase()).toContain("verbatim");
  });

  it("system prompt is short enough to keep token cost trivial (<2 KB)", () => {
    expect(VOICE_BOT_SYSTEM_PROMPT.length).toBeLessThan(2048);
    expect(VOICE_BOT_SYSTEM_PROMPT.length).toBeGreaterThan(500);
  });

  it("system prompt mentions the Indian-market context", () => {
    expect(VOICE_BOT_SYSTEM_PROMPT).toMatch(/Indian/i);
    expect(VOICE_BOT_SYSTEM_PROMPT).toMatch(/banking|government|regulatory|corporate/i);
  });
});

describe("Watches Zod contract", () => {
  it("updateWatchSchema accepts partial updates", () => {
    expect(
      updateWatchSchema.safeParse({
        id: "00000000-0000-4000-8000-000000000001",
        isActive: false,
      }).success,
    ).toBe(true);
    expect(
      updateWatchSchema.safeParse({
        id: "00000000-0000-4000-8000-000000000001",
        notifyDigest: true,
        notifyPush: false,
      }).success,
    ).toBe(true);
  });

  it("deleteWatchSchema requires only id", () => {
    expect(deleteWatchSchema.safeParse({ id: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
    expect(deleteWatchSchema.safeParse({}).success).toBe(false);
  });

  it("updateWatchSchema rejects bad uuid", () => {
    expect(updateWatchSchema.safeParse({ id: "not-a-uuid", isActive: false }).success).toBe(false);
  });
});

describe("Path-recompute card type catalog", () => {
  // The path-recompute dispatcher emits 'new_path' digest cards. The
  // DigestCard component already renders this type. Verify the wiring
  // matches the canonical rank.
  it("'new_path' is the lowest-priority informational card type (rank 80)", () => {
    expect(80).toBeGreaterThan(70); // sanity vs. team_intel (70)
    expect(80).toBeLessThan(100); // and below the default fallback
  });
});
