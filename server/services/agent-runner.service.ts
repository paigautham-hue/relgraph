/**
 * Agent runner — wakes on a tick interval, finds due schedules, dispatches.
 *
 * Design (week 2 scaffold):
 *   - Tick every 60 s (singleton setInterval started at boot).
 *   - Each tick: find schedules where `is_enabled=TRUE`, `is_event_driven=FALSE`
 *     on the linked registry row, and (`next_run_at IS NULL` OR `next_run_at <= NOW()`).
 *   - For each due schedule, atomically claim by setting `next_run_at` forward
 *     before any await — prevents duplicate runs across instances.
 *   - Insert an agent_runs row with status='running', call the dispatcher,
 *     then mark completed/failed/skipped/budget_exhausted.
 *   - Token-cap guard: before running, if `monthly_tokens_used_usd >=
 *     monthly_token_cap_usd`, mark the run `budget_exhausted` and skip.
 *
 * Cron handling:
 *   - All default crons in agent_registry are written in IST (Asia/Kolkata).
 *     The runner converts schedule-time → next UTC instant via the `next_run_at`
 *     timestamp (stored UTC in DB). See `computeNextRunAt()`.
 *   - Event-driven agents (`is_event_driven=true`) carry a placeholder `* * * * *`
 *     cron that the runner MUST IGNORE — they are triggered by other code paths
 *     (write hooks for dedup, graph-change events for path_recompute), not by
 *     cron tick. See MAPS issue AGENT-CRON-EVENT.
 *
 * Dispatchers:
 *   - Real agent implementations land in week 2.3-2.5 (ingestion, dedup,
 *     change-detection) and week 6 (brief, digest, trust_auditor).
 *   - For now, every agent has a NO-OP dispatcher that succeeds quickly,
 *     so the runner machinery can be exercised end-to-end without external
 *     side effects. Replace each entry in `AGENT_DISPATCHERS` as you implement.
 */

import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { agentRegistry, agentRuns, agentSchedules } from "../db/schema";
import type { AgentName, AgentRunStatus } from "../../shared/enums";
import { computeNextRunAt } from "./cron-utils";

const TICK_INTERVAL_MS = 60_000; // 1 minute
const RUN_TIMEOUT_MS = 5 * 60_000; // 5 minutes; longer agents must run in workers

let tickHandle: NodeJS.Timeout | null = null;
let isTickInProgress = false;

// ─── Dispatcher table ────────────────────────────────────────────────────────
// Each dispatcher receives the run id and the schedule's config_overrides.
// It returns metrics (items processed/created/updated/skipped, tokens used,
// cost, model used) and any output payload. On throw, the runner marks the
// run failed and stores the error message + stack.

export interface AgentRunResult {
  itemsProcessed?: number;
  itemsCreated?: number;
  itemsUpdated?: number;
  itemsSkipped?: number;
  tokensUsed?: number;
  costUsd?: number;
  modelUsed?: string | null;
  output?: Record<string, unknown> | null;
  status?: AgentRunStatus; // override; default 'completed'
}

export type AgentDispatcher = (params: {
  runId: string;
  scheduleId: string;
  isDryRun: boolean;
  configOverrides: Record<string, unknown> | null;
  scopeUserId?: string | null;
}) => Promise<AgentRunResult>;

const noopDispatcher: AgentDispatcher = async () => ({
  itemsProcessed: 0,
  itemsCreated: 0,
  itemsUpdated: 0,
  itemsSkipped: 0,
  tokensUsed: 0,
  costUsd: 0,
  output: { note: "no-op dispatcher; real implementation pending" },
});

const AGENT_DISPATCHERS: Record<AgentName, AgentDispatcher> = {
  ingestion_rbi_pib: noopDispatcher,
  ingestion_mca21_gazette: noopDispatcher,
  ingestion_bse_nse: noopDispatcher,
  change_detection: noopDispatcher,
  dedup: noopDispatcher,
  enrichment: noopDispatcher,
  path_recompute: noopDispatcher,
  brief: noopDispatcher,
  trust_auditor: noopDispatcher,
  digest: noopDispatcher,
};

/**
 * Replace the dispatcher for an agent. Used by tests and by week 2.3-2.5
 * implementations to register the real ingestion/dedup/change_detection logic.
 */
export function registerAgentDispatcher(name: AgentName, dispatcher: AgentDispatcher): void {
  AGENT_DISPATCHERS[name] = dispatcher;
}

// ─── Tick loop ────────────────────────────────────────────────────────────────

/**
 * Start the runner. Idempotent — calling twice is a no-op.
 * Returns a function that stops the runner (used by tests).
 */
export function startAgentRunner(): () => void {
  if (tickHandle) {
    return stopAgentRunner;
  }
  tickHandle = setInterval(() => {
    if (isTickInProgress) return; // skip overlapping ticks
    void runTick().catch(err => {
      console.error("[agent-runner] tick failed:", err);
    });
  }, TICK_INTERVAL_MS);
  console.log(`[agent-runner] started (tick interval ${TICK_INTERVAL_MS} ms)`);
  return stopAgentRunner;
}

export function stopAgentRunner(): void {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
    console.log("[agent-runner] stopped");
  }
}

/**
 * One tick: find due, non-event-driven, enabled schedules, dispatch each.
 * Exported for testability — tests can call this directly without the timer.
 */
export async function runTick(): Promise<{ dispatched: number; skipped: number }> {
  isTickInProgress = true;
  let dispatched = 0;
  let skipped = 0;
  try {
    const db = getDb();
    if (!db) throw new Error("Database not available");

    // Find candidate schedules. Event-driven agents are filtered out at the
    // registry level (is_event_driven=TRUE), per issue AGENT-CRON-EVENT.
    const due = await db
      .select({
        scheduleId: agentSchedules.id,
        agentId: agentSchedules.agentId,
        agentName: agentRegistry.name,
        cronExpression: agentSchedules.cronExpression,
        isEnabled: agentSchedules.isEnabled,
        isDryRun: agentSchedules.isDryRun,
        monthlyTokenCapUsd: agentSchedules.monthlyTokenCapUsd,
        monthlyTokensUsedUsd: agentSchedules.monthlyTokensUsedUsd,
        configOverrides: agentSchedules.configOverrides,
        nextRunAt: agentSchedules.nextRunAt,
        registryEnabled: agentRegistry.isEnabled,
        isEventDriven: agentRegistry.isEventDriven,
        isUserScoped: agentRegistry.isUserScoped,
      })
      .from(agentSchedules)
      .innerJoin(agentRegistry, eq(agentSchedules.agentId, agentRegistry.id))
      .where(
        and(
          eq(agentSchedules.isEnabled, true),
          eq(agentRegistry.isEnabled, true),
          eq(agentRegistry.isEventDriven, false),
          or(isNull(agentSchedules.nextRunAt), lte(agentSchedules.nextRunAt, new Date())),
        ),
      );

    for (const row of due) {
      // User-scoped agents need per-user invocation. Week 2 scaffold dispatches
      // them once with no scopeUserId; week 6 will fan out per active user.
      // For now, that's good enough to keep the runner exercised.
      try {
        const result = await runOne({
          ...row,
          agentName: row.agentName as AgentName,
        });
        if (result === "dispatched") dispatched++;
        else skipped++;
      } catch (err) {
        console.error(`[agent-runner] schedule ${row.scheduleId} (${row.agentName}) failed:`, err);
        skipped++;
      }
    }
  } finally {
    isTickInProgress = false;
  }
  return { dispatched, skipped };
}

/**
 * Run a single schedule. Atomically claims the schedule by advancing
 * `next_run_at` BEFORE any await past the claim — guards against duplicate
 * runs if another instance ticks at the same instant.
 */
async function runOne(row: {
  scheduleId: string;
  agentId: string;
  agentName: AgentName;
  cronExpression: string;
  isDryRun: boolean;
  monthlyTokenCapUsd: number | null;
  monthlyTokensUsedUsd: number;
  configOverrides: unknown;
}): Promise<"dispatched" | "skipped"> {
  const db = getDb();

  // Compute the next next-run BEFORE we claim, so the claim atomically
  // moves the schedule's next_run_at forward.
  const nextRunAt = computeNextRunAt(row.cronExpression, new Date());
  if (!nextRunAt) {
    console.warn(`[agent-runner] schedule ${row.scheduleId} has invalid cron "${row.cronExpression}" — skipping`);
    return "skipped";
  }

  // Atomic claim: only update if next_run_at is still null OR <= now.
  // If another instance already moved it forward, we lose the race and skip.
  const claimResult = await db
    .update(agentSchedules)
    .set({
      nextRunAt,
      lastRunAt: new Date(),
    })
    .where(
      and(
        eq(agentSchedules.id, row.scheduleId),
        or(isNull(agentSchedules.nextRunAt), lte(agentSchedules.nextRunAt, new Date())),
      ),
    );

  // Drizzle MySQL update returns mysql2's ResultSetHeader-shaped object.
  // affectedRows tells us if we won the claim.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const affected = (claimResult as any)?.[0]?.affectedRows ?? (claimResult as any)?.affectedRows ?? 0;
  if (!affected) {
    return "skipped"; // lost race
  }

  // Token cap check. Soft pause when exhausted.
  const tokenCap = row.monthlyTokenCapUsd;
  const tokensUsed = row.monthlyTokensUsedUsd;
  const isBudgetExhausted = tokenCap != null && tokensUsed >= tokenCap;

  // Insert the agent_runs row.
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  await db.insert(agentRuns).values({
    id: runId,
    agentId: row.agentId,
    scheduleId: row.scheduleId,
    status: isBudgetExhausted ? "budget_exhausted" : "running",
    triggeredBy: "schedule",
    isDryRun: row.isDryRun,
    startedAt,
  });

  if (isBudgetExhausted) {
    await db
      .update(agentRuns)
      .set({
        finishedAt: new Date(),
        durationMs: 0,
        errorMessage: `Monthly token cap of $${tokenCap} reached (used $${tokensUsed.toFixed(2)}). Reset on next monthly window.`,
      })
      .where(eq(agentRuns.id, runId));
    return "dispatched";
  }

  // Dispatch.
  const dispatcher = AGENT_DISPATCHERS[row.agentName] ?? noopDispatcher;
  let result: AgentRunResult;
  let status: AgentRunStatus = row.isDryRun ? "dry_run" : "completed";
  let errorMessage: string | null = null;
  let errorStack: string | null = null;

  try {
    result = await Promise.race([
      dispatcher({
        runId,
        scheduleId: row.scheduleId,
        isDryRun: row.isDryRun,
        configOverrides: (row.configOverrides ?? null) as Record<string, unknown> | null,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Agent run exceeded ${RUN_TIMEOUT_MS}ms timeout`)), RUN_TIMEOUT_MS),
      ),
    ]);
    if (result.status) status = result.status;
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
    errorStack = err instanceof Error ? (err.stack ?? null) : null;
    result = {};
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  await db
    .update(agentRuns)
    .set({
      status,
      finishedAt,
      durationMs,
      itemsProcessed: result.itemsProcessed ?? 0,
      itemsCreated: result.itemsCreated ?? 0,
      itemsUpdated: result.itemsUpdated ?? 0,
      itemsSkipped: result.itemsSkipped ?? 0,
      tokensUsed: result.tokensUsed ?? 0,
      costUsd: result.costUsd ?? 0,
      modelUsed: result.modelUsed ?? null,
      output: result.output ?? null,
      errorMessage,
      errorStack,
    })
    .where(eq(agentRuns.id, runId));

  // Increment monthly tokens used on the schedule.
  if ((result.costUsd ?? 0) > 0) {
    await db
      .update(agentSchedules)
      .set({
        monthlyTokensUsedUsd: sql`${agentSchedules.monthlyTokensUsedUsd} + ${result.costUsd ?? 0}`,
      })
      .where(eq(agentSchedules.id, row.scheduleId));
  }

  return "dispatched";
}

/**
 * Manually trigger a run for a schedule. Used by the "Run now" button in the
 * Agent Operations admin UI. Bypasses the due check but respects token cap
 * and dry-run flag (unless overridden).
 */
export async function triggerRunNow(params: {
  scheduleId: string;
  isDryRun?: boolean;
  triggeredByUserId?: string;
  scopeUserId?: string;
}): Promise<{ runId: string }> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [schedule] = await db
    .select({
      scheduleId: agentSchedules.id,
      agentId: agentSchedules.agentId,
      agentName: agentRegistry.name,
      isDryRunDefault: agentSchedules.isDryRun,
      monthlyTokenCapUsd: agentSchedules.monthlyTokenCapUsd,
      monthlyTokensUsedUsd: agentSchedules.monthlyTokensUsedUsd,
      configOverrides: agentSchedules.configOverrides,
    })
    .from(agentSchedules)
    .innerJoin(agentRegistry, eq(agentSchedules.agentId, agentRegistry.id))
    .where(eq(agentSchedules.id, params.scheduleId))
    .limit(1);

  if (!schedule) throw new Error(`Schedule ${params.scheduleId} not found`);

  const runId = crypto.randomUUID();
  const isDryRun = params.isDryRun ?? schedule.isDryRunDefault;
  const tokenCap = schedule.monthlyTokenCapUsd;
  const isBudgetExhausted = tokenCap != null && schedule.monthlyTokensUsedUsd >= tokenCap;
  const startedAt = new Date();

  await db.insert(agentRuns).values({
    id: runId,
    agentId: schedule.agentId,
    scheduleId: schedule.scheduleId,
    status: isBudgetExhausted ? "budget_exhausted" : "running",
    triggeredBy: "manual",
    triggeredByUserId: params.triggeredByUserId ?? null,
    scopeUserId: params.scopeUserId ?? null,
    isDryRun,
    startedAt,
  });

  // Touch the schedule's lastRunAt so the Agent Operations card reflects manual
  // runs alongside automatic ones. We deliberately do NOT advance nextRunAt —
  // manual runs are out-of-band and shouldn't shift the schedule.
  await db
    .update(agentSchedules)
    .set({ lastRunAt: startedAt })
    .where(eq(agentSchedules.id, schedule.scheduleId));

  if (isBudgetExhausted) {
    await db
      .update(agentRuns)
      .set({
        finishedAt: new Date(),
        durationMs: 0,
        errorMessage: `Monthly token cap of $${tokenCap} reached (used $${schedule.monthlyTokensUsedUsd.toFixed(2)}).`,
      })
      .where(eq(agentRuns.id, runId));
    return { runId };
  }

  // Fire dispatcher async — return runId immediately so the UI gets a fast response.
  // The user can poll agent_runs by id to see status transitions.
  void (async () => {
    const dispatcher = AGENT_DISPATCHERS[schedule.agentName as AgentName] ?? noopDispatcher;
    let result: AgentRunResult = {};
    let status: AgentRunStatus = isDryRun ? "dry_run" : "completed";
    let errorMessage: string | null = null;
    let errorStack: string | null = null;

    try {
      result = await Promise.race([
        dispatcher({
          runId,
          scheduleId: schedule.scheduleId,
          isDryRun,
          configOverrides: (schedule.configOverrides ?? null) as Record<string, unknown> | null,
          scopeUserId: params.scopeUserId,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Agent run exceeded ${RUN_TIMEOUT_MS}ms timeout`)), RUN_TIMEOUT_MS),
        ),
      ]);
      if (result.status) status = result.status;
    } catch (err) {
      status = "failed";
      errorMessage = err instanceof Error ? err.message : String(err);
      errorStack = err instanceof Error ? (err.stack ?? null) : null;
    }

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    await db
      .update(agentRuns)
      .set({
        status,
        finishedAt,
        durationMs,
        itemsProcessed: result.itemsProcessed ?? 0,
        itemsCreated: result.itemsCreated ?? 0,
        itemsUpdated: result.itemsUpdated ?? 0,
        itemsSkipped: result.itemsSkipped ?? 0,
        tokensUsed: result.tokensUsed ?? 0,
        costUsd: result.costUsd ?? 0,
        modelUsed: result.modelUsed ?? null,
        output: result.output ?? null,
        errorMessage,
        errorStack,
      })
      .where(eq(agentRuns.id, runId));

    if ((result.costUsd ?? 0) > 0) {
      await db
        .update(agentSchedules)
        .set({
          monthlyTokensUsedUsd: sql`${agentSchedules.monthlyTokensUsedUsd} + ${result.costUsd ?? 0}`,
        })
        .where(eq(agentSchedules.id, schedule.scheduleId));
    }
  })().catch(err => console.error(`[agent-runner] manual run ${runId} failed:`, err));

  return { runId };
}
