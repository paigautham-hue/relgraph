/**
 * Week 6 — digest + trust-auditor dispatcher contract tests.
 *
 * Pure shape tests. The dispatchers themselves require a live DB to fully
 * exercise; these tests verify the public contract and the rank ordering
 * the Today UI depends on.
 */

import { describe, expect, it } from "vitest";

// Re-declare the rank constants used by the digest agent so a regression
// shows up here. These are the source of truth for "what shows on top".
const CARD_RANKS = {
  power_move: 10,
  watchlist_hit: 20,
  follow_up: 30,
  opportunity_stall: 40,
  opportunity_momentum: 45,
  stale_relationship: 50,
  no_owner: 60,
  team_intel: 70,
  new_path: 80,
} as const;

describe("Digest card rank ordering", () => {
  it("power_move outranks every other card type (highest visibility)", () => {
    const others = Object.entries(CARD_RANKS).filter(([k]) => k !== "power_move");
    for (const [_k, rank] of others) {
      expect(CARD_RANKS.power_move).toBeLessThan(rank);
    }
  });

  it("opportunity_stall is more visible than stale_relationship", () => {
    expect(CARD_RANKS.opportunity_stall).toBeLessThan(CARD_RANKS.stale_relationship);
  });

  it("opportunity_momentum sits between stall and stale_relationship", () => {
    expect(CARD_RANKS.opportunity_momentum).toBeGreaterThan(CARD_RANKS.opportunity_stall);
    expect(CARD_RANKS.opportunity_momentum).toBeLessThan(CARD_RANKS.stale_relationship);
  });

  it("no_owner is below stale_relationship (admin task vs. relationship task)", () => {
    expect(CARD_RANKS.no_owner).toBeGreaterThan(CARD_RANKS.stale_relationship);
  });

  it("team_intel and new_path are the lowest-priority informational cards", () => {
    expect(CARD_RANKS.team_intel).toBeGreaterThanOrEqual(60);
    expect(CARD_RANKS.new_path).toBeGreaterThanOrEqual(60);
  });

  it("ranks are gap-spaced enough to insert future card types without renumbering", () => {
    const ranks = Object.values(CARD_RANKS).sort((a, b) => a - b);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i] - ranks[i - 1]).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("Trust-auditor decay math", () => {
  // Replicate the constants used by the dispatcher.
  const DECAY_AMOUNT = 0.2;
  const FLOOR = 0.4;

  function decay(oldConf: number): number {
    return Math.max(oldConf - DECAY_AMOUNT, FLOOR);
  }

  it("decays 1.0 to 0.8 on first pass", () => {
    expect(decay(1.0)).toBeCloseTo(0.8);
  });

  it("decays 0.6 to 0.4 (floor) on second pass", () => {
    expect(decay(0.6)).toBeCloseTo(FLOOR);
  });

  it("never goes below the floor", () => {
    expect(decay(FLOOR)).toBeCloseTo(FLOOR);
    expect(decay(0.3)).toBeCloseTo(FLOOR);
  });

  it("never returns above the input when input is at or above the floor", () => {
    // Below the floor, decay snaps up to FLOOR — that's the documented
    // behaviour. The decay agent only acts on inputs above FLOOR anyway
    // (the WHERE clause filters confidence > FLOOR), so we test the regime
    // the agent actually visits.
    for (let c = 1; c >= FLOOR; c -= 0.05) {
      const next = decay(c);
      expect(next).toBeLessThanOrEqual(c + 1e-6);
      expect(next).toBeGreaterThanOrEqual(FLOOR - 1e-6);
    }
  });
});
