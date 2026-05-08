/**
 * Agents tRPC router — exposes agent registry, schedules, and runs to the
 * Agent Operations admin UI.
 *
 * All procedures are admin-gated. Schedule mutations write to audit_log via
 * the audit middleware (per CLAUDE.md RBAC rule).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, sql } from "drizzle-orm"; // sql used in count()
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { agentRegistry, agentRuns, agentSchedules, users } from "../db/schema";
import {
  updateAgentScheduleSchema,
  runAgentNowSchema,
  agentRunFilterSchema,
} from "../../shared/validation";
import { triggerRunNow } from "../services/agent-runner.service";
import { computeNextRunAt, describeCronIST, parseCron } from "../services/cron-utils";
import { logAudit } from "../middleware/audit";

export const agentsRouter = router({
  /**
   * List the canonical agent registry (10 rows). Stable, used for the
   * Agent Operations page header and the "Run now" agent picker.
   */
  listRegistry: adminProcedure.query(async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(agentRegistry)
      .orderBy(agentRegistry.displayName);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      displayName: r.displayName,
      description: r.description,
      version: r.version,
      isEnabled: r.isEnabled,
      defaultCadenceCron: r.defaultCadenceCron,
      isUserScoped: r.isUserScoped,
      isEventDriven: r.isEventDriven,
      defaultTokenCapUsd: r.defaultTokenCapUsd,
      preferredModel: r.preferredModel,
    }));
  }),

  /**
   * List schedules joined with their agent metadata. The shape is what the
   * admin UI renders directly — no second round-trip needed. Cron description
   * is computed in JS (free) rather than via SQL.
   */
  listSchedules: adminProcedure.query(async () => {
    const db = getDb();
    const rows = await db
      .select({
        id: agentSchedules.id,
        agentId: agentSchedules.agentId,
        agentName: agentRegistry.name,
        agentDisplayName: agentRegistry.displayName,
        agentDescription: agentRegistry.description,
        isUserScoped: agentRegistry.isUserScoped,
        isEventDriven: agentRegistry.isEventDriven,
        preferredModel: agentRegistry.preferredModel,
        cronExpression: agentSchedules.cronExpression,
        isEnabled: agentSchedules.isEnabled,
        isDryRun: agentSchedules.isDryRun,
        monthlyTokenCapUsd: agentSchedules.monthlyTokenCapUsd,
        monthlyTokensUsedUsd: agentSchedules.monthlyTokensUsedUsd,
        monthlyWindowStart: agentSchedules.monthlyWindowStart,
        sourceAllowlist: agentSchedules.sourceAllowlist,
        lastRunAt: agentSchedules.lastRunAt,
        nextRunAt: agentSchedules.nextRunAt,
        configOverrides: agentSchedules.configOverrides,
      })
      .from(agentSchedules)
      .innerJoin(agentRegistry, eq(agentSchedules.agentId, agentRegistry.id))
      .orderBy(agentRegistry.displayName);

    return rows.map(r => ({
      ...r,
      cronDescription: describeCronIST(r.cronExpression),
      // Drizzle returns json columns as `unknown`; the UI consumes these
      // as specific shapes. Cast at the boundary.
      sourceAllowlist: (r.sourceAllowlist ?? null) as string[] | null,
      configOverrides: (r.configOverrides ?? null) as Record<string, unknown> | null,
    }));
  }),

  /**
   * Update a schedule's cadence, enabled state, dry-run flag, token cap, or
   * allowlist. Validates the cron expression server-side. Recomputes
   * next_run_at when cron changes. Always writes audit_log.
   */
  updateSchedule: adminProcedure
    .input(updateAgentScheduleSchema)
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(agentSchedules)
        .where(eq(agentSchedules.id, input.id))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      }

      // Validate cron if changed.
      let nextRunAt = existing.nextRunAt;
      if (input.cronExpression && input.cronExpression !== existing.cronExpression) {
        if (!parseCron(input.cronExpression)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Invalid cron expression: "${input.cronExpression}". Expected 5 fields (minute hour dom month dow).`,
          });
        }
        nextRunAt = computeNextRunAt(input.cronExpression, new Date());
      }

      const updates: Record<string, unknown> = {};
      if (input.cronExpression !== undefined) updates.cronExpression = input.cronExpression;
      if (input.isEnabled !== undefined) updates.isEnabled = input.isEnabled;
      if (input.isDryRun !== undefined) updates.isDryRun = input.isDryRun;
      if (input.monthlyTokenCapUsd !== undefined) updates.monthlyTokenCapUsd = input.monthlyTokenCapUsd;
      if (input.sourceAllowlist !== undefined) updates.sourceAllowlist = input.sourceAllowlist;
      if (input.configOverrides !== undefined) updates.configOverrides = input.configOverrides;
      if (nextRunAt !== existing.nextRunAt) updates.nextRunAt = nextRunAt;
      updates.updatedBy = ctx.user.id;

      if (Object.keys(updates).length === 0) {
        return { id: input.id, changed: false };
      }

      await db.update(agentSchedules).set(updates).where(eq(agentSchedules.id, input.id));

      await logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "agent_schedule",
        entityId: input.id,
        oldValue: JSON.stringify({
          cronExpression: existing.cronExpression,
          isEnabled: existing.isEnabled,
          isDryRun: existing.isDryRun,
          monthlyTokenCapUsd: existing.monthlyTokenCapUsd,
        }),
        newValue: JSON.stringify(updates),
      });

      return { id: input.id, changed: true };
    }),

  /**
   * List recent agent runs with optional filters. Default ordering: newest
   * first. Pagination via the standard `paginationSchema`.
   */
  listRuns: adminProcedure.input(agentRunFilterSchema).query(async ({ input }) => {
    const db = getDb();
    const conditions = [];
    if (input.agentId) conditions.push(eq(agentRuns.agentId, input.agentId));
    if (input.scheduleId) conditions.push(eq(agentRuns.scheduleId, input.scheduleId));
    if (input.status) conditions.push(eq(agentRuns.status, input.status));
    if (input.startedAfter) conditions.push(gte(agentRuns.createdAt, new Date(input.startedAfter)));

    const where = conditions.length ? and(...conditions) : undefined;

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)` })
      .from(agentRuns)
      .where(where);

    const rows = await db
      .select({
        id: agentRuns.id,
        agentId: agentRuns.agentId,
        agentName: agentRegistry.name,
        agentDisplayName: agentRegistry.displayName,
        scheduleId: agentRuns.scheduleId,
        status: agentRuns.status,
        triggeredBy: agentRuns.triggeredBy,
        triggeredByUserName: users.name,
        isDryRun: agentRuns.isDryRun,
        startedAt: agentRuns.startedAt,
        finishedAt: agentRuns.finishedAt,
        durationMs: agentRuns.durationMs,
        itemsProcessed: agentRuns.itemsProcessed,
        itemsCreated: agentRuns.itemsCreated,
        itemsUpdated: agentRuns.itemsUpdated,
        itemsSkipped: agentRuns.itemsSkipped,
        tokensUsed: agentRuns.tokensUsed,
        costUsd: agentRuns.costUsd,
        modelUsed: agentRuns.modelUsed,
        errorMessage: agentRuns.errorMessage,
        createdAt: agentRuns.createdAt,
      })
      .from(agentRuns)
      .innerJoin(agentRegistry, eq(agentRuns.agentId, agentRegistry.id))
      .leftJoin(users, eq(agentRuns.triggeredByUserId, users.id))
      .where(where)
      .orderBy(desc(agentRuns.createdAt))
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
   * Manually trigger a run. Returns the run id; status transitions are visible
   * via `listRuns` (the UI polls or the user refreshes).
   */
  runNow: adminProcedure.input(runAgentNowSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();

    // Find the active schedule for this agent. If multiple exist, pick the
    // first enabled one (admins are warned about duplicates in the UI).
    const [schedule] = await db
      .select()
      .from(agentSchedules)
      .where(eq(agentSchedules.agentId, input.agentId))
      .orderBy(desc(agentSchedules.isEnabled))
      .limit(1);

    if (!schedule) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No schedule found for this agent. Reseed the registry from the boot logs.",
      });
    }

    const result = await triggerRunNow({
      scheduleId: schedule.id,
      isDryRun: input.isDryRun,
      triggeredByUserId: ctx.user.id,
      scopeUserId: input.scopeUserId,
    });

    await logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "agent_run",
      entityId: result.runId,
      newValue: JSON.stringify({ agentId: input.agentId, scheduleId: schedule.id, isDryRun: input.isDryRun }),
    });

    return result;
  }),

  /**
   * Reset a schedule's monthly token usage counter. Used when an admin wants
   * to lift a `budget_exhausted` pause without waiting for the natural window
   * rollover. Audit-logged.
   */
  resetMonthlyUsage: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(agentSchedules)
        .where(eq(agentSchedules.id, input.id))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      }

      await db
        .update(agentSchedules)
        .set({
          monthlyTokensUsedUsd: 0,
          monthlyWindowStart: new Date(),
          updatedBy: ctx.user.id,
        })
        .where(eq(agentSchedules.id, input.id));

      await logAudit({
        userId: ctx.user.id,
        actionType: "update",
        entityType: "agent_schedule",
        entityId: input.id,
        fieldName: "monthly_tokens_used_usd",
        oldValue: String(existing.monthlyTokensUsedUsd),
        newValue: "0",
      });

      return { id: input.id, ok: true };
    }),
});
