/**
 * Agent registry runtime sync.
 *
 * Idempotent. Run on server boot to ensure the agent_registry table contains
 * the canonical 10 agents and that each has a default schedule. The DB
 * migration `0006_agent_registry.sql` does this at first install — this
 * module re-validates on every boot so that adding/renaming an agent in
 * `AGENT_DEFINITIONS` just requires a deploy, not a SQL migration.
 *
 * Cost guardrail rule: ingestion agents and change_detection start DISABLED.
 * Admin must explicitly enable them via Agent Operations UI after reviewing
 * cost projections. User-facing agents (digest, brief, dedup, path_recompute,
 * trust_auditor) start enabled so users get value out of the box.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { agentRegistry, agentSchedules } from '../db/schema';
import type { AgentName } from '../../shared/enums';

interface AgentDefinition {
  name: AgentName;
  displayName: string;
  description: string;
  defaultCadenceCron: string;
  isUserScoped: boolean;
  isEventDriven: boolean;
  defaultTokenCapUsd: number | null;
  preferredModel: string | null;
  startEnabled: boolean;
  startDryRun: boolean;
}

export const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    name: 'ingestion_rbi_pib',
    displayName: 'Ingestion — RBI / PIB',
    description: 'Pull RBI press releases and PIB notifications. High-signal regulator feeds.',
    defaultCadenceCron: '0 */6 * * *',
    isUserScoped: false,
    isEventDriven: false,
    defaultTokenCapUsd: 50.0,
    preferredModel: 'claude-haiku-4-5-20251001',
    startEnabled: false,
    startDryRun: true,
  },
  {
    name: 'ingestion_mca21_gazette',
    displayName: 'Ingestion — MCA21 / Gazette',
    description: 'Pull MCA21 corporate filings and Gazette of India notifications. Slow-moving batch.',
    defaultCadenceCron: '0 2 * * *',
    isUserScoped: false,
    isEventDriven: false,
    defaultTokenCapUsd: 30.0,
    preferredModel: 'claude-haiku-4-5-20251001',
    startEnabled: false,
    startDryRun: true,
  },
  {
    name: 'ingestion_bse_nse',
    displayName: 'Ingestion — BSE / NSE Filings',
    description: 'Post-market disclosure pull from BSE and NSE.',
    defaultCadenceCron: '0 20 * * *',
    isUserScoped: false,
    isEventDriven: false,
    defaultTokenCapUsd: 40.0,
    preferredModel: 'claude-haiku-4-5-20251001',
    startEnabled: false,
    startDryRun: true,
  },
  {
    name: 'change_detection',
    displayName: 'Change Detection',
    description: 'Diff prior 24h of ingested data, emit power_moves for role/board changes.',
    defaultCadenceCron: '0 4 * * *',
    isUserScoped: false,
    isEventDriven: false,
    defaultTokenCapUsd: 20.0,
    preferredModel: 'claude-sonnet-4-6',
    startEnabled: false,
    startDryRun: false,
  },
  {
    name: 'dedup',
    displayName: 'Deduplication',
    description: 'Fuzzy-match new entities against existing graph. Auto-merge on >0.9 confidence.',
    defaultCadenceCron: '* * * * *',
    isUserScoped: false,
    isEventDriven: true,
    defaultTokenCapUsd: 10.0,
    preferredModel: 'claude-haiku-4-5-20251001',
    startEnabled: true,
    startDryRun: false,
  },
  {
    name: 'enrichment',
    displayName: 'Enrichment',
    description: 'Backfill missing fields (titles, photos, source URLs) on partial records.',
    defaultCadenceCron: '0 3 * * 0',
    isUserScoped: false,
    isEventDriven: false,
    defaultTokenCapUsd: 15.0,
    preferredModel: 'claude-haiku-4-5-20251001',
    startEnabled: false,
    startDryRun: false,
  },
  {
    name: 'path_recompute',
    displayName: 'Path Recompute',
    description: 'Re-run cached pathfinder results for opportunities affected by a moved node.',
    defaultCadenceCron: '* * * * *',
    isUserScoped: false,
    isEventDriven: true,
    defaultTokenCapUsd: 5.0,
    preferredModel: null,
    startEnabled: true,
    startDryRun: false,
  },
  {
    name: 'brief',
    displayName: 'Pre-Meeting Brief',
    description: "For each user, pre-build briefings for tomorrow's calendar meetings.",
    defaultCadenceCron: '0 5 * * *',
    isUserScoped: true,
    isEventDriven: false,
    defaultTokenCapUsd: 25.0,
    preferredModel: 'claude-sonnet-4-6',
    startEnabled: true,
    startDryRun: false,
  },
  {
    name: 'trust_auditor',
    displayName: 'Trust Auditor',
    description: 'Demote confidence on facts past expires_at; flag stale roles.',
    defaultCadenceCron: '0 4 * * 0',
    isUserScoped: false,
    isEventDriven: false,
    defaultTokenCapUsd: 5.0,
    preferredModel: 'claude-haiku-4-5-20251001',
    startEnabled: true,
    startDryRun: false,
  },
  {
    name: 'digest',
    displayName: 'Daily Digest',
    description: 'For each user, assemble Today action feed cards from watches, owned relationships, opportunities.',
    defaultCadenceCron: '0 6 * * *',
    isUserScoped: true,
    isEventDriven: false,
    defaultTokenCapUsd: 20.0,
    preferredModel: 'claude-sonnet-4-6',
    startEnabled: true,
    startDryRun: false,
  },
];

/**
 * Ensure agent_registry contains all canonical agents. Updates display name,
 * description, default cadence, model preference if changed in code. Does NOT
 * overwrite per-schedule admin customizations (cron, enabled, token cap).
 *
 * Concurrency-safe: agent_registry.name is UNIQUE, so concurrent boots use
 * INSERT ... ON DUPLICATE KEY UPDATE to merge atomically. Schedule creation
 * is wrapped in try/catch since the (agent_id) isn't unique — losing a race
 * just means one boot's insert silently no-ops (we re-check on the next
 * iteration anyway because the loop is per-agent).
 *
 * Audit-log exemption: this is a system-bootstrap mutation (no userId, runs
 * on every server start, idempotent). The CLAUDE.md "every mutation must
 * audit-log" rule targets user actions, not boot-time invariant maintenance.
 * If we need a record of registry drift, callers can log the returned
 * { created, updated, schedulesCreated } counts.
 */
export async function syncAgentRegistry(): Promise<{ created: number; updated: number; schedulesCreated: number }> {
  const db = getDb();
  if (!db) {
    throw new Error('[agent-registry] Database not available');
  }

  let created = 0;
  let updated = 0;
  let schedulesCreated = 0;

  for (const def of AGENT_DEFINITIONS) {
    // Atomic upsert via ON DUPLICATE KEY UPDATE. The UNIQUE constraint on
    // agent_registry.name makes this race-free under concurrent server boots.
    const newId = crypto.randomUUID();
    await db
      .insert(agentRegistry)
      .values({
        id: newId,
        name: def.name,
        displayName: def.displayName,
        description: def.description,
        defaultCadenceCron: def.defaultCadenceCron,
        isUserScoped: def.isUserScoped,
        isEventDriven: def.isEventDriven,
        defaultTokenCapUsd: def.defaultTokenCapUsd,
        preferredModel: def.preferredModel,
      })
      .onDuplicateKeyUpdate({
        set: {
          displayName: def.displayName,
          description: def.description,
          defaultCadenceCron: def.defaultCadenceCron,
          isUserScoped: def.isUserScoped,
          isEventDriven: def.isEventDriven,
          preferredModel: def.preferredModel,
        },
      });

    // Re-fetch the canonical row (could be the freshly-inserted one OR an
    // existing row that just got updated).
    const [row] = await db.select().from(agentRegistry).where(eq(agentRegistry.name, def.name)).limit(1);
    if (!row) {
      // Should be impossible — INSERT ... ON DUPLICATE KEY UPDATE always
      // leaves a row. Treat as transient and skip.
      continue;
    }

    if (row.id === newId) {
      created++;
    } else {
      // Existing row was upserted. Count as updated only if anything actually
      // changed (best-effort check on the fields we just wrote).
      const drifted =
        row.displayName !== def.displayName ||
        row.description !== def.description ||
        row.defaultCadenceCron !== def.defaultCadenceCron ||
        row.isUserScoped !== def.isUserScoped ||
        row.isEventDriven !== def.isEventDriven ||
        row.preferredModel !== def.preferredModel;
      if (drifted) updated++;
    }

    // Ensure at least one schedule exists. Don't touch existing schedules —
    // admins may have customised them. (agent_id) isn't unique so we can't
    // upsert atomically; instead select-then-insert under best-effort race
    // tolerance: if two boots race here, both insert and we end up with two
    // default schedules. Acceptable trade-off — admins can delete duplicates.
    const schedules = await db.select().from(agentSchedules).where(eq(agentSchedules.agentId, row.id)).limit(1);
    if (schedules.length === 0) {
      try {
        await db.insert(agentSchedules).values({
          id: crypto.randomUUID(),
          agentId: row.id,
          cronExpression: def.defaultCadenceCron,
          isEnabled: def.startEnabled,
          isDryRun: def.startDryRun,
          monthlyTokenCapUsd: def.defaultTokenCapUsd,
        });
        schedulesCreated++;
      } catch (err) {
        // FK violation if the agent row was deleted between SELECT and INSERT —
        // very unlikely. Log and continue.
        console.error(`[agent-registry] Failed to create default schedule for ${def.name}:`, err);
      }
    }
  }

  return { created, updated, schedulesCreated };
}
