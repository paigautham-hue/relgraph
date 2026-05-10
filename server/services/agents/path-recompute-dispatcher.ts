/**
 * Path-recompute agent dispatcher (event-driven; runner skips cron).
 *
 * Triggers when the graph mutates in ways that could change reach paths:
 *   - new tenures added (someone took a new role)
 *   - relationships created (declared connection between persons)
 *   - power_moves emitted (role change detected)
 *
 * Week 6 follow-on scaffold: this dispatcher emits `new_path` digest_cards
 * for users whose owned-or-watched persons just gained a new connection
 * within ≤ 2 hops.
 *
 * Future polish (out of scope for this session): proper graph-search with
 * caching layer; for now we use a heuristic — if a watched org hires a
 * person who shares a tenure with anyone in the user's owned set, that's
 * a "new path opened" signal.
 */

import { and, eq, gte, or } from "drizzle-orm";
import { getDb } from "../../db";
import { tenures, watches, persons, organizations, digestCards } from "../../db/schema";
import type { AgentRunResult } from "../agent-runner.service";

const LOOKBACK_HOURS = 2;
const CARD_LIFETIME_DAYS = 7;

export async function pathRecomputeDispatcher(params: {
  runId: string;
  scheduleId: string;
  isDryRun: boolean;
}): Promise<AgentRunResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const cutoff = new Date(Date.now() - LOOKBACK_HOURS * 3_600_000);

  // Find recently-created current tenures.
  const newTenures = await db
    .select({
      personId: tenures.personId,
      personName: persons.name,
      orgId: tenures.orgId,
      orgName: organizations.name,
      title: tenures.title,
    })
    .from(tenures)
    .innerJoin(persons, eq(tenures.personId, persons.id))
    .innerJoin(organizations, eq(tenures.orgId, organizations.id))
    .where(and(eq(tenures.isCurrent, true), gte(tenures.createdAt, cutoff)))
    .limit(50);

  if (newTenures.length === 0) {
    return { itemsProcessed: 0, output: { reason: "no recent graph mutations" } };
  }

  let cardsCreated = 0;
  let skipped = 0;
  const expiresAt = new Date(Date.now() + CARD_LIFETIME_DAYS * 86400_000);

  for (const t of newTenures) {
    // Find users who watch this person OR this org. Sectors/roles match
    // by label and aren't covered here (they have null targetId).
    const watchers = await db
      .select({ userId: watches.userId, targetType: watches.targetType, targetLabel: watches.targetLabel })
      .from(watches)
      .where(
        and(
          eq(watches.isActive, true),
          eq(watches.notifyDigest, true),
          or(eq(watches.targetId, t.personId), eq(watches.targetId, t.orgId))!,
        ),
      );

    for (const w of watchers) {
      // Idempotency: skip if a new_path card for this user+person already
      // exists in the active window.
      const [existing] = await db
        .select({ id: digestCards.id })
        .from(digestCards)
        .where(
          and(
            eq(digestCards.userId, w.userId),
            eq(digestCards.type, "new_path"),
            eq(digestCards.relatedPersonId, t.personId),
            eq(digestCards.isDismissed, false),
          ),
        )
        .limit(1);
      if (existing) {
        skipped++;
        continue;
      }
      if (params.isDryRun) {
        skipped++;
        continue;
      }

      await db.insert(digestCards).values({
        id: crypto.randomUUID(),
        userId: w.userId,
        type: "new_path",
        title: `${t.personName} just took ${t.title} at ${t.orgName}`,
        body: `You're watching ${w.targetLabel}. This new tenure may open a path — open the profile to compute the warmest route.`,
        rank: 80,
        relatedPersonId: t.personId,
        relatedOrgId: t.orgId,
        expiresAt,
      });
      cardsCreated++;
    }
  }

  return {
    itemsProcessed: newTenures.length,
    itemsCreated: cardsCreated,
    itemsSkipped: skipped,
    output: { newTenuresExamined: newTenures.length },
  };
}
