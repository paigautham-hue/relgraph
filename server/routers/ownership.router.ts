/**
 * Ownership router — assigns each tracked person to exactly one team owner.
 *
 * Enforces the "every Tier-1 has exactly one owner" rule from
 * IMPLEMENTATION_PLAN.md: the table has UNIQUE(person_id), so a re-assign
 * is implemented as upsert (delete+insert OR update — we use update if a
 * row exists, insert if not, matching the schema's UNIQUE behavior).
 *
 * `listUnowned` powers the "no_owner" digest card type — surfaces tier_1
 * persons who don't yet have an owner so admins can resolve.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { router, contributorProcedure, managerProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { ownership, persons, organizations, users } from "../db/schema";
import {
  assignOwnershipSchema,
  transferOwnershipSchema,
  removeOwnershipSchema,
} from "../../shared/validation";
import { logAudit } from "../middleware/audit";

export const ownershipRouter = router({
  /**
   * List all ownership assignments. Optional filter by owner.
   */
  list: protectedProcedure
    .input(z.object({ ownerUserId: z.string().uuid().optional() }).optional())
    .query(async ({ input }) => {
      const db = getDb();
      const where = input?.ownerUserId ? eq(ownership.ownerUserId, input.ownerUserId) : undefined;
      const rows = await db
        .select({
          id: ownership.id,
          personId: ownership.personId,
          personName: persons.name,
          personTitle: persons.currentTitle,
          ownerUserId: ownership.ownerUserId,
          ownerName: users.name,
          tier: ownership.tier,
          assignedAt: ownership.assignedAt,
          notes: ownership.notes,
        })
        .from(ownership)
        .innerJoin(persons, eq(ownership.personId, persons.id))
        .innerJoin(users, eq(ownership.ownerUserId, users.id))
        .where(where)
        .orderBy(ownership.tier, persons.name);
      return rows;
    }),

  /**
   * List Tier-1 (or otherwise filterable) persons who don't have an owner.
   * Drives the no_owner digest card (week 6).
   */
  listUnowned: protectedProcedure
    .input(
      z
        .object({
          tier: z.enum(["tier_1", "tier_2", "tier_3", "tier_4"]).optional(),
          limit: z.number().int().min(1).max(100).default(50),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const limit = input?.limit ?? 50;
      // Persons with no ownership row.
      const rows = await db
        .select({
          id: persons.id,
          name: persons.name,
          currentTitle: persons.currentTitle,
          currentOrgId: persons.currentOrgId,
          currentOrgName: organizations.name,
        })
        .from(persons)
        .leftJoin(ownership, eq(ownership.personId, persons.id))
        .leftJoin(organizations, eq(persons.currentOrgId, organizations.id))
        .where(and(isNull(ownership.id), eq(persons.isTracked, true)))
        .orderBy(persons.name)
        .limit(limit);
      return rows;
    }),

  /**
   * Assign or replace ownership for a person. Idempotent: if an ownership row
   * already exists for this person, it's updated rather than failing on the
   * UNIQUE constraint.
   *
   * Manager-gated: only managers and above can change ownership, since
   * incorrect ownership routing causes the "triple-contact / zero-contact"
   * failures described in the IMPLEMENTATION_PLAN.
   */
  assign: managerProcedure
    .input(assignOwnershipSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      // Verify the person exists.
      const [person] = await db
        .select({ id: persons.id })
        .from(persons)
        .where(eq(persons.id, input.personId))
        .limit(1);
      if (!person) throw new TRPCError({ code: "NOT_FOUND", message: "Person not found" });

      const [existing] = await db
        .select()
        .from(ownership)
        .where(eq(ownership.personId, input.personId))
        .limit(1);

      let id: string;
      if (existing) {
        await db
          .update(ownership)
          .set({
            ownerUserId: input.ownerUserId,
            tier: input.tier,
            assignedBy: ctx.user.id,
            assignedAt: new Date(),
            notes: input.notes ?? null,
          })
          .where(eq(ownership.id, existing.id));
        id = existing.id;
        await logAudit({
          userId: ctx.user.id,
          actionType: "update",
          entityType: "ownership",
          entityId: id,
          oldValue: JSON.stringify({ ownerUserId: existing.ownerUserId, tier: existing.tier }),
          newValue: JSON.stringify({ ownerUserId: input.ownerUserId, tier: input.tier }),
        });
      } else {
        id = crypto.randomUUID();
        await db.insert(ownership).values({
          id,
          personId: input.personId,
          ownerUserId: input.ownerUserId,
          tier: input.tier,
          assignedBy: ctx.user.id,
          notes: input.notes ?? null,
        });
        await logAudit({
          userId: ctx.user.id,
          actionType: "create",
          entityType: "ownership",
          entityId: id,
          newValue: JSON.stringify(input),
        });
      }
      return { id };
    }),

  transfer: managerProcedure
    .input(transferOwnershipSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(ownership)
        .where(eq(ownership.personId, input.personId))
        .limit(1);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No ownership exists for this person yet. Use Assign instead.",
        });
      }
      if (existing.ownerUserId === input.newOwnerUserId) {
        return { id: existing.id, changed: false };
      }
      await db
        .update(ownership)
        .set({
          ownerUserId: input.newOwnerUserId,
          assignedBy: ctx.user.id,
          assignedAt: new Date(),
          notes: input.notes ?? existing.notes,
        })
        .where(eq(ownership.id, existing.id));
      await logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "ownership",
        entityId: existing.id,
        fieldName: "owner_user_id",
        oldValue: existing.ownerUserId,
        newValue: input.newOwnerUserId,
      });
      return { id: existing.id, changed: true };
    }),

  remove: managerProcedure
    .input(removeOwnershipSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(ownership)
        .where(eq(ownership.personId, input.personId))
        .limit(1);
      if (!existing) {
        return { ok: true, changed: false };
      }
      await db.delete(ownership).where(eq(ownership.id, existing.id));
      await logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "ownership",
        entityId: existing.id,
      });
      return { ok: true, changed: true };
    }),
});
