/**
 * Today router — drives the Today action feed and the universal command box.
 *
 * Procedures:
 *   - feed: paginated digest cards for the current user (from `digest_cards`)
 *   - dismissCard: mark a card dismissed
 *   - actCard: mark a card actioned (the user clicked through to follow up)
 *   - command: classify an utterance + dispatch the matched tool
 *
 * The digest agent (week 6) populates `digest_cards`. Until that ships, the
 * feed will be sparse — that's expected and the empty state is designed to
 * teach the user what to do.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { digestCards, organizations, persons, opportunities, powerMoves } from "../db/schema";
import { classifyIntent } from "../services/intent-router.service";
import { dispatchIntent } from "../services/command-dispatcher.service";
import { logAudit } from "../middleware/audit";

const feedFilterSchema = z.object({
  includeDismissed: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(50),
});

export const todayRouter = router({
  /**
   * Today action feed for the signed-in user. Returns ranked cards with the
   * minimal data needed to render plus reference IDs for follow-up navigation.
   * Cards are joined to related person/org/opportunity/power-move so the UI
   * doesn't need a second round-trip per card.
   */
  feed: protectedProcedure.input(feedFilterSchema).query(async ({ input, ctx }) => {
    const db = getDb();
    const conds = [eq(digestCards.userId, ctx.user.id)];
    if (!input.includeDismissed) conds.push(eq(digestCards.isDismissed, false));
    // Hide expired cards
    conds.push(or(isNull(digestCards.expiresAt), lte(sql`NOW()`, digestCards.expiresAt))!);

    const rows = await db
      .select({
        id: digestCards.id,
        type: digestCards.type,
        title: digestCards.title,
        body: digestCards.body,
        rank: digestCards.rank,
        relatedPersonId: digestCards.relatedPersonId,
        relatedPersonName: persons.name,
        relatedOrgId: digestCards.relatedOrgId,
        relatedOrgName: organizations.name,
        relatedOpportunityId: digestCards.relatedOpportunityId,
        relatedOpportunityName: opportunities.name,
        relatedPowerMoveId: digestCards.relatedPowerMoveId,
        relatedPowerMoveHeadline: powerMoves.headline,
        actionPayload: digestCards.actionPayload,
        isDismissed: digestCards.isDismissed,
        isActioned: digestCards.isActioned,
        createdAt: digestCards.createdAt,
        expiresAt: digestCards.expiresAt,
      })
      .from(digestCards)
      .leftJoin(persons, eq(digestCards.relatedPersonId, persons.id))
      .leftJoin(organizations, eq(digestCards.relatedOrgId, organizations.id))
      .leftJoin(opportunities, eq(digestCards.relatedOpportunityId, opportunities.id))
      .leftJoin(powerMoves, eq(digestCards.relatedPowerMoveId, powerMoves.id))
      .where(and(...conds))
      .orderBy(digestCards.rank, desc(digestCards.createdAt))
      .limit(input.limit);

    return rows.map(r => ({
      ...r,
      // Drizzle types json columns as `unknown`; narrow at the boundary.
      actionPayload: (r.actionPayload ?? null) as Record<string, unknown> | null,
    }));
  }),

  dismissCard: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [existing] = await db
        .select({ userId: digestCards.userId })
        .from(digestCards)
        .where(eq(digestCards.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      if (existing.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your card" });
      }
      await db
        .update(digestCards)
        .set({ isDismissed: true, dismissedAt: new Date() })
        .where(eq(digestCards.id, input.id));
      await logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "digest_card",
        entityId: input.id,
        fieldName: "is_dismissed",
        newValue: "true",
      });
      return { id: input.id, ok: true };
    }),

  actCard: protectedProcedure
    .input(z.object({ id: z.string().uuid(), note: z.string().max(2000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [existing] = await db
        .select({ userId: digestCards.userId })
        .from(digestCards)
        .where(eq(digestCards.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      if (existing.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your card" });
      }
      await db
        .update(digestCards)
        .set({ isActioned: true, actionedAt: new Date() })
        .where(eq(digestCards.id, input.id));
      await logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "digest_card",
        entityId: input.id,
        fieldName: "is_actioned",
        newValue: "true",
        metadata: input.note ? { note: input.note } : null,
      });
      return { id: input.id, ok: true };
    }),

  /**
   * Universal command: classify the utterance and dispatch the matched tool
   * in one round-trip. Used by the command box at the top of the Today page.
   *
   * Returns both the classification (so the UI can show "Routing as: brief
   * Person") and the dispatch result (so the UI can render output).
   */
  command: protectedProcedure
    .input(z.object({ utterance: z.string().min(1).max(2000) }))
    .mutation(async ({ input, ctx }) => {
      const intent = await classifyIntent(input.utterance);
      const result = await dispatchIntent(intent, {
        userId: ctx.user.id,
        userName: ctx.user.name,
      });
      // Audit the command. Mutations done by the dispatcher (interactions,
      // watches) are individually audited; the command itself is logged as
      // a 'voice_query'/'text_query' meta-action.
      await logAudit({
        userId: ctx.user.id,
        actionType: "text_query",
        entityType: "user",
        entityId: ctx.user.id,
        rawInputText: input.utterance,
        metadata: {
          tool: intent.tool,
          confidence: intent.confidence,
          resultKind: result.kind,
        },
      });
      return { intent, result };
    }),

  /**
   * Classification only — used by the command box to show "I think you mean
   * X" before the user confirms. Cheaper round-trip when the user is still
   * editing.
   */
  classify: protectedProcedure
    .input(z.object({ utterance: z.string().min(1).max(2000) }))
    .query(async ({ input }) => {
      return await classifyIntent(input.utterance);
    }),

  /**
   * Execute a pre-classified voice intent. Used by the VoiceBot
   * (Gemini Live) which receives structured function-calls from Gemini's
   * own classifier — no need to re-run Claude Haiku.
   *
   * Returns the same `CommandResult` shape as `command()`, plus a short
   * `voiceSummary` field intended to be spoken back to the user (TTS-friendly,
   * <= 200 chars, conversational tone).
   */
  executeVoiceIntent: protectedProcedure
    .input(
      z.object({
        tool: z.enum([
          "findPath",
          "briefPerson",
          "logInteraction",
          "searchIntel",
          "updateOpportunity",
          "addToWatchlist",
          "whoOwns",
          "coverageGap",
        ]),
        args: z.record(z.string(), z.string().or(z.number()).or(z.boolean())).default({}),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Coerce all arg values to strings (Gemini may send mixed types).
      const argsAsStrings: Record<string, string> = {};
      for (const [k, v] of Object.entries(input.args)) {
        argsAsStrings[k] = String(v);
      }
      const result = await dispatchIntent(
        { tool: input.tool, args: argsAsStrings, confidence: 1.0 },
        { userId: ctx.user.id, userName: ctx.user.name },
      );
      // Voice-friendly summary: keep it under 200 chars, no markdown.
      const voiceSummary = result.summary
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\n+/g, " ")
        .slice(0, 200);
      await logAudit({
        userId: ctx.user.id,
        actionType: "voice_query",
        entityType: "user",
        entityId: ctx.user.id,
        rawInputText: `[voice] ${input.tool}`,
        metadata: { tool: input.tool, args: input.args, resultKind: result.kind },
      });
      return { result, voiceSummary };
    }),
});
