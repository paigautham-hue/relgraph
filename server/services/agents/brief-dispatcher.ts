/**
 * Brief agent dispatcher.
 *
 * Generates one personalized briefing card per active user, written to
 * `digest_cards.type = 'briefing'`. Surfaces in the Today feed at rank 20
 * (just below power_moves, above follow-ups) so it's the first thing the
 * user sees each morning when they have no urgent power-moves.
 *
 * Without a calendar integration, the brief becomes a *week-in-review +
 * today's focus* summary instead of "tomorrow's meetings." Sources:
 *   - Last 7 days of interactions (the user logged or attended)
 *   - User's active opportunities (stalled, momentum, recently-moved)
 *   - Owned Tier-1/2 relationships needing attention
 *   - Recent power-moves on watched orgs/people
 *
 * Content generation: optional Claude Haiku call for a 2-3 sentence natural
 * summary; template fallback when ANTHROPIC_API_KEY is missing or the LLM
 * call fails. Templates are deliberately concise so even the fallback feels
 * deliberate, not broken.
 *
 * Cost: ~$0.0001 per user per day when LLM is used.
 * Idempotency: one briefing card per user per 24h. Re-running the agent
 * within the window skips users who already have an unexpired briefing.
 */

import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../../db";
import {
  digestCards,
  interactions,
  interactionParticipants,
  opportunities,
  ownership,
  organizations,
  persons,
  powerMoves,
  users,
  watches,
} from "../../db/schema";
import type { AgentRunResult } from "../agent-runner.service";

const BRIEF_LOOKBACK_DAYS = 7;
const STALE_OWNED_DAYS = 30;
const CARD_LIFETIME_HOURS = 24;
const RANK = 20;

let _client: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  _client = new Anthropic({ apiKey });
  return _client;
}

interface BriefContext {
  greeting: string;
  interactionCount: number;
  topInteractionPeople: string[]; // up to 3
  activeOpportunityCount: number;
  stalledOpportunities: Array<{ name: string; stage: string; daysStuck: number }>;
  recentlyMovedOpportunities: Array<{ name: string; toStage: string }>;
  staleOwnedRelationships: Array<{ name: string; daysSince: number }>;
  recentPowerMoves: Array<{ headline: string; orgName: string | null }>;
}

export async function briefDispatcher(params: {
  runId: string;
  scheduleId: string;
  isDryRun: boolean;
  configOverrides: Record<string, unknown> | null;
  scopeUserId?: string | null;
}): Promise<AgentRunResult> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Fan out: either one user (scoped) or all active users.
  let userIds: Array<{ id: string; name: string }>;
  if (params.scopeUserId) {
    const rows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.id, params.scopeUserId))
      .limit(1);
    userIds = rows;
  } else {
    userIds = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.isActive, true));
  }

  const cardExpiresAt = new Date(Date.now() + CARD_LIFETIME_HOURS * 3_600_000);
  const dedupCutoff = new Date(Date.now() - CARD_LIFETIME_HOURS * 3_600_000);

  let created = 0;
  let skipped = 0;
  let processed = 0;

  for (const user of userIds) {
    processed++;

    // Idempotency: skip if user already has an unexpired non-dismissed
    // briefing card from the last 24h.
    const [existingCard] = await db
      .select({ id: digestCards.id })
      .from(digestCards)
      .where(
        and(
          eq(digestCards.userId, user.id),
          eq(digestCards.type, "briefing"),
          eq(digestCards.isDismissed, false),
          gte(digestCards.createdAt, dedupCutoff),
        ),
      )
      .limit(1);
    if (existingCard) {
      skipped++;
      continue;
    }

    // Gather the brief context.
    const ctx = await gatherContext(user.id, user.name);
    if (isEmptyContext(ctx)) {
      // Nothing to brief on yet — skip rather than emit a hollow "you have
      // no activity" card. Per Rule 3, empty states are designed surfaces,
      // not dead ones — and the Today feed's empty-state already covers
      // this case without us adding a redundant card.
      skipped++;
      continue;
    }

    const { title, body } = await renderBriefing(ctx, params.isDryRun);

    if (params.isDryRun) {
      skipped++;
      continue;
    }

    await db.insert(digestCards).values({
      id: crypto.randomUUID(),
      userId: user.id,
      type: "briefing",
      title,
      body,
      rank: RANK,
      expiresAt: cardExpiresAt,
    });
    created++;
  }

  return {
    itemsProcessed: processed,
    itemsCreated: created,
    itemsSkipped: skipped,
    output: {
      lookbackDays: BRIEF_LOOKBACK_DAYS,
      llmEnabled: Boolean(getAnthropic()),
    },
  };
}

/**
 * Pull the brief inputs for a user. All queries are bounded; the function
 * returns within ~1s for any sane user.
 */
async function gatherContext(userId: string, userName: string): Promise<BriefContext> {
  const db = getDb();
  const lookback = new Date(Date.now() - BRIEF_LOOKBACK_DAYS * 86400_000);
  const staleCutoff = new Date(Date.now() - STALE_OWNED_DAYS * 86400_000);

  // 1. Interactions the user logged.
  const userInteractions = await db
    .select({ id: interactions.id })
    .from(interactions)
    .where(and(eq(interactions.createdBy, userId), gte(interactions.occurredAt, lookback)))
    .limit(100);

  // 2. Top 3 people the user interacted with most.
  const interactionIds = userInteractions.map((i) => i.id);
  let topInteractionPeople: string[] = [];
  if (interactionIds.length > 0) {
    const participantCounts = new Map<string, number>();
    const participantNames = new Map<string, string>();
    const rows = await db
      .select({ personId: interactionParticipants.personId, personName: persons.name })
      .from(interactionParticipants)
      .innerJoin(persons, eq(interactionParticipants.personId, persons.id))
      .where(
        sql`${interactionParticipants.interactionId} IN (${sql.join(
          interactionIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
    for (const r of rows) {
      participantCounts.set(r.personId, (participantCounts.get(r.personId) ?? 0) + 1);
      participantNames.set(r.personId, r.personName);
    }
    topInteractionPeople = Array.from(participantCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => participantNames.get(id)!)
      .filter(Boolean);
  }

  // 3. Active opportunities owned by user.
  const userOpps = await db
    .select({
      id: opportunities.id,
      name: opportunities.name,
      stage: opportunities.stage,
      lastStageChangeAt: opportunities.lastStageChangeAt,
      isArchived: opportunities.isArchived,
    })
    .from(opportunities)
    .where(and(eq(opportunities.ownerId, userId), eq(opportunities.isArchived, false)))
    .limit(50);

  const stalledOpportunities: BriefContext["stalledOpportunities"] = [];
  const recentlyMovedOpportunities: BriefContext["recentlyMovedOpportunities"] = [];
  const stalledCutoff = new Date(Date.now() - 30 * 86400_000);
  const recentCutoff = new Date(Date.now() - 7 * 86400_000);
  for (const o of userOpps) {
    if (o.stage === "lost" || o.stage === "maintain") continue;
    const stageChangedAt = new Date(o.lastStageChangeAt);
    if (stageChangedAt < stalledCutoff) {
      stalledOpportunities.push({
        name: o.name,
        stage: o.stage,
        daysStuck: Math.round((Date.now() - stageChangedAt.getTime()) / 86400_000),
      });
    } else if (stageChangedAt > recentCutoff) {
      recentlyMovedOpportunities.push({ name: o.name, toStage: o.stage });
    }
  }
  // Cap to top 3 of each
  stalledOpportunities.sort((a, b) => b.daysStuck - a.daysStuck);
  stalledOpportunities.splice(3);
  recentlyMovedOpportunities.splice(3);

  // 4. Stale owned Tier-1/2 relationships.
  const ownedRows = await db
    .select({
      personId: ownership.personId,
      personName: persons.name,
      tier: ownership.tier,
    })
    .from(ownership)
    .innerJoin(persons, eq(ownership.personId, persons.id))
    .where(
      and(
        eq(ownership.ownerUserId, userId),
        or(eq(ownership.tier, "tier_1"), eq(ownership.tier, "tier_2"))!,
      ),
    )
    .limit(50);

  const staleOwnedRelationships: BriefContext["staleOwnedRelationships"] = [];
  for (const row of ownedRows) {
    // Last interaction with this person from the current user?
    const [last] = await db
      .select({ occurredAt: interactions.occurredAt })
      .from(interactionParticipants)
      .innerJoin(interactions, eq(interactionParticipants.interactionId, interactions.id))
      .where(eq(interactionParticipants.personId, row.personId))
      .orderBy(desc(interactions.occurredAt))
      .limit(1);
    if (!last || new Date(last.occurredAt) < staleCutoff) {
      const daysSince = last
        ? Math.round((Date.now() - new Date(last.occurredAt).getTime()) / 86400_000)
        : 9999;
      staleOwnedRelationships.push({ name: row.personName, daysSince });
    }
  }
  staleOwnedRelationships.sort((a, b) => b.daysSince - a.daysSince);
  staleOwnedRelationships.splice(3);

  // 5. Recent power-moves on watched orgs/persons.
  const watchedOrgIds = await db
    .select({ targetId: watches.targetId })
    .from(watches)
    .where(
      and(
        eq(watches.userId, userId),
        eq(watches.isActive, true),
        eq(watches.targetType, "organization"),
      ),
    );
  const orgIds = watchedOrgIds.map((w) => w.targetId).filter((id): id is string => !!id);
  let recentPowerMoves: BriefContext["recentPowerMoves"] = [];
  if (orgIds.length > 0) {
    const moves = await db
      .select({
        headline: powerMoves.headline,
        orgName: organizations.name,
      })
      .from(powerMoves)
      .leftJoin(organizations, eq(powerMoves.primaryOrgId, organizations.id))
      .where(
        and(
          gte(powerMoves.detectedAt, lookback),
          sql`${powerMoves.primaryOrgId} IN (${sql.join(
            orgIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        ),
      )
      .orderBy(desc(powerMoves.detectedAt))
      .limit(3);
    recentPowerMoves = moves;
  }

  return {
    greeting: greetingFor(userName),
    interactionCount: userInteractions.length,
    topInteractionPeople,
    activeOpportunityCount: userOpps.length,
    stalledOpportunities,
    recentlyMovedOpportunities,
    staleOwnedRelationships,
    recentPowerMoves,
  };
}

function greetingFor(name: string): string {
  const hour = new Date().getHours();
  const firstName = name.split(/\s+/)[0] ?? "there";
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

function isEmptyContext(ctx: BriefContext): boolean {
  return (
    ctx.interactionCount === 0 &&
    ctx.activeOpportunityCount === 0 &&
    ctx.stalledOpportunities.length === 0 &&
    ctx.recentlyMovedOpportunities.length === 0 &&
    ctx.staleOwnedRelationships.length === 0 &&
    ctx.recentPowerMoves.length === 0
  );
}

/**
 * Render the briefing card body. Uses Claude Haiku for a natural 2-3
 * sentence summary when the API key is configured; falls back to a clean
 * structured template otherwise.
 */
async function renderBriefing(
  ctx: BriefContext,
  _isDryRun: boolean,
): Promise<{ title: string; body: string }> {
  const title = ctx.greeting;
  const client = getAnthropic();
  const structured = renderStructured(ctx);

  if (!client) {
    return { title, body: structured };
  }

  // Use Claude Haiku for a natural language pass over the same data.
  try {
    const facts = [
      `Last 7 days: ${ctx.interactionCount} interactions${
        ctx.topInteractionPeople.length ? ` (most active with ${ctx.topInteractionPeople.join(", ")})` : ""
      }.`,
      ctx.activeOpportunityCount > 0
        ? `Active opportunities: ${ctx.activeOpportunityCount}.`
        : "",
      ctx.stalledOpportunities.length > 0
        ? `Stalled: ${ctx.stalledOpportunities.map((o) => `"${o.name}" at ${o.stage} for ${o.daysStuck} days`).join("; ")}.`
        : "",
      ctx.recentlyMovedOpportunities.length > 0
        ? `Recently moved: ${ctx.recentlyMovedOpportunities.map((o) => `"${o.name}" → ${o.toStage}`).join("; ")}.`
        : "",
      ctx.staleOwnedRelationships.length > 0
        ? `Stale Tier-1/2: ${ctx.staleOwnedRelationships
            .map((r) => `${r.name} (${r.daysSince === 9999 ? "no contact yet" : `${r.daysSince}d`})`)
            .join("; ")}.`
        : "",
      ctx.recentPowerMoves.length > 0
        ? `Recent power-moves on watched orgs: ${ctx.recentPowerMoves
            .map((m) => `${m.headline}${m.orgName ? ` (${m.orgName})` : ""}`)
            .join("; ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: `You are RelGraph's daily briefing assistant for senior Indian executives. Read the facts and write a 2-3 sentence morning briefing in clear, professional Indian English. No bullet lists, no markdown. Lead with the most important thing they should address today. Keep it under 60 words. Don't repeat the facts verbatim — synthesize.`,
      messages: [{ role: "user", content: facts }],
    });

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (text.length > 20 && text.length < 600) {
      return { title, body: text };
    }
    // Fall through to structured if LLM returned something unreasonable.
    return { title, body: structured };
  } catch {
    return { title, body: structured };
  }
}

/**
 * Plain template fallback. Tight, conversational, no markdown — reads cleanly
 * if shown verbatim.
 */
function renderStructured(ctx: BriefContext): string {
  const parts: string[] = [];

  if (ctx.stalledOpportunities.length > 0) {
    const o = ctx.stalledOpportunities[0];
    parts.push(`"${o.name}" has been at ${o.stage} for ${o.daysStuck} days — your top priority today.`);
  }

  if (ctx.staleOwnedRelationships.length > 0) {
    const names = ctx.staleOwnedRelationships
      .slice(0, 2)
      .map((r) => `${r.name}${r.daysSince < 9999 ? ` (${r.daysSince}d)` : ""}`)
      .join(", ");
    parts.push(`Tier-1/2 relationships gone stale: ${names}.`);
  }

  if (ctx.recentPowerMoves.length > 0) {
    const m = ctx.recentPowerMoves[0];
    parts.push(`New on your watchlist: ${m.headline}.`);
  }

  if (ctx.recentlyMovedOpportunities.length > 0) {
    const moved = ctx.recentlyMovedOpportunities
      .slice(0, 2)
      .map((o) => `"${o.name}" → ${o.toStage}`)
      .join(", ");
    parts.push(`This week you moved ${moved}.`);
  } else if (ctx.interactionCount > 0) {
    parts.push(
      `Last 7 days: ${ctx.interactionCount} interaction${ctx.interactionCount === 1 ? "" : "s"}${
        ctx.topInteractionPeople.length ? `, most active with ${ctx.topInteractionPeople.join(", ")}` : ""
      }.`,
    );
  }

  if (parts.length === 0) {
    return "Quiet week so far. Open the command box to capture anything you've heard, or tap the mic to dictate.";
  }

  return parts.join(" ");
}
