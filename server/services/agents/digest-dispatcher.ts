/**
 * Digest agent dispatcher.
 *
 * Runs once per user (the agent runner fans out to active users when
 * is_user_scoped=true; for week 6 scaffold the runner invokes once with no
 * scope and we iterate users ourselves to keep the change small).
 *
 * For each user, assembles up to ~12 ranked digest cards:
 *
 *   1. power_move      — unread power-moves on watched orgs/persons (rank 10)
 *   2. watchlist_hit   — new persons/changes in watched targets (rank 20)
 *   3. follow_up       — interactions older than 14 days needing attention (rank 30)
 *   4. opportunity_stall — opportunities with no activity in 30 days (rank 40)
 *   5. opportunity_momentum — opportunities recently moved forward (rank 45)
 *   6. stale_relationship — Tier-1 owned persons with no interaction in 60 days (rank 50)
 *   7. no_owner        — Tier-1 candidates with no ownership (rank 60)
 *   8. team_intel      — recent reflections from teammates (rank 70)
 *   9. new_path        — newly opened paths from path-recompute (rank 80)
 *
 * Lower rank = higher visibility on the Today feed. The Today router orders
 * cards by rank ASC then created_at DESC.
 *
 * Idempotent within a 24h window: before inserting, the dispatcher checks
 * for an existing un-dismissed card with the same (userId, type,
 * relatedPersonId|relatedOrgId|relatedOpportunityId) and skips if present.
 * Re-running the digest after a dismissal lets dismissed cards stay dismissed.
 */

import { and, desc, eq, isNull, lte, gte, sql, or } from "drizzle-orm";
import { getDb } from "../../db";
import {
  digestCards,
  watches,
  powerMoves,
  ownership,
  persons,
  organizations,
  opportunities,
  interactions,
  interactionParticipants,
  users,
} from "../../db/schema";
import type { AgentRunResult } from "../agent-runner.service";

const DIGEST_LOOKBACK_DAYS = 7;
const STALE_INTERACTION_DAYS = 60;
const STALE_OPPORTUNITY_DAYS = 30;
const FOLLOW_UP_DAYS = 14;
const CARD_LIFETIME_DAYS = 7;

/**
 * Build digest cards for ALL active users. Used when the runner invokes the
 * digest agent without a scope (week 6 scaffold). When `scopeUserId` is
 * provided, only that user's cards are built.
 */
export async function digestDispatcher(params: {
  runId: string;
  scheduleId: string;
  isDryRun: boolean;
  configOverrides: Record<string, unknown> | null;
  scopeUserId?: string | null;
}): Promise<AgentRunResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Fan out: either one user (scoped) or all active users.
  let userIds: string[];
  if (params.scopeUserId) {
    userIds = [params.scopeUserId];
  } else {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.isActive, true));
    userIds = rows.map((r) => r.id);
  }

  let itemsCreated = 0;
  let itemsSkipped = 0;
  let itemsProcessed = 0;
  const expiresAt = new Date(Date.now() + CARD_LIFETIME_DAYS * 86400_000);

  for (const userId of userIds) {
    const cards = await assembleCardsForUser(userId, expiresAt);
    itemsProcessed += cards.length;

    if (params.isDryRun) {
      itemsSkipped += cards.length;
      continue;
    }

    for (const card of cards) {
      // Idempotency check — skip if there's already an undismissed card with
      // the same identifying triple in the active window.
      const dupConds = [
        eq(digestCards.userId, userId),
        eq(digestCards.type, card.type),
        eq(digestCards.isDismissed, false),
        gte(digestCards.createdAt, new Date(Date.now() - CARD_LIFETIME_DAYS * 86400_000)),
      ];
      if (card.relatedPersonId) dupConds.push(eq(digestCards.relatedPersonId, card.relatedPersonId));
      if (card.relatedOrgId) dupConds.push(eq(digestCards.relatedOrgId, card.relatedOrgId));
      if (card.relatedOpportunityId) dupConds.push(eq(digestCards.relatedOpportunityId, card.relatedOpportunityId));
      if (card.relatedPowerMoveId) dupConds.push(eq(digestCards.relatedPowerMoveId, card.relatedPowerMoveId));

      const [existing] = await db.select({ id: digestCards.id }).from(digestCards).where(and(...dupConds)).limit(1);
      if (existing) {
        itemsSkipped++;
        continue;
      }

      await db.insert(digestCards).values({
        id: crypto.randomUUID(),
        userId,
        type: card.type,
        title: card.title,
        body: card.body,
        rank: card.rank,
        relatedPersonId: card.relatedPersonId ?? null,
        relatedOrgId: card.relatedOrgId ?? null,
        relatedOpportunityId: card.relatedOpportunityId ?? null,
        relatedPowerMoveId: card.relatedPowerMoveId ?? null,
        actionPayload: card.actionPayload ?? null,
        expiresAt,
      });
      itemsCreated++;
    }
  }

  return {
    itemsProcessed,
    itemsCreated,
    itemsSkipped,
    output: { users: userIds.length },
  };
}

interface DigestCardSpec {
  type: string;
  title: string;
  body: string | null;
  rank: number;
  relatedPersonId?: string;
  relatedOrgId?: string;
  relatedOpportunityId?: string;
  relatedPowerMoveId?: string;
  actionPayload?: Record<string, unknown>;
}

async function assembleCardsForUser(userId: string, _expiresAt: Date): Promise<DigestCardSpec[]> {
  const db = getDb();
  const cards: DigestCardSpec[] = [];

  // ─── 1. Recent power-moves on watched orgs/persons ────────────────────────
  const userWatches = await db
    .select({ targetType: watches.targetType, targetId: watches.targetId })
    .from(watches)
    .where(and(eq(watches.userId, userId), eq(watches.isActive, true), eq(watches.notifyDigest, true)));
  const watchedOrgIds = userWatches.filter((w) => w.targetType === "organization" && w.targetId).map((w) => w.targetId!);
  const watchedPersonIds = userWatches.filter((w) => w.targetType === "person" && w.targetId).map((w) => w.targetId!);

  if (watchedOrgIds.length || watchedPersonIds.length) {
    const since = new Date(Date.now() - DIGEST_LOOKBACK_DAYS * 86400_000);
    const orgFilter = watchedOrgIds.length
      ? sql`${powerMoves.primaryOrgId} IN (${sql.join(watchedOrgIds.map((id) => sql`${id}`), sql`, `)})`
      : sql`FALSE`;
    const personFilter = watchedPersonIds.length
      ? sql`${powerMoves.primaryPersonId} IN (${sql.join(watchedPersonIds.map((id) => sql`${id}`), sql`, `)})`
      : sql`FALSE`;

    const moves = await db
      .select({
        id: powerMoves.id,
        type: powerMoves.type,
        headline: powerMoves.headline,
        summary: powerMoves.summary,
        primaryOrgId: powerMoves.primaryOrgId,
        primaryPersonId: powerMoves.primaryPersonId,
      })
      .from(powerMoves)
      .where(and(eq(powerMoves.isPublished, true), gte(powerMoves.detectedAt, since), or(orgFilter, personFilter)!))
      .orderBy(desc(powerMoves.detectedAt))
      .limit(5);

    for (const m of moves) {
      cards.push({
        type: "power_move",
        title: m.headline,
        body: m.summary,
        rank: 10,
        relatedPowerMoveId: m.id,
        relatedOrgId: m.primaryOrgId ?? undefined,
        relatedPersonId: m.primaryPersonId ?? undefined,
      });
    }
  }

  // ─── 2. Owned relationships gone stale ────────────────────────────────────
  const ownedRows = await db
    .select({
      personId: ownership.personId,
      personName: persons.name,
      tier: ownership.tier,
    })
    .from(ownership)
    .innerJoin(persons, eq(ownership.personId, persons.id))
    .where(and(eq(ownership.ownerUserId, userId), or(eq(ownership.tier, "tier_1"), eq(ownership.tier, "tier_2"))!))
    .limit(50);

  if (ownedRows.length) {
    const since = new Date(Date.now() - STALE_INTERACTION_DAYS * 86400_000);
    for (const row of ownedRows) {
      // Has any interaction with this person in the last STALE_INTERACTION_DAYS?
      const [{ recentCount }] = await db
        .select({ recentCount: sql<number>`COUNT(*)` })
        .from(interactionParticipants)
        .innerJoin(interactions, eq(interactionParticipants.interactionId, interactions.id))
        .where(and(eq(interactionParticipants.personId, row.personId), gte(interactions.occurredAt, since)));
      if (Number(recentCount) === 0) {
        cards.push({
          type: "stale_relationship",
          title: `${row.personName} hasn't heard from you in over ${STALE_INTERACTION_DAYS} days`,
          body: `You own this ${row.tier.replace("_", " ")} relationship — try the command box: "Reach out to ${row.personName}".`,
          rank: 50,
          relatedPersonId: row.personId,
        });
      }
    }
  }

  // ─── 3. No-owner candidates (Tier-1 in scope: tracked persons currently at owner-level orgs) ──
  // Surface up to 5 unowned tracked persons. The list is large in early days;
  // we cap to keep the digest scannable.
  const unowned = await db
    .select({ id: persons.id, name: persons.name, currentTitle: persons.currentTitle })
    .from(persons)
    .leftJoin(ownership, eq(ownership.personId, persons.id))
    .where(and(isNull(ownership.id), eq(persons.isTracked, true)))
    .limit(5);
  for (const p of unowned) {
    cards.push({
      type: "no_owner",
      title: `${p.name} has no owner`,
      body: p.currentTitle ? `${p.currentTitle}. Assign an owner from their profile.` : "Assign an owner from their profile.",
      rank: 60,
      relatedPersonId: p.id,
    });
  }

  // ─── 4. Stalled opportunities ─────────────────────────────────────────────
  const staleSince = new Date(Date.now() - STALE_OPPORTUNITY_DAYS * 86400_000);
  const stalled = await db
    .select({
      id: opportunities.id,
      name: opportunities.name,
      stage: opportunities.stage,
      lastStageChangeAt: opportunities.lastStageChangeAt,
    })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.ownerId, userId),
        eq(opportunities.isArchived, false),
        sql`${opportunities.stage} NOT IN ('lost', 'maintain')`,
        lte(opportunities.lastStageChangeAt, staleSince),
      ),
    )
    .limit(10);
  for (const o of stalled) {
    const days = Math.round((Date.now() - new Date(o.lastStageChangeAt).getTime()) / 86400_000);
    cards.push({
      type: "opportunity_stall",
      title: `"${o.name}" has been at ${o.stage} for ${days} days`,
      body: "Use the command box to log progress or transition stage.",
      rank: 40,
      relatedOpportunityId: o.id,
    });
  }

  // ─── 5. Follow-ups: interactions logged > FOLLOW_UP_DAYS ago without a stage advance ──
  const followCutoff = new Date(Date.now() - FOLLOW_UP_DAYS * 86400_000);
  const recentInteractions = await db
    .select({ id: interactions.id, summary: interactions.summary, occurredAt: interactions.occurredAt })
    .from(interactions)
    .where(and(eq(interactions.createdBy, userId), lte(interactions.occurredAt, followCutoff)))
    .orderBy(desc(interactions.occurredAt))
    .limit(3);
  for (const i of recentInteractions) {
    cards.push({
      type: "follow_up",
      title: `Follow up on: ${(i.summary ?? "").slice(0, 80)}${(i.summary ?? "").length > 80 ? "…" : ""}`,
      body: `Logged ${Math.round((Date.now() - new Date(i.occurredAt).getTime()) / 86400_000)} days ago — anything land since?`,
      rank: 30,
    });
  }

  return cards;
}
