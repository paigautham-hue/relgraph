/**
 * Watches router — exposes the user's subscription list to the UI.
 *
 * Watches are created via the command box (`addToWatchlist` intent), but
 * users need a place to see and manage them. This router powers the
 * Settings → Watches page.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { watches } from "../db/schema";
import { updateWatchSchema, deleteWatchSchema } from "../../shared/validation";
import { logAudit } from "../middleware/audit";

export const watchesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const rows = await db
      .select({
        id: watches.id,
        targetType: watches.targetType,
        targetId: watches.targetId,
        targetLabel: watches.targetLabel,
        isActive: watches.isActive,
        notifyDigest: watches.notifyDigest,
        notifyPush: watches.notifyPush,
        createdAt: watches.createdAt,
      })
      .from(watches)
      .where(eq(watches.userId, ctx.user.id))
      .orderBy(desc(watches.createdAt));
    return rows;
  }),

  update: protectedProcedure.input(updateWatchSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const [existing] = await db
      .select({ userId: watches.userId })
      .from(watches)
      .where(eq(watches.id, input.id))
      .limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Watch not found" });
    if (existing.userId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not your watch" });
    }
    const updates: Record<string, unknown> = {};
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.notifyDigest !== undefined) updates.notifyDigest = input.notifyDigest;
    if (input.notifyPush !== undefined) updates.notifyPush = input.notifyPush;
    if (Object.keys(updates).length === 0) return { id: input.id, changed: false };

    await db.update(watches).set(updates).where(eq(watches.id, input.id));
    await logAudit({
      userId: ctx.user.id,
      actionType: "update",
      entityType: "watch",
      entityId: input.id,
      newValue: JSON.stringify(updates),
    });
    return { id: input.id, changed: true };
  }),

  delete: protectedProcedure.input(deleteWatchSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const [existing] = await db
      .select({ userId: watches.userId })
      .from(watches)
      .where(eq(watches.id, input.id))
      .limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Watch not found" });
    if (existing.userId !== ctx.user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not your watch" });
    }
    await db.delete(watches).where(eq(watches.id, input.id));
    await logAudit({
      userId: ctx.user.id,
      actionType: "delete",
      entityType: "watch",
      entityId: input.id,
    });
    return { id: input.id, ok: true };
  }),
});
