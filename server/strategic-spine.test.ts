/**
 * Week 1 schema verification — strategic spine.
 *
 * Confirms the new tables, enums, validation schemas, and agent definitions
 * exist and are well-formed. No DB connection required; pure type/structure
 * checks plus light validation.
 */

import { describe, expect, it } from 'vitest';
import {
  opportunities,
  opportunityLinks,
  watches,
  ownership,
  provenance,
  powerMoves,
  digestCards,
  agentRegistry,
  agentSchedules,
  agentRuns,
} from './db/schema';
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_TRANSITIONS,
  OPPORTUNITY_LINK_TARGET_TYPES,
  WATCH_TARGET_TYPES,
  OWNERSHIP_TIERS,
  PROVENANCE_SOURCE_TYPES,
  PROVENANCE_ENTITY_TYPES,
  AGENT_NAMES,
  AGENT_RUN_STATUSES,
  POWER_MOVE_TYPES,
  DIGEST_CARD_TYPES,
  VISIBILITY_SCOPES,
} from '../shared/enums';
import {
  createOpportunitySchema,
  transitionOpportunityStageSchema,
  createWatchSchema,
  assignOwnershipSchema,
  createProvenanceSchema,
  updateAgentScheduleSchema,
} from '../shared/validation';
import { AGENT_DEFINITIONS } from './services/agent-registry.service';

describe('Strategic spine — week 1 schema', () => {
  it('exports all 10 new tables from drizzle schema', () => {
    expect(opportunities).toBeDefined();
    expect(opportunityLinks).toBeDefined();
    expect(watches).toBeDefined();
    expect(ownership).toBeDefined();
    expect(provenance).toBeDefined();
    expect(powerMoves).toBeDefined();
    expect(digestCards).toBeDefined();
    expect(agentRegistry).toBeDefined();
    expect(agentSchedules).toBeDefined();
    expect(agentRuns).toBeDefined();
  });

  it('has consistent enum sets', () => {
    expect(OPPORTUNITY_STAGES).toEqual(['identify', 'map', 'approach', 'engage', 'close', 'maintain', 'lost']);
    expect(OPPORTUNITY_LINK_TARGET_TYPES).toEqual(['person', 'organization', 'interaction']);
    expect(WATCH_TARGET_TYPES).toEqual(['person', 'organization', 'sector', 'role']);
    expect(OWNERSHIP_TIERS).toEqual(['tier_1', 'tier_2', 'tier_3', 'tier_4']);
    expect(VISIBILITY_SCOPES).toEqual(['private', 'team', 'org']);
    expect(AGENT_NAMES).toHaveLength(10);
    expect(AGENT_RUN_STATUSES).toContain('completed');
    expect(AGENT_RUN_STATUSES).toContain('budget_exhausted');
    expect(AGENT_RUN_STATUSES).toContain('dry_run');
    expect(POWER_MOVE_TYPES).toContain('role_change');
    expect(DIGEST_CARD_TYPES).toContain('power_move');
    expect(PROVENANCE_SOURCE_TYPES).toContain('rbi_release');
    expect(PROVENANCE_SOURCE_TYPES).toContain('voice_capture');
    expect(PROVENANCE_ENTITY_TYPES).toContain('opportunity');
  });

  it('opportunity stage transitions are well-formed (every stage maps to subset of stages)', () => {
    for (const stage of OPPORTUNITY_STAGES) {
      const transitions = OPPORTUNITY_STAGE_TRANSITIONS[stage];
      expect(transitions).toBeDefined();
      for (const next of transitions) {
        expect(OPPORTUNITY_STAGES).toContain(next);
      }
    }
  });

  it('opportunity stage transitions never include self-loops', () => {
    for (const stage of OPPORTUNITY_STAGES) {
      expect(OPPORTUNITY_STAGE_TRANSITIONS[stage]).not.toContain(stage);
    }
  });

  it('every active stage can transition to lost (explicit cancel path)', () => {
    const activeStages = OPPORTUNITY_STAGES.filter(s => s !== 'lost');
    for (const stage of activeStages) {
      expect(OPPORTUNITY_STAGE_TRANSITIONS[stage]).toContain('lost');
    }
  });
});

describe('Strategic spine — Zod validation', () => {
  it('createOpportunitySchema accepts a minimal valid input', () => {
    const result = createOpportunitySchema.safeParse({
      name: 'NBFC Acquisition',
      domainId: '00000000-0000-4000-8000-000000000001',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.stage).toBe('identify');
      expect(result.data.visibilityScope).toBe('team');
    }
  });

  it('createOpportunitySchema rejects invalid stage', () => {
    const result = createOpportunitySchema.safeParse({
      name: 'NBFC Acquisition',
      domainId: '00000000-0000-4000-8000-000000000001',
      stage: 'not_a_stage',
    });
    expect(result.success).toBe(false);
  });

  it('transitionOpportunityStageSchema requires valid target stage', () => {
    const valid = transitionOpportunityStageSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      toStage: 'engage',
    });
    expect(valid.success).toBe(true);

    const invalid = transitionOpportunityStageSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      toStage: 'banana',
    });
    expect(invalid.success).toBe(false);
  });

  it('createWatchSchema requires targetLabel', () => {
    const valid = createWatchSchema.safeParse({
      targetType: 'person',
      targetLabel: 'New RBI Deputy Governor',
    });
    expect(valid.success).toBe(true);

    const missingLabel = createWatchSchema.safeParse({
      targetType: 'sector',
    });
    expect(missingLabel.success).toBe(false);
  });

  it('assignOwnershipSchema enforces tier enum', () => {
    const valid = assignOwnershipSchema.safeParse({
      personId: '00000000-0000-4000-8000-000000000001',
      ownerUserId: '00000000-0000-4000-8000-000000000002',
      tier: 'tier_1',
    });
    expect(valid.success).toBe(true);

    const invalid = assignOwnershipSchema.safeParse({
      personId: '00000000-0000-4000-8000-000000000001',
      ownerUserId: '00000000-0000-4000-8000-000000000002',
      tier: 'tier_5',
    });
    expect(invalid.success).toBe(false);
  });

  it('createProvenanceSchema accepts polymorphic entity reference', () => {
    const valid = createProvenanceSchema.safeParse({
      entityType: 'person',
      entityId: '00000000-0000-4000-8000-000000000001',
      sourceType: 'rbi_release',
      sourceUrl: 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=12345',
      confidence: 0.95,
    });
    expect(valid.success).toBe(true);
  });

  it('createProvenanceSchema rejects out-of-range confidence', () => {
    const result = createProvenanceSchema.safeParse({
      entityType: 'person',
      entityId: '00000000-0000-4000-8000-000000000001',
      sourceType: 'manual_form',
      confidence: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('updateAgentScheduleSchema accepts partial updates', () => {
    const valid = updateAgentScheduleSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      isEnabled: false,
    });
    expect(valid.success).toBe(true);
  });

  it('updateAgentScheduleSchema rejects negative token cap', () => {
    const result = updateAgentScheduleSchema.safeParse({
      id: '00000000-0000-4000-8000-000000000001',
      monthlyTokenCapUsd: -10,
    });
    expect(result.success).toBe(false);
  });
});

describe('Strategic spine — agent registry definitions', () => {
  it('defines all 10 canonical agents matching the AGENT_NAMES enum', () => {
    expect(AGENT_DEFINITIONS).toHaveLength(10);
    const definedNames = AGENT_DEFINITIONS.map(d => d.name).sort();
    const enumNames = [...AGENT_NAMES].sort();
    expect(definedNames).toEqual(enumNames);
  });

  it('every ingestion agent starts disabled and in dry-run (cost guardrail)', () => {
    const ingestion = AGENT_DEFINITIONS.filter(d => d.name.startsWith('ingestion_'));
    expect(ingestion.length).toBeGreaterThan(0);
    for (const def of ingestion) {
      expect(def.startEnabled).toBe(false);
      expect(def.startDryRun).toBe(true);
      expect(def.defaultTokenCapUsd).toBeGreaterThan(0);
    }
  });

  it('change_detection starts disabled (cost guardrail)', () => {
    const cd = AGENT_DEFINITIONS.find(d => d.name === 'change_detection');
    expect(cd?.startEnabled).toBe(false);
  });

  it('user-facing agents (digest, brief) start enabled for activation', () => {
    const digest = AGENT_DEFINITIONS.find(d => d.name === 'digest');
    const brief = AGENT_DEFINITIONS.find(d => d.name === 'brief');
    expect(digest?.startEnabled).toBe(true);
    expect(brief?.startEnabled).toBe(true);
    expect(digest?.isUserScoped).toBe(true);
    expect(brief?.isUserScoped).toBe(true);
  });

  it('event-driven agents (dedup, path_recompute) are flagged correctly', () => {
    const dedup = AGENT_DEFINITIONS.find(d => d.name === 'dedup');
    const pathRecompute = AGENT_DEFINITIONS.find(d => d.name === 'path_recompute');
    expect(dedup?.isEventDriven).toBe(true);
    expect(pathRecompute?.isEventDriven).toBe(true);
  });

  it('every agent has a non-empty display name and a valid cron', () => {
    const cronRegex = /^(\*|[0-9]+|\*\/[0-9]+)( (\*|[0-9]+|\*\/[0-9]+|[0-9]+-[0-9]+|[0-9,]+)){4}$/;
    for (const def of AGENT_DEFINITIONS) {
      expect(def.displayName.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.defaultCadenceCron).toMatch(cronRegex);
    }
  });

  it('every agent has a token cap (or null only if event-driven and free)', () => {
    for (const def of AGENT_DEFINITIONS) {
      if (def.preferredModel !== null) {
        expect(def.defaultTokenCapUsd).not.toBeNull();
        expect(def.defaultTokenCapUsd!).toBeGreaterThan(0);
      }
    }
  });
});
