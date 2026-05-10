/**
 * Change-detection agent dispatcher.
 *
 * Daily pass that diffs the prior 24h of provenance + tenure activity to
 * emit `power_moves`. The trick: ingestion writes provenance rows tagged
 * with `source_type` like `rbi_release` or `gazette_notification`. This
 * agent looks for new role-related releases and synthesizes `power_moves`
 * the digest agent can surface tomorrow morning.
 *
 * Detection rules (week 2.5 scaffold — heuristic, not LLM-based):
 *   1. **role_change** — new tenures created in the last 24h with `source =
 *      'auto_scraped'` or `source = 'manual'` AND a prior tenure on the same
 *      person now marked `is_current=false`. Emits power_move with from/to
 *      orgs.
 *   2. **board_appointment** — new tenures where title includes "director"
 *      or "chairman" or "managing director" and isCurrent=true.
 *   3. **regulatory_action** — provenance rows with `source_type` in
 *      (`rbi_release`, `sebi_order`, `pib_release`, `gazette_notification`)
 *      created in the last 24h, where the source_label suggests a regulatory
 *      keyword (penalty, order, action, suspended, debarred).
 *
 * LLM extraction of structured power-moves from raw scraped Markdown will
 * land in a follow-on session (week 2.5b). This heuristic approach
 * generates useful signals from the metadata already captured.
 *
 * Idempotency: power_moves table doesn't have a unique constraint to
 * prevent duplicates across runs, so we de-dup on (type, primary_person_id,
 * primary_org_id, occurred_at within 24h) before insert.
 */

import { and, desc, eq, gte, isNotNull, lte, ne, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { persons, organizations, tenures, powerMoves, provenance } from "../../db/schema";
import type { AgentRunResult } from "../agent-runner.service";

const LOOKBACK_HOURS = 24;
const REGULATORY_KEYWORDS = ["penalty", "order", "action", "suspended", "debarred", "settlement", "appointment", "circular"];
const BOARD_TITLE_KEYWORDS = ["chairman", "managing director", "director", "ceo", "cfo", "executive director"];

interface ChangeDetectionContext {
  runId: string;
  scheduleId: string;
  isDryRun: boolean;
}

export async function changeDetectionDispatcher(ctx: ChangeDetectionContext): Promise<AgentRunResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000);
  let emitted = 0;
  let skipped = 0;
  let processed = 0;

  // ─── 1. Role changes via new tenures ────────────────────────────────────
  const newCurrentTenures = await db
    .select({
      id: tenures.id,
      personId: tenures.personId,
      orgId: tenures.orgId,
      title: tenures.title,
      startDate: tenures.startDate,
      personName: persons.name,
      orgName: organizations.name,
    })
    .from(tenures)
    .innerJoin(persons, eq(tenures.personId, persons.id))
    .innerJoin(organizations, eq(tenures.orgId, organizations.id))
    .where(and(eq(tenures.isCurrent, true), gte(tenures.createdAt, cutoff)))
    .limit(100);

  for (const t of newCurrentTenures) {
    processed++;
    // Find an immediately prior current tenure on the same person.
    const [previous] = await db
      .select({ id: tenures.id, orgId: tenures.orgId, title: tenures.title, orgName: organizations.name })
      .from(tenures)
      .innerJoin(organizations, eq(tenures.orgId, organizations.id))
      .where(
        and(
          eq(tenures.personId, t.personId),
          ne(tenures.id, t.id),
          eq(tenures.isCurrent, false),
        ),
      )
      .orderBy(desc(tenures.endDate))
      .limit(1);

    const headline = previous
      ? `${t.personName} moves to ${t.title} at ${t.orgName} from ${previous.orgName}`
      : `${t.personName} appointed ${t.title} at ${t.orgName}`;
    const isBoardLevel = BOARD_TITLE_KEYWORDS.some((k) => t.title.toLowerCase().includes(k));
    const moveType = previous ? "role_change" : isBoardLevel ? "board_appointment" : "role_change";

    if (await isDuplicatePowerMove(moveType, t.personId, t.orgId, new Date(t.startDate))) {
      skipped++;
      continue;
    }
    if (ctx.isDryRun) {
      skipped++;
      continue;
    }

    await db.insert(powerMoves).values({
      id: crypto.randomUUID(),
      type: moveType,
      headline,
      summary: previous
        ? `Previously ${previous.title} at ${previous.orgName}.`
        : `New appointment captured from tenure record.`,
      occurredAt: new Date(t.startDate),
      primaryPersonId: t.personId,
      primaryOrgId: t.orgId,
      fromOrgId: previous?.orgId ?? null,
      toOrgId: t.orgId,
      fromTitle: previous?.title ?? null,
      toTitle: t.title,
      sourceType: "system",
      confidence: 0.85,
      isPublished: true,
    });
    emitted++;
  }

  // ─── 2. Regulatory actions inferred from provenance ─────────────────────
  const recentProvenance = await db
    .select({
      id: provenance.id,
      entityType: provenance.entityType,
      entityId: provenance.entityId,
      sourceType: provenance.sourceType,
      sourceUrl: provenance.sourceUrl,
      sourceLabel: provenance.sourceLabel,
      capturedAt: provenance.capturedAt,
    })
    .from(provenance)
    .where(
      and(
        gte(provenance.capturedAt, cutoff),
        isNotNull(provenance.sourceLabel),
      ),
    )
    .limit(500);

  for (const row of recentProvenance) {
    processed++;
    const label = (row.sourceLabel ?? "").toLowerCase();
    const keyword = REGULATORY_KEYWORDS.find((k) => label.includes(k));
    if (!keyword) {
      skipped++;
      continue;
    }
    if (row.entityType !== "organization") {
      skipped++;
      continue;
    }
    const orgId = row.entityId;
    if (await isDuplicatePowerMove("regulatory_action", null, orgId, row.capturedAt)) {
      skipped++;
      continue;
    }
    if (ctx.isDryRun) {
      skipped++;
      continue;
    }

    await db.insert(powerMoves).values({
      id: crypto.randomUUID(),
      type: "regulatory_action",
      headline: row.sourceLabel ?? "Regulatory action detected",
      summary: `Detected via ${row.sourceType} ingestion. Keyword match: "${keyword}".`,
      occurredAt: row.capturedAt,
      primaryOrgId: orgId,
      sourceType: row.sourceType,
      sourceUrl: row.sourceUrl,
      confidence: 0.6, // heuristic match — admin should validate
      isPublished: true,
    });
    emitted++;
  }

  return {
    itemsProcessed: processed,
    itemsCreated: emitted,
    itemsSkipped: skipped,
    output: {
      lookbackHours: LOOKBACK_HOURS,
      newTenuresExamined: newCurrentTenures.length,
      provenanceExamined: recentProvenance.length,
    },
  };
}

/**
 * Dedup helper: was a similar power-move emitted within 48h?
 */
async function isDuplicatePowerMove(
  type: string,
  personId: string | null,
  orgId: string | null,
  occurredAt: Date,
): Promise<boolean> {
  const db = getDb();
  const window = new Date(occurredAt.getTime() - 48 * 3_600_000);
  const conds = [
    eq(powerMoves.type, type),
    gte(powerMoves.occurredAt, window),
    lte(powerMoves.occurredAt, new Date(occurredAt.getTime() + 48 * 3_600_000)),
  ];
  if (personId) conds.push(eq(powerMoves.primaryPersonId, personId));
  if (orgId) conds.push(eq(powerMoves.primaryOrgId, orgId));
  const [existing] = await db.select({ id: powerMoves.id }).from(powerMoves).where(and(...conds)).limit(1);
  return Boolean(existing);
}

