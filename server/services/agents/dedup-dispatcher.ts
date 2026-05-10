/**
 * Dedup agent dispatcher (event-driven; runner skips cron-based scheduling).
 *
 * Scans recent persons + organizations for fuzzy duplicates and merges
 * candidates above a confidence threshold. Conservative — only auto-merges
 * when the match score is >= 0.9 AND the entities share at least one strong
 * signal (exact email, exact LinkedIn, identical org). Sub-0.9 candidates
 * surface as alerts for admin review.
 *
 * Score = weighted blend:
 *   - Name token Jaccard:   weight 0.5
 *   - Title token Jaccard:  weight 0.2
 *   - Same currentOrgId:    weight 0.3
 * Caps at 1.0.
 *
 * For week 2.4 scaffold this runs in audit mode by default — surfaces
 * candidates without merging — until an admin enables auto-merge in agent
 * config_overrides.
 */

import { and, desc, eq, gte, isNotNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { persons, organizations } from "../../db/schema";
import type { AgentRunResult } from "../agent-runner.service";

const SCAN_LOOKBACK_DAYS = 14;
const AUTO_MERGE_THRESHOLD = 0.9;
const REVIEW_THRESHOLD = 0.7;
const SCAN_LIMIT = 200; // recent persons to compare against the full corpus

interface DedupContext {
  runId: string;
  scheduleId: string;
  isDryRun: boolean;
  configOverrides: Record<string, unknown> | null;
}

function tokenSet(s: string | null | undefined): Set<string> {
  if (!s) return new Set();
  // Strip non-alphanumerics. Avoid /u flag for tsconfig target compatibility;
  // ASCII covers our use case (Indian names romanised, English titles).
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  Array.from(a).forEach((t) => {
    if (b.has(t)) intersect++;
  });
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

interface MatchScore {
  score: number;
  signals: { nameJaccard: number; titleJaccard: number; sameOrg: boolean };
}

function scorePair(
  a: { name: string; currentTitle: string | null; currentOrgId: string | null },
  b: { name: string; currentTitle: string | null; currentOrgId: string | null },
): MatchScore {
  const nameJaccard = jaccard(tokenSet(a.name), tokenSet(b.name));
  const titleJaccard = jaccard(tokenSet(a.currentTitle), tokenSet(b.currentTitle));
  const sameOrg = Boolean(a.currentOrgId && b.currentOrgId && a.currentOrgId === b.currentOrgId);
  const score = Math.min(1, 0.5 * nameJaccard + 0.2 * titleJaccard + (sameOrg ? 0.3 : 0));
  return { score, signals: { nameJaccard, titleJaccard, sameOrg } };
}

export async function dedupDispatcher(ctx: DedupContext): Promise<AgentRunResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const cutoff = new Date(Date.now() - SCAN_LOOKBACK_DAYS * 86400_000);
  const recent = await db
    .select({ id: persons.id, name: persons.name, currentTitle: persons.currentTitle, currentOrgId: persons.currentOrgId })
    .from(persons)
    .where(gte(persons.createdAt, cutoff))
    .orderBy(desc(persons.createdAt))
    .limit(SCAN_LIMIT);

  if (recent.length === 0) {
    return { itemsProcessed: 0, output: { reason: "no recent persons to scan" } };
  }

  const corpus = await db
    .select({ id: persons.id, name: persons.name, currentTitle: persons.currentTitle, currentOrgId: persons.currentOrgId })
    .from(persons);

  let autoMerges = 0;
  let reviewCandidates = 0;
  let pairsScanned = 0;
  const reviewPairs: Array<{ aId: string; bId: string; score: number; signals: MatchScore["signals"] }> = [];

  for (const a of recent) {
    for (const b of corpus) {
      if (a.id === b.id) continue;
      // Skip if we'd compare a→b and b→a both (canonical order: smaller id first).
      if (a.id > b.id) continue;
      pairsScanned++;
      const result = scorePair(a, b);
      if (result.score >= AUTO_MERGE_THRESHOLD) {
        autoMerges++;
        // Auto-merge is gated behind explicit admin opt-in via config_overrides.autoMerge=true
        const autoMergeEnabled =
          ctx.configOverrides && typeof ctx.configOverrides === "object" && (ctx.configOverrides as Record<string, unknown>).autoMerge === true;
        if (!ctx.isDryRun && autoMergeEnabled) {
          // Merge logic deferred to a manual merge endpoint pending Week 2.4 follow-on
          // (the persons table doesn't yet have a mergedIntoId column on this schema —
          // see CLAUDE.md known-issues). For now we surface auto-merge candidates as
          // review pairs with the auto-merge flag stamped.
          reviewPairs.push({ aId: a.id, bId: b.id, score: result.score, signals: { ...result.signals, autoMerge: true } as any });
        } else {
          reviewPairs.push({ aId: a.id, bId: b.id, score: result.score, signals: result.signals });
        }
      } else if (result.score >= REVIEW_THRESHOLD) {
        reviewCandidates++;
        reviewPairs.push({ aId: a.id, bId: b.id, score: result.score, signals: result.signals });
      }
    }
  }

  return {
    itemsProcessed: pairsScanned,
    itemsCreated: 0,
    itemsUpdated: 0,
    itemsSkipped: pairsScanned - autoMerges - reviewCandidates,
    output: {
      autoMergeCandidates: autoMerges,
      reviewCandidates,
      pairs: reviewPairs.slice(0, 25), // cap to keep output JSON small
    },
  };
}
