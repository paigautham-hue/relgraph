/**
 * Week 5 — opportunities + ownership + provenance contract tests.
 *
 * Pure validation + state-machine tests. DB-bound integration tests live in
 * a future suite that runs against a test MySQL.
 */

import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_TRANSITIONS,
  OWNERSHIP_TIERS,
  PROVENANCE_SOURCE_TYPES,
  PROVENANCE_ENTITY_TYPES,
  VISIBILITY_SCOPES,
} from "../shared/enums";
import {
  createOpportunitySchema,
  updateOpportunitySchema,
  transitionOpportunityStageSchema,
  createOpportunityLinkSchema,
  assignOwnershipSchema,
  transferOwnershipSchema,
  removeOwnershipSchema,
  createProvenanceSchema,
} from "../shared/validation";

describe("Opportunity stage state machine", () => {
  it("every active stage allows forward, backward (where defined), and lost", () => {
    const active = OPPORTUNITY_STAGES.filter((s) => s !== "lost");
    for (const stage of active) {
      const next = OPPORTUNITY_STAGE_TRANSITIONS[stage];
      expect(next).toBeDefined();
      expect(next).toContain("lost");
    }
  });

  it("lost can be reactivated to identify only", () => {
    expect(OPPORTUNITY_STAGE_TRANSITIONS.lost).toEqual(["identify"]);
  });

  it("no stage allows transitioning to itself", () => {
    for (const stage of OPPORTUNITY_STAGES) {
      expect(OPPORTUNITY_STAGE_TRANSITIONS[stage]).not.toContain(stage);
    }
  });

  it("every transition target is itself a valid stage", () => {
    for (const [_from, targets] of Object.entries(OPPORTUNITY_STAGE_TRANSITIONS)) {
      for (const target of targets) {
        expect(OPPORTUNITY_STAGES).toContain(target);
      }
    }
  });

  it("identify cannot skip directly to engage (must pass through map and approach)", () => {
    expect(OPPORTUNITY_STAGE_TRANSITIONS.identify).not.toContain("engage");
  });

  it("close → maintain is allowed (the deal becomes a relationship)", () => {
    expect(OPPORTUNITY_STAGE_TRANSITIONS.close).toContain("maintain");
  });
});

describe("Opportunity Zod schemas", () => {
  it("createOpportunitySchema requires name + domainId, defaults stage and visibility", () => {
    const r = createOpportunitySchema.safeParse({
      name: "NBFC Acquisition",
      domainId: "00000000-0000-4000-8000-000000000001",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stage).toBe("identify");
      expect(r.data.visibilityScope).toBe("team");
    }
  });

  it("createOpportunitySchema rejects invalid visibility scope", () => {
    const r = createOpportunitySchema.safeParse({
      name: "Test",
      domainId: "00000000-0000-4000-8000-000000000001",
      visibilityScope: "everyone",
    });
    expect(r.success).toBe(false);
  });

  it("transitionOpportunityStageSchema rejects bogus stage", () => {
    const r = transitionOpportunityStageSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      toStage: "abandoned",
    });
    expect(r.success).toBe(false);
  });

  it("updateOpportunitySchema accepts partial updates", () => {
    const r = updateOpportunitySchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      momentumScore: 75,
    });
    expect(r.success).toBe(true);
  });

  it("updateOpportunitySchema clamps momentumScore to 0-100", () => {
    expect(updateOpportunitySchema.safeParse({ id: "00000000-0000-4000-8000-000000000001", momentumScore: 150 }).success).toBe(false);
    expect(updateOpportunitySchema.safeParse({ id: "00000000-0000-4000-8000-000000000001", momentumScore: -1 }).success).toBe(false);
  });

  it("createOpportunityLinkSchema validates targetType enum", () => {
    expect(
      createOpportunityLinkSchema.safeParse({
        opportunityId: "00000000-0000-4000-8000-000000000001",
        targetType: "person",
        targetId: "00000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(true);
    expect(
      createOpportunityLinkSchema.safeParse({
        opportunityId: "00000000-0000-4000-8000-000000000001",
        targetType: "tenure",
        targetId: "00000000-0000-4000-8000-000000000002",
      }).success,
    ).toBe(false);
  });
});

describe("Ownership Zod schemas", () => {
  it("assignOwnershipSchema requires personId + ownerUserId, defaults tier_2", () => {
    const r = assignOwnershipSchema.safeParse({
      personId: "00000000-0000-4000-8000-000000000001",
      ownerUserId: "00000000-0000-4000-8000-000000000002",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.tier).toBe("tier_2");
  });

  it("assignOwnershipSchema accepts all four tiers", () => {
    for (const tier of OWNERSHIP_TIERS) {
      const r = assignOwnershipSchema.safeParse({
        personId: "00000000-0000-4000-8000-000000000001",
        ownerUserId: "00000000-0000-4000-8000-000000000002",
        tier,
      });
      expect(r.success).toBe(true);
    }
  });

  it("transferOwnershipSchema requires both old + new (we look up old by personId)", () => {
    const r = transferOwnershipSchema.safeParse({
      personId: "00000000-0000-4000-8000-000000000001",
      newOwnerUserId: "00000000-0000-4000-8000-000000000002",
    });
    expect(r.success).toBe(true);
  });

  it("removeOwnershipSchema requires only personId", () => {
    expect(removeOwnershipSchema.safeParse({ personId: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
  });
});

describe("Provenance Zod schemas", () => {
  it("createProvenanceSchema accepts a polymorphic reference + sourceType", () => {
    const r = createProvenanceSchema.safeParse({
      entityType: "person",
      entityId: "00000000-0000-4000-8000-000000000001",
      sourceType: "rbi_release",
      sourceUrl: "https://www.rbi.org.in/release",
      confidence: 0.9,
    });
    expect(r.success).toBe(true);
  });

  it("createProvenanceSchema enforces 0-1 confidence range", () => {
    expect(
      createProvenanceSchema.safeParse({
        entityType: "person",
        entityId: "00000000-0000-4000-8000-000000000001",
        sourceType: "manual_form",
        confidence: 1.5,
      }).success,
    ).toBe(false);
    expect(
      createProvenanceSchema.safeParse({
        entityType: "person",
        entityId: "00000000-0000-4000-8000-000000000001",
        sourceType: "manual_form",
        confidence: -0.1,
      }).success,
    ).toBe(false);
  });

  it("PROVENANCE_SOURCE_TYPES includes Indian-source values", () => {
    expect(PROVENANCE_SOURCE_TYPES).toContain("rbi_release");
    expect(PROVENANCE_SOURCE_TYPES).toContain("pib_release");
    expect(PROVENANCE_SOURCE_TYPES).toContain("mca21_filing");
    expect(PROVENANCE_SOURCE_TYPES).toContain("voice_capture");
    expect(PROVENANCE_SOURCE_TYPES).toContain("text_capture");
  });

  it("PROVENANCE_ENTITY_TYPES covers the 10 fact-bearing entities", () => {
    const expected = [
      "person",
      "organization",
      "tenure",
      "relationship",
      "interaction",
      "reflection",
      "note",
      "intel_field",
      "opportunity",
      "power_move",
    ];
    expect([...PROVENANCE_ENTITY_TYPES].sort()).toEqual([...expected].sort());
  });
});

describe("Visibility scopes", () => {
  it("VISIBILITY_SCOPES has exactly three values: private/team/org", () => {
    expect(VISIBILITY_SCOPES).toEqual(["private", "team", "org"]);
  });
});
