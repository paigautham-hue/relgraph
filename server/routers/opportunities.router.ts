/**
 * Opportunities router — first-class business initiatives with a 7-stage
 * state machine.
 *
 * Stages: identify → map → approach → engage → close → maintain (and lost
 * from any active stage; lost can be reactivated to identify).
 *
 * Visibility: every opportunity has a `visibility_scope` (private / team /
 * org). The list endpoint filters by what the caller is allowed to see:
 *   - private: only the owner OR creator
 *   - team:    any authenticated user in the same domain
 *   - org:     any authenticated user
 *
 * All mutations write audit_log via the audit middleware.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { router, contributorProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  opportunities,
  opportunityLinks,
  organizations,
  persons,
  users,
  userDomainAccess,
} from "../db/schema";
import {
  createOpportunitySchema,
  updateOpportunitySchema,
  transitionOpportunityStageSchema,
  opportunityFilterSchema,
  createOpportunityLinkSchema,
  deleteOpportunityLinkSchema,
} from "../../shared/validation";
import { OPPORTUNITY_STAGE_TRANSITIONS } from "../../shared/enums";
import type { OpportunityStage } from "../../shared/enums";
import { logAudit } from "../middleware/audit";

/**
 * Return the list of domain IDs the user has access to. Admins (and above)
 * see everything. Used to scope `team`-visibility opportunities.
 */
async function userAccessibleDomainIds(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ domainId: userDomainAccess.domainId })
    .from(userDomainAccess)
    .where(eq(userDomainAccess.userId, userId));
  return rows.map((r) => r.domainId);
}

export const opportunitiesRouter = router({
  /**
   * List opportunities visible to the caller. Filter by domain, owner, stage,
   * archived flag, or free-text search on name.
   */
  list: protectedProcedure.input(opportunityFilterSchema).query(async ({ input, ctx }) => {
    const db = getDb();
    const accessibleDomainIds = await userAccessibleDomainIds(ctx.user.id);

    const conds = [];
    if (input.domainId) conds.push(eq(opportunities.domainId, input.domainId));
    if (input.ownerId) conds.push(eq(opportunities.ownerId, input.ownerId));
    if (input.stage) conds.push(eq(opportunities.stage, input.stage));
    if (input.isArchived !== undefined) conds.push(eq(opportunities.isArchived, input.isArchived));
    if (input.search) conds.push(like(opportunities.name, `%${input.search}%`));

    // Visibility filter — see file header for semantics.
    const visibilityCond = or(
      eq(opportunities.visibilityScope, "org"),
      and(
        eq(opportunities.visibilityScope, "team"),
        accessibleDomainIds.length > 0
          ? inArray(opportunities.domainId, accessibleDomainIds)
          : sql`FALSE`,
      ),
      and(
        eq(opportunities.visibilityScope, "private"),
        or(eq(opportunities.ownerId, ctx.user.id), eq(opportunities.createdBy, ctx.user.id)),
      ),
    );
    if (visibilityCond) conds.push(visibilityCond);

    const where = conds.length ? and(...conds) : undefined;

    const [{ total }] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(opportunities)
      .where(where);

    const ownerAlias = users;
    const rows = await db
      .select({
        id: opportunities.id,
        name: opportunities.name,
        description: opportunities.description,
        stage: opportunities.stage,
        domainId: opportunities.domainId,
        ownerId: opportunities.ownerId,
        ownerName: ownerAlias.name,
        visibilityScope: opportunities.visibilityScope,
        momentumScore: opportunities.momentumScore,
        targetCloseDate: opportunities.targetCloseDate,
        lastStageChangeAt: opportunities.lastStageChangeAt,
        lastActivityAt: opportunities.lastActivityAt,
        isArchived: opportunities.isArchived,
        createdAt: opportunities.createdAt,
      })
      .from(opportunities)
      .leftJoin(ownerAlias, eq(opportunities.ownerId, ownerAlias.id))
      .where(where)
      .orderBy(desc(opportunities.lastActivityAt))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize);

    return {
      data: rows,
      total: Number(total),
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.max(1, Math.ceil(Number(total) / input.pageSize)),
    };
  }),

  /**
   * Get one opportunity with its links. Visibility-checked.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const [opp] = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, input.id))
        .limit(1);
      if (!opp) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
      await assertCanView(opp, ctx.user.id);

      const links = await db
        .select({
          id: opportunityLinks.id,
          targetType: opportunityLinks.targetType,
          targetId: opportunityLinks.targetId,
          role: opportunityLinks.role,
          note: opportunityLinks.note,
          createdAt: opportunityLinks.createdAt,
        })
        .from(opportunityLinks)
        .where(eq(opportunityLinks.opportunityId, input.id));

      // Resolve target labels in one batch per type.
      const personIds = links.filter((l) => l.targetType === "person").map((l) => l.targetId);
      const orgIds = links.filter((l) => l.targetType === "organization").map((l) => l.targetId);
      const personNames = personIds.length
        ? await db
            .select({ id: persons.id, name: persons.name })
            .from(persons)
            .where(inArray(persons.id, personIds))
        : [];
      const orgNames = orgIds.length
        ? await db
            .select({ id: organizations.id, name: organizations.name })
            .from(organizations)
            .where(inArray(organizations.id, orgIds))
        : [];
      const labelMap = new Map<string, string>();
      personNames.forEach((p) => labelMap.set(p.id, p.name));
      orgNames.forEach((o) => labelMap.set(o.id, o.name));

      return {
        opportunity: opp,
        links: links.map((l) => ({
          ...l,
          targetLabel: labelMap.get(l.targetId) ?? "(missing)",
        })),
      };
    }),

  create: contributorProcedure
    .input(createOpportunitySchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const id = crypto.randomUUID();
      await db.insert(opportunities).values({
        id,
        name: input.name,
        description: input.description ?? null,
        stage: input.stage,
        domainId: input.domainId,
        ownerId: input.ownerId ?? null,
        visibilityScope: input.visibilityScope,
        // Drizzle MySQL `date` column accepts string ('YYYY-MM-DD') at runtime
        // but the strict typings expect Date. Existing routers in this repo
        // (e.g. apify.router for source_published_date) cast through any.
        targetCloseDate: (input.targetCloseDate ?? null) as any,
        createdBy: ctx.user.id,
      });
      await logAudit({
        userId: ctx.user.id,
        actionType: "create",
        entityType: "opportunity",
        entityId: id,
        newValue: JSON.stringify(input),
      });
      return { id };
    }),

  update: contributorProcedure
    .input(updateOpportunitySchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
      await assertCanEdit(existing, ctx.user.id);

      const updates: Record<string, unknown> = { lastActivityAt: new Date() };
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (input.ownerId !== undefined) updates.ownerId = input.ownerId;
      if (input.visibilityScope !== undefined) updates.visibilityScope = input.visibilityScope;
      if (input.momentumScore !== undefined) updates.momentumScore = input.momentumScore;
      if (input.targetCloseDate !== undefined) updates.targetCloseDate = input.targetCloseDate;
      if (input.isArchived !== undefined) updates.isArchived = input.isArchived;

      await db.update(opportunities).set(updates).where(eq(opportunities.id, input.id));
      await logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "opportunity",
        entityId: input.id,
        newValue: JSON.stringify(updates),
      });
      return { id: input.id };
    }),

  /**
   * Transition an opportunity to a new stage. Server-validates against the
   * canonical state machine in `OPPORTUNITY_STAGE_TRANSITIONS` — invalid
   * transitions return a clear human-readable error instead of accepting
   * silently.
   */
  transitionStage: contributorProcedure
    .input(transitionOpportunityStageSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
      await assertCanEdit(existing, ctx.user.id);

      const fromStage = existing.stage as OpportunityStage;
      const toStage = input.toStage;
      if (fromStage === toStage) {
        return { id: input.id, fromStage, toStage, changed: false };
      }
      const validNext = OPPORTUNITY_STAGE_TRANSITIONS[fromStage] ?? [];
      if (!validNext.includes(toStage)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Can't move directly from "${fromStage}" to "${toStage}". Allowed next stages: ${validNext.join(", ")}.`,
        });
      }

      const now = new Date();
      await db
        .update(opportunities)
        .set({
          stage: toStage,
          lastStageChangeAt: now,
          lastActivityAt: now,
        })
        .where(eq(opportunities.id, input.id));

      await logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "opportunity",
        entityId: input.id,
        fieldName: "stage",
        oldValue: fromStage,
        newValue: toStage,
        metadata: input.note ? { note: input.note } : null,
      });

      return { id: input.id, fromStage, toStage, changed: true };
    }),

  link: contributorProcedure
    .input(createOpportunityLinkSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      // Verify the opportunity exists + caller can edit
      const [opp] = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, input.opportunityId))
        .limit(1);
      if (!opp) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
      await assertCanEdit(opp, ctx.user.id);

      const id = crypto.randomUUID();
      await db.insert(opportunityLinks).values({
        id,
        opportunityId: input.opportunityId,
        targetType: input.targetType,
        targetId: input.targetId,
        role: input.role ?? null,
        note: input.note ?? null,
        createdBy: ctx.user.id,
      });
      // Touch lastActivityAt
      await db
        .update(opportunities)
        .set({ lastActivityAt: new Date() })
        .where(eq(opportunities.id, input.opportunityId));
      await logAudit({
        userId: ctx.user.id,
        actionType: "create",
        entityType: "opportunity_link",
        entityId: id,
        newValue: JSON.stringify(input),
      });
      return { id };
    }),

  unlink: contributorProcedure
    .input(deleteOpportunityLinkSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [link] = await db
        .select()
        .from(opportunityLinks)
        .where(eq(opportunityLinks.id, input.id))
        .limit(1);
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Link not found" });

      const [opp] = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, link.opportunityId))
        .limit(1);
      if (!opp) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity gone" });
      await assertCanEdit(opp, ctx.user.id);

      await db.delete(opportunityLinks).where(eq(opportunityLinks.id, input.id));
      await logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "opportunity_link",
        entityId: input.id,
      });
      return { id: input.id, ok: true };
    }),
});

// ─── Visibility helpers ──────────────────────────────────────────────────────

async function assertCanView(opp: { visibilityScope: string; ownerId: string | null; createdBy: string | null; domainId: string }, userId: string): Promise<void> {
  if (opp.visibilityScope === "org") return;
  if (opp.visibilityScope === "private") {
    if (opp.ownerId === userId || opp.createdBy === userId) return;
    throw new TRPCError({ code: "FORBIDDEN", message: "This opportunity is private to its owner." });
  }
  // team scope — caller must have access to the domain
  const accessible = await userAccessibleDomainIds(userId);
  if (!accessible.includes(opp.domainId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You don't have access to this opportunity's domain." });
  }
}

async function assertCanEdit(opp: { visibilityScope: string; ownerId: string | null; createdBy: string | null; domainId: string }, userId: string): Promise<void> {
  // Same as view for now. Future: only owner + admins may edit private; team
  // members may edit team-scope but only the owner can transition stage.
  await assertCanView(opp, userId);
}
