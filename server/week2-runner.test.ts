/**
 * Week 2 — agent runner + cron + institutional skeleton tests.
 *
 * Pure unit tests where possible. Anything that requires the live DB is
 * left to integration suites that run against a test MySQL instance (out
 * of scope for week 2 scaffold).
 */

import { describe, expect, it } from "vitest";
import { parseCron, computeNextRunAt, describeCronIST } from "./services/cron-utils";
import { ALL_SKELETON_ORGS, PSU_BANKS, PRIVATE_BANKS, REGULATORS } from "./db/institutional-skeleton";
import { AGENT_DEFINITIONS } from "./services/agent-registry.service";
import { ORG_TYPES } from "../shared/enums";

describe("Cron parser", () => {
  it("parses standard 5-field expressions", () => {
    expect(parseCron("0 6 * * *")).not.toBeNull();
    expect(parseCron("* * * * *")).not.toBeNull();
    expect(parseCron("0 */6 * * *")).not.toBeNull();
    expect(parseCron("0 4 * * 0")).not.toBeNull();
    expect(parseCron("15,30,45 9-17 * * 1-5")).not.toBeNull();
  });

  it("rejects invalid expressions", () => {
    expect(parseCron("")).toBeNull();
    expect(parseCron("0 25 * * *")).toBeNull(); // hour out of range
    expect(parseCron("60 0 * * *")).toBeNull(); // minute out of range
    expect(parseCron("0 0 32 * *")).toBeNull(); // dom out of range
    expect(parseCron("0 0 * * 8")).toBeNull(); // dow out of range (max 6)
    expect(parseCron("0 0 * *")).toBeNull(); // only 4 fields
    expect(parseCron("a b c d e")).toBeNull();
    expect(parseCron("*/0 0 * * *")).toBeNull(); // step 0
  });

  it("expands ranges and steps correctly", () => {
    const fields = parseCron("*/15 9-12 * * *");
    expect(fields).not.toBeNull();
    expect(fields!.minutes).toEqual(new Set([0, 15, 30, 45]));
    expect(fields!.hours).toEqual(new Set([9, 10, 11, 12]));
  });
});

describe("Cron next-run computation (IST-aware)", () => {
  it("daily 6am IST resolves to correct UTC", () => {
    // From any time before today's 6am IST, next is today 06:00 IST (00:30 UTC).
    // Pick a "from" of 00:00 UTC on 2026-05-08 (which is 05:30 IST).
    const from = new Date("2026-05-08T00:00:00Z");
    const next = computeNextRunAt("0 6 * * *", from);
    expect(next).not.toBeNull();
    // 06:00 IST = 00:30 UTC same day
    expect(next!.toISOString()).toBe("2026-05-08T00:30:00.000Z");
  });

  it("daily 6am IST after today's firing rolls to tomorrow", () => {
    // 01:00 UTC = 06:30 IST, so 06:00 IST has passed; next is tomorrow.
    const from = new Date("2026-05-08T01:00:00Z");
    const next = computeNextRunAt("0 6 * * *", from);
    expect(next!.toISOString()).toBe("2026-05-09T00:30:00.000Z");
  });

  it("Sunday-only (dow=0) skips to next Sunday", () => {
    // 2026-05-08 is a Friday.
    const from = new Date("2026-05-08T12:00:00Z");
    const next = computeNextRunAt("0 4 * * 0", from);
    expect(next).not.toBeNull();
    // Next Sunday is 2026-05-10 at 04:00 IST = 22:30 UTC on Saturday 2026-05-09.
    expect(next!.toISOString()).toBe("2026-05-09T22:30:00.000Z");
  });

  it("every 6 hours fires at IST 00, 06, 12, 18", () => {
    const from = new Date("2026-05-08T00:00:00Z"); // 05:30 IST
    const next = computeNextRunAt("0 */6 * * *", from);
    // Next IST hour multiple of 6 after 05:30 is 06:00 IST = 00:30 UTC.
    expect(next!.toISOString()).toBe("2026-05-08T00:30:00.000Z");
  });

  it("every minute placeholder advances by exactly one minute", () => {
    const from = new Date("2026-05-08T00:00:00Z");
    const next = computeNextRunAt("* * * * *", from);
    expect(next!.getTime() - from.getTime()).toBe(60_000);
  });

  it("returns null for invalid expressions", () => {
    expect(computeNextRunAt("not a cron", new Date())).toBeNull();
  });
});

describe("describeCronIST", () => {
  it("describes common patterns in plain English", () => {
    expect(describeCronIST("0 6 * * *")).toBe("daily at 06:00 IST");
    expect(describeCronIST("0 4 * * 0")).toBe("weekly on Sun at 04:00 IST");
    expect(describeCronIST("0 */6 * * *")).toBe("every 6 hours, on the hour (IST)");
    expect(describeCronIST("* * * * *")).toContain("event-driven placeholder");
    expect(describeCronIST("0 * * * *")).toBe("every hour, on the hour (IST)");
  });

  it("falls back to raw expression for uncommon patterns", () => {
    expect(describeCronIST("15,30,45 9-17 * * 1-5")).toContain("(IST)");
  });
});

describe("Institutional skeleton dataset", () => {
  it("covers all 12 PSU banks (post-2020 consolidation)", () => {
    expect(PSU_BANKS).toHaveLength(12);
    const names = PSU_BANKS.map(b => b.name);
    // Spot-check the four merger-anchor banks
    expect(names).toContain("State Bank of India");
    expect(names).toContain("Bank of Baroda");
    expect(names).toContain("Punjab National Bank");
    expect(names).toContain("Canara Bank");
  });

  it("includes the major private banks", () => {
    const names = PRIVATE_BANKS.map(b => b.name);
    expect(names).toContain("HDFC Bank");
    expect(names).toContain("ICICI Bank");
    expect(names).toContain("Axis Bank");
    expect(names).toContain("Kotak Mahindra Bank");
  });

  it("includes the four key regulators", () => {
    const names = REGULATORS.map(r => r.name);
    expect(names).toContain("Reserve Bank of India");
    expect(names).toContain("Securities and Exchange Board of India");
    expect(names).toContain("Insurance Regulatory and Development Authority of India");
    expect(names).toContain("Pension Fund Regulatory and Development Authority");
  });

  it("every entry uses a valid org type from the enum", () => {
    for (const org of ALL_SKELETON_ORGS) {
      expect(ORG_TYPES).toContain(org.type);
    }
  });

  it("every entry has a non-empty name, shortName, city, website", () => {
    for (const org of ALL_SKELETON_ORGS) {
      expect(org.name.length).toBeGreaterThan(0);
      expect(org.shortName.length).toBeGreaterThan(0);
      expect(org.city.length).toBeGreaterThan(0);
      expect(org.website).toMatch(/^https:\/\//);
    }
  });

  it("has no duplicate names", () => {
    const names = ALL_SKELETON_ORGS.map(o => o.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("totals 54 organizations as documented", () => {
    expect(ALL_SKELETON_ORGS).toHaveLength(54);
  });
});

describe("Agent registry tick coverage", () => {
  it("event-driven agents are flagged so the runner can skip cron-based scheduling", () => {
    const eventDriven = AGENT_DEFINITIONS.filter(a => a.isEventDriven);
    expect(eventDriven.length).toBeGreaterThan(0);
    const names = eventDriven.map(a => a.name);
    expect(names).toContain("dedup");
    expect(names).toContain("path_recompute");
  });

  it("non-event-driven agents have valid IST cron expressions", () => {
    const cron = AGENT_DEFINITIONS.filter(a => !a.isEventDriven);
    for (const agent of cron) {
      expect(parseCron(agent.defaultCadenceCron), `agent ${agent.name} has invalid cron ${agent.defaultCadenceCron}`).not.toBeNull();
    }
  });

  it("user-scoped agents (digest, brief) are correctly flagged", () => {
    const userScoped = AGENT_DEFINITIONS.filter(a => a.isUserScoped);
    const names = userScoped.map(a => a.name);
    expect(names).toContain("digest");
    expect(names).toContain("brief");
  });
});
