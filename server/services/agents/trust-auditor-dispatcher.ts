/**
 * Trust auditor agent dispatcher.
 *
 * Weekly pass that demotes confidence on stale provenance entries:
 *   - Any provenance row where `expires_at < NOW()` and `confidence > 0.4`
 *     gets `confidence = MAX(confidence - 0.2, 0.4)` and a note in metadata.
 *   - Verified entries (verified_at NOT NULL) are exempt — verification is
 *     the one signal that overrides time-based decay.
 *   - Entries with no expires_at (the default) are untouched — the trust
 *     auditor only acts on facts that explicitly declared an expiry.
 *
 * The agent doesn't invalidate or hide stale facts; it lowers their UI
 * confidence so the provenance chip can show "Stale — captured N days ago"
 * without forcing the user to refile or delete.
 */

import { and, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { provenance } from "../../db/schema";
import type { AgentRunResult } from "../agent-runner.service";

const DECAY_AMOUNT = 0.2;
const FLOOR_CONFIDENCE = 0.4;

export async function trustAuditorDispatcher(params: {
  runId: string;
  scheduleId: string;
  isDryRun: boolean;
}): Promise<AgentRunResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Find candidates: expires_at < NOW(), not yet verified, confidence > floor.
  const candidates = await db
    .select({
      id: provenance.id,
      confidence: provenance.confidence,
      entityType: provenance.entityType,
      entityId: provenance.entityId,
    })
    .from(provenance)
    .where(
      and(
        isNotNull(provenance.expiresAt),
        lt(provenance.expiresAt, new Date()),
        isNull(provenance.verifiedAt),
        gt(provenance.confidence, FLOOR_CONFIDENCE),
      ),
    )
    .limit(500);

  if (params.isDryRun) {
    return {
      itemsProcessed: candidates.length,
      itemsSkipped: candidates.length,
      output: { dryRun: true, candidates: candidates.length },
    };
  }

  let updated = 0;
  for (const row of candidates) {
    const oldConf = row.confidence ?? FLOOR_CONFIDENCE;
    const newConf = Math.max(oldConf - DECAY_AMOUNT, FLOOR_CONFIDENCE);
    if (newConf >= oldConf) continue; // already at floor
    await db
      .update(provenance)
      .set({
        confidence: newConf,
        metadata: sql`JSON_SET(COALESCE(metadata, '{}'), '$.last_decay_at', ${new Date().toISOString()})`,
      })
      .where(eq(provenance.id, row.id));
    updated++;
  }

  return {
    itemsProcessed: candidates.length,
    itemsUpdated: updated,
    itemsSkipped: candidates.length - updated,
    output: { decayed: updated },
  };
}
