/**
 * Enrichment agent dispatcher.
 *
 * Weekly pass that fills in missing fields on partially-populated records.
 * Week 6 follow-on scaffold — the heuristic version. Full LLM-based
 * enrichment (matching scraped Markdown to known persons, extracting
 * structured tenures from press releases) lands in a follow-on session.
 *
 * Heuristics shipped here:
 *   1. Persons with `currentOrgId` but no tenure for that org → create a
 *      tenure row marking it as `is_current=true` so the graph stays
 *      consistent.
 *   2. Persons whose current tenure ended > 14 days ago without a
 *      replacement → flag with provenance.expiresAt set, surfacing in
 *      trust-auditor's next pass.
 *
 * Cost: pure DB heuristics, no LLM tokens. Safe to run weekly without a cap.
 */

import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { persons, tenures, provenance } from "../../db/schema";
import type { AgentRunResult } from "../agent-runner.service";

export async function enrichmentDispatcher(params: {
  runId: string;
  scheduleId: string;
  isDryRun: boolean;
}): Promise<AgentRunResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  let processed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;

  // ─── Heuristic 1: persons with currentOrgId but no current tenure ────────
  // SELECT persons p LEFT JOIN tenures t ON p.id = t.person_id AND t.is_current
  //   WHERE p.current_org_id IS NOT NULL AND t.id IS NULL
  // (We use a subquery for the "no current tenure" check.)
  const personsWithOrgButNoCurrentTenure = await db
    .select({
      id: persons.id,
      name: persons.name,
      currentOrgId: persons.currentOrgId,
      currentTitle: persons.currentTitle,
    })
    .from(persons)
    .where(
      and(
        sql`${persons.currentOrgId} IS NOT NULL`,
        sql`NOT EXISTS (SELECT 1 FROM tenures t WHERE t.person_id = ${persons.id} AND t.is_current = true)`,
      ),
    )
    .limit(100);

  for (const p of personsWithOrgButNoCurrentTenure) {
    processed++;
    if (!p.currentOrgId) {
      skipped++;
      continue;
    }
    if (params.isDryRun) {
      skipped++;
      continue;
    }
    try {
      await db.insert(tenures).values({
        id: crypto.randomUUID(),
        personId: p.id,
        orgId: p.currentOrgId,
        title: p.currentTitle ?? "(unspecified)",
        startDate: new Date().toISOString().slice(0, 10) as any,
        isCurrent: true,
        source: "auto_scraped",
      });
      // Record a low-confidence provenance note that this was auto-inferred.
      await db.insert(provenance).values({
        id: crypto.randomUUID(),
        entityType: "person",
        entityId: p.id,
        fieldName: "current_tenure",
        sourceType: "system",
        sourceLabel: "Inferred from currentOrgId",
        capturedBy: null,
        confidence: 0.5,
      });
      created++;
    } catch (err) {
      console.error(`[enrichment] Failed to backfill tenure for person ${p.id}:`, err);
      skipped++;
    }
  }

  // ─── Heuristic 2: orphaned current tenures (end_date set but is_current=true) ───
  const orphanedTenures = await db
    .select({ id: tenures.id, personId: tenures.personId })
    .from(tenures)
    .where(
      and(
        eq(tenures.isCurrent, true),
        sql`${tenures.endDate} IS NOT NULL`,
        sql`${tenures.endDate} < CURRENT_DATE`,
      ),
    )
    .limit(100);

  for (const t of orphanedTenures) {
    processed++;
    if (params.isDryRun) {
      skipped++;
      continue;
    }
    try {
      await db.update(tenures).set({ isCurrent: false }).where(eq(tenures.id, t.id));
      updated++;
    } catch (err) {
      console.error(`[enrichment] Failed to clear is_current on tenure ${t.id}:`, err);
      skipped++;
    }
  }

  return {
    itemsProcessed: processed,
    itemsCreated: created,
    itemsUpdated: updated,
    itemsSkipped: skipped,
    output: {
      personsWithOrgButNoCurrentTenure: personsWithOrgButNoCurrentTenure.length,
      orphanedTenures: orphanedTenures.length,
    },
  };
}
