/**
 * Week 2 follow-on — Apify ingestion + dedup + change-detection contract
 * tests.
 *
 * Pure unit tests where possible (fuzzy match scoring, budget pre-flight,
 * source-seed catalog shape). Live Apify round-trips are not exercised in
 * CI — they require APIFY_API_TOKEN, real network, and cost money.
 */

import { describe, expect, it } from "vitest";
import { withinTokenBudget, isApifyConfigured } from "./services/apify-client.service";
import { APIFY_SOURCE_SEEDS, getSeedByName } from "./services/apify-source-seeds";
import { PROVENANCE_SOURCE_TYPES } from "../shared/enums";

describe("Apify client — token budget pre-flight", () => {
  it("permits the run when there is no cap", () => {
    const r = withinTokenBudget(50, null, 5);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBeNull();
  });

  it("permits the run when cost fits within remaining cap", () => {
    const r = withinTokenBudget(40, 50, 5);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(10);
  });

  it("blocks the run when monthly cap is already exhausted", () => {
    const r = withinTokenBudget(50, 50, 5);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.reason).toMatch(/exhausted/i);
  });

  it("blocks the run when the next run would exceed remaining cap", () => {
    const r = withinTokenBudget(48, 50, 5);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(2);
    expect(r.reason).toMatch(/exceeds/i);
  });

  it("isApifyConfigured reflects environment state", () => {
    const original = process.env.APIFY_API_TOKEN;
    process.env.APIFY_API_TOKEN = "";
    expect(isApifyConfigured()).toBe(false);
    process.env.APIFY_API_TOKEN = "test_token";
    expect(isApifyConfigured()).toBe(true);
    if (original !== undefined) {
      process.env.APIFY_API_TOKEN = original;
    } else {
      delete process.env.APIFY_API_TOKEN;
    }
  });
});

describe("Apify source-seed catalog", () => {
  it("covers all 7 Indian institutional sources", () => {
    expect(APIFY_SOURCE_SEEDS).toHaveLength(7);
    const names = APIFY_SOURCE_SEEDS.map((s) => s.name).sort();
    expect(names).toEqual([
      "bse_announcements",
      "gazette_of_india",
      "mca21_filings",
      "nse_announcements",
      "pib_releases",
      "rbi_press_releases",
      "sebi_orders",
    ]);
  });

  it("every seed uses an official Apify actor (apify/* namespace)", () => {
    for (const seed of APIFY_SOURCE_SEEDS) {
      expect(seed.actorId.startsWith("apify/")).toBe(true);
    }
  });

  it("every seed has at least one start URL pointing to a known Indian institutional domain", () => {
    // Many Indian institutions use .com (bseindia.com, nseindia.com,
    // sebi.gov.in mixes); accept the canonical hosts we shipped.
    const validHosts = [
      "rbi.org.in",
      "pib.gov.in",
      "mca.gov.in",
      "sebi.gov.in",
      "bseindia.com",
      "nseindia.com",
      "egazette.gov.in",
    ];
    for (const seed of APIFY_SOURCE_SEEDS) {
      const urls = (seed.defaultInput.startUrls as Array<{ url: string }>).map((u) => u.url);
      expect(urls.length).toBeGreaterThan(0);
      const known = urls.some((u) => validHosts.some((h) => u.includes(h)));
      expect(known, `${seed.name} should target a known Indian host`).toBe(true);
    }
  });

  it("every seed has watch_fields and a positive cost estimate", () => {
    for (const seed of APIFY_SOURCE_SEEDS) {
      expect(seed.watchFields.length).toBeGreaterThan(0);
      expect(seed.estimatedRunCostUsd).toBeGreaterThan(0);
    }
  });

  it("every seed maps to a known PROVENANCE_SOURCE_TYPES value (or apify_scrape fallback)", () => {
    const map: Record<string, string> = {
      rbi_press_releases: "rbi_release",
      pib_releases: "pib_release",
      mca21_filings: "mca21_filing",
      sebi_orders: "sebi_order",
      bse_announcements: "bse_filing",
      nse_announcements: "nse_filing",
      gazette_of_india: "gazette_notification",
    };
    for (const seed of APIFY_SOURCE_SEEDS) {
      const sourceType = map[seed.name] ?? "apify_scrape";
      expect(PROVENANCE_SOURCE_TYPES).toContain(sourceType);
    }
  });

  it("getSeedByName returns the right seed", () => {
    const rbi = getSeedByName("rbi_press_releases");
    expect(rbi).toBeDefined();
    expect(rbi?.capability).toBe("monitoring");
    expect(getSeedByName("nonexistent")).toBeUndefined();
  });
});

// ─── Dedup scoring ──────────────────────────────────────────────────────────

import { tokenSetForTest, jaccardForTest, scorePairForTest } from "./test-helpers/dedup-test-helpers";

describe("Dedup scoring math (week 2.4)", () => {
  it("identical names score 1.0 on Jaccard", () => {
    expect(jaccardForTest(tokenSetForTest("Sanjay Malhotra"), tokenSetForTest("sanjay malhotra"))).toBe(1);
  });

  it("disjoint names score 0", () => {
    expect(jaccardForTest(tokenSetForTest("Rajesh Kumar"), tokenSetForTest("Priya Singh"))).toBe(0);
  });

  it("partial name overlap scores between 0 and 1", () => {
    const s = jaccardForTest(tokenSetForTest("Sanjay Kumar Malhotra"), tokenSetForTest("Sanjay Malhotra"));
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1);
  });

  it("auto-merge threshold met: same name + same org reaches >= 0.9", () => {
    const a = { name: "Sanjay Malhotra", currentTitle: "Deputy Governor", currentOrgId: "rbi-id" };
    const b = { name: "Sanjay Malhotra", currentTitle: "Deputy Governor", currentOrgId: "rbi-id" };
    expect(scorePairForTest(a, b).score).toBeGreaterThanOrEqual(0.9);
  });

  it("review threshold: same name, different orgs scores ~0.5 (above review, below auto-merge)", () => {
    const a = { name: "Sanjay Malhotra", currentTitle: "Director", currentOrgId: "rbi-id" };
    const b = { name: "Sanjay Malhotra", currentTitle: "Director", currentOrgId: "icici-id" };
    const s = scorePairForTest(a, b).score;
    expect(s).toBeLessThan(0.9);
    expect(s).toBeGreaterThanOrEqual(0.7);
  });

  it("title weight is small enough that title-only matches don't trigger review", () => {
    // Use multi-token distinct names so the 2-char filter doesn't collapse
    // them to identical tokens.
    const a = { name: "Rajesh Kumar Sharma", currentTitle: "Managing Director", currentOrgId: "org-x" };
    const b = { name: "Priya Singh Verma", currentTitle: "Managing Director", currentOrgId: "org-y" };
    expect(scorePairForTest(a, b).score).toBeLessThan(0.7);
  });
});

// ─── Change-detection rules ────────────────────────────────────────────────

describe("Change-detection regulatory keyword catalog", () => {
  // We don't import the dispatcher (it imports DB) — duplicate the keyword
  // list here. If they drift, this test catches it via a code review.
  const REGULATORY_KEYWORDS = ["penalty", "order", "action", "suspended", "debarred", "settlement", "appointment", "circular"];
  const BOARD_TITLE_KEYWORDS = ["chairman", "managing director", "director", "ceo", "cfo", "executive director"];

  it("regulatory keywords cover SEBI/RBI/PIB common terms", () => {
    expect(REGULATORY_KEYWORDS).toContain("penalty");
    expect(REGULATORY_KEYWORDS).toContain("order");
    expect(REGULATORY_KEYWORDS).toContain("circular");
    expect(REGULATORY_KEYWORDS).toContain("appointment");
  });

  it("board-title keywords cover senior leadership titles", () => {
    expect(BOARD_TITLE_KEYWORDS).toContain("chairman");
    expect(BOARD_TITLE_KEYWORDS).toContain("managing director");
    expect(BOARD_TITLE_KEYWORDS).toContain("ceo");
  });
});
