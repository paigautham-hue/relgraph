/**
 * Provenance router — surfaces the trail behind every fact.
 *
 * Query path: `listForEntity({ entityType, entityId })` returns all
 * provenance rows attached, sorted newest-first. The UI renders these as
 * a chip with tap-to-reveal-details (per Rule 3 #2 — "every fact has a
 * discreet provenance chip; tap reveals source, captured-by, when,
 * confidence, expires-at").
 *
 * Write path: `record({ ... })` is called by other routers when they create
 * facts. For week 5 scaffold, only the new opportunity / interaction / note
 * paths call it; existing-router back-fill is a follow-on. This is the
 * documented pattern in CLAUDE.md and lets us roll out without disrupting
 * legacy routes.
 *
 * `verify` lets a manager mark a provenance entry as personally verified —
 * this raises confidence in the UI's chip display and exempts the fact from
 * the trust-auditor's stale-demotion pass (week 6).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { router, protectedProcedure, contributorProcedure, managerProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { provenance, users } from "../db/schema";
import {
  createProvenanceSchema,
  verifyProvenanceSchema,
  provenanceForEntitySchema,
} from "../../shared/validation";
import { logAudit } from "../middleware/audit";

export const provenanceRouter = router({
  /**
   * List provenance entries for a given entity. Ordered newest-first.
   * Includes capturer/verifier names so the chip can display "Captured by
   * Amit · Verified by Priya · 14 days ago".
   */
  listForEntity: protectedProcedure
    .input(provenanceForEntitySchema)
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({
          id: provenance.id,
          entityType: provenance.entityType,
          entityId: provenance.entityId,
          fieldName: provenance.fieldName,
          sourceType: provenance.sourceType,
          sourceUrl: provenance.sourceUrl,
          sourceLabel: provenance.sourceLabel,
          capturedBy: provenance.capturedBy,
          capturedAt: provenance.capturedAt,
          confidence: provenance.confidence,
          verifiedBy: provenance.verifiedBy,
          verifiedAt: provenance.verifiedAt,
          expiresAt: provenance.expiresAt,
        })
        .from(provenance)
        .where(
          and(
            eq(provenance.entityType, input.entityType),
            eq(provenance.entityId, input.entityId),
          ),
        )
        .orderBy(desc(provenance.capturedAt))
        .limit(50);

      // Resolve capturer + verifier names in a single batch (typically <= 2).
      const userIds = new Set<string>();
      for (const r of rows) {
        if (r.capturedBy) userIds.add(r.capturedBy);
        if (r.verifiedBy) userIds.add(r.verifiedBy);
      }
      const nameMap = new Map<string, string>();
      if (userIds.size > 0) {
        const userIdList = Array.from(userIds);
        // Drizzle MySQL doesn't have a clean variadic IN helper here; use
        // OR chain — userIds is bounded by the page-size limit (50) so the
        // query is fine.
        for (const id of userIdList) {
          const [u] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id)).limit(1);
          if (u) nameMap.set(u.id, u.name);
        }
      }

      const now = Date.now();
      return rows.map((r) => ({
        ...r,
        capturedByName: r.capturedBy ? nameMap.get(r.capturedBy) ?? null : null,
        verifiedByName: r.verifiedBy ? nameMap.get(r.verifiedBy) ?? null : null,
        // The trust-auditor (week 6) updates expires_at — we surface a UI
        // hint here so the chip can show "Stale — captured 8 months ago".
        isStale: r.expiresAt ? now >= new Date(r.expiresAt).getTime() : false,
      }));
    }),

  /**
   * Record provenance for a fact. Returns the new id.
   *
   * Used by other routers via in-process imports (not typically from the
   * client). Exposed as a procedure mainly for testing + admin tools that
   * back-fill provenance on legacy records.
   */
  record: contributorProcedure
    .input(createProvenanceSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const id = crypto.randomUUID();
      await db.insert(provenance).values({
        id,
        entityType: input.entityType,
        entityId: input.entityId,
        fieldName: input.fieldName ?? null,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl ?? null,
        sourceLabel: input.sourceLabel ?? null,
        contentHash: input.contentHash ?? null,
        capturedBy: ctx.user.id,
        confidence: input.confidence ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        metadata: input.metadata ?? null,
      });
      await logAudit({
        userId: ctx.user.id,
        actionType: "create",
        entityType: "provenance",
        entityId: id,
        newValue: JSON.stringify({
          entityType: input.entityType,
          entityId: input.entityId,
          sourceType: input.sourceType,
        }),
      });
      return { id };
    }),

  /**
   * Mark a provenance entry as personally verified. Manager-gated since
   * verification raises trust signals across the team's view of this fact.
   */
  verify: managerProcedure
    .input(verifyProvenanceSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(provenance)
        .where(eq(provenance.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Provenance not found" });

      await db
        .update(provenance)
        .set({ verifiedBy: ctx.user.id, verifiedAt: new Date() })
        .where(eq(provenance.id, input.id));

      await logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "provenance",
        entityId: input.id,
        fieldName: "verified_by",
        newValue: ctx.user.id,
      });
      return { id: input.id };
    }),
});

/**
 * Helper for in-process callers (other routers) that need to record
 * provenance as part of their own write transaction. Returns the new id;
 * never throws — provenance is best-effort.
 *
 * `capturedBy` accepts null for system-driven writes (e.g. ingestion agents)
 * — the column itself is nullable.
 */
export async function recordProvenance(params: {
  entityType: typeof createProvenanceSchema._input.entityType;
  entityId: string;
  fieldName?: string;
  sourceType: typeof createProvenanceSchema._input.sourceType;
  sourceUrl?: string;
  sourceLabel?: string;
  contentHash?: string;
  capturedBy: string | null;
  confidence?: number;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const db = getDb();
    const id = crypto.randomUUID();
    await db.insert(provenance).values({
      id,
      entityType: params.entityType,
      entityId: params.entityId,
      fieldName: params.fieldName ?? null,
      sourceType: params.sourceType,
      sourceUrl: params.sourceUrl ?? null,
      sourceLabel: params.sourceLabel ?? null,
      contentHash: params.contentHash ?? null,
      capturedBy: params.capturedBy,
      confidence: params.confidence ?? null,
      expiresAt: params.expiresAt ?? null,
      metadata: params.metadata ?? null,
    });
    return id;
  } catch (err) {
    console.error("[provenance] Failed to record:", err);
    return null;
  }
}
