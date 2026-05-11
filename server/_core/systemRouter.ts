import { z } from "zod";
import { desc, sql } from "drizzle-orm";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router, superAdminProcedure } from "./trpc";
import { getDb } from "../db";
import { agentRegistry, agentSchedules, agentRuns, apifySourceConfigs, organizations, persons } from "../db/schema";

/**
 * Probe one DB count safely — never throws. Used by admin health to keep
 * the response renderable even if a table is missing (early-deploy state)
 * or the DB is briefly unreachable.
 */
async function safeCount<T>(promise: Promise<T[]>): Promise<{ count: number; ok: boolean }> {
  try {
    const rows = await promise;
    return { count: rows.length, ok: true };
  } catch {
    return { count: 0, ok: false };
  }
}

/**
 * The set of runtime secrets the app cares about. We NEVER return the value
 * itself — only whether it's set to a non-empty string. Each entry also
 * carries a short "what this is for" string so the admin UI can render an
 * actionable hint when a secret is missing.
 */
const KNOWN_SECRETS: Array<{ key: string; aliases?: string[]; purpose: string; severity: "critical" | "important" | "optional" }> = [
  { key: "DATABASE_URL", purpose: "Live MySQL connection", severity: "critical" },
  { key: "JWT_SECRET", purpose: "Session token signing", severity: "critical" },
  { key: "JWT_REFRESH_SECRET", purpose: "Refresh token signing", severity: "critical" },
  { key: "ANTHROPIC_API_KEY", purpose: "Intent router, briefings, chat", severity: "critical" },
  { key: "GOOGLE_API_KEY", aliases: ["GEMINI_API_KEY"], purpose: "Voice bot (Gemini Live)", severity: "important" },
  { key: "ASSEMBLYAI_API_KEY", purpose: "Voice quick-transcribe", severity: "important" },
  { key: "OPENAI_API_KEY", purpose: "Embeddings (agentic memory)", severity: "optional" },
  { key: "APIFY_API_TOKEN", purpose: "Public-source ingestion agents", severity: "important" },
];

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  /**
   * Admin health probe. Super-admin gated since it reveals system internals.
   *
   * Returns:
   *   - secrets[]: each known secret with `present: boolean` only (NEVER the
   *     value), plus purpose + severity for actionable hints
   *   - registry: agent_registry counts (expected 10) + which agents are
   *     enabled
   *   - schedules: agent_schedules counts (expected 10) + enabled + dry-run
   *   - apify: apify_source_configs counts (expected 7) + how many active
   *   - graph: persons + organizations counts (smoke check that the
   *     institutional skeleton seeded)
   *   - recentRuns: last 10 agent runs by status
   *   - db: { ok, latencyMs } — single probe latency
   *
   * Never throws. Each probe wrapped in try/catch so a half-broken deploy
   * still surfaces something useful in the UI.
   */
  adminHealth: superAdminProcedure.query(async () => {
    const startedAt = Date.now();

    // Secrets — read straight from process.env. We check the primary key
    // AND each alias; a secret is "present" if any of them is set.
    const secrets = KNOWN_SECRETS.map((s) => {
      const all = [s.key, ...(s.aliases ?? [])];
      const presentVia = all.find((k) => typeof process.env[k] === "string" && (process.env[k] as string).length > 0);
      return {
        key: s.key,
        aliases: s.aliases ?? [],
        purpose: s.purpose,
        severity: s.severity,
        present: Boolean(presentVia),
        presentVia: presentVia ?? null,
      };
    });

    const db = getDb();
    if (!db) {
      return {
        ok: false,
        secrets,
        registry: { ok: false, total: 0, enabled: 0, expected: 10 },
        schedules: { ok: false, total: 0, enabled: 0, dryRun: 0, expected: 10 },
        apify: { ok: false, total: 0, active: 0, expected: 7 },
        graph: { ok: false, persons: 0, organizations: 0 },
        recentRuns: [],
        db: { ok: false, latencyMs: null, error: "Database not configured" },
        generatedAt: new Date().toISOString(),
      };
    }

    const probeStart = Date.now();
    let dbOk = true;
    let dbError: string | null = null;
    try {
      // Tiny probe — counts a known table. If this throws we know the DB
      // is in trouble.
      await db.select({ id: agentRegistry.id }).from(agentRegistry).limit(1);
    } catch (err) {
      dbOk = false;
      dbError = err instanceof Error ? err.message : String(err);
    }
    const dbLatencyMs = Date.now() - probeStart;

    // Registry counts.
    let registry = { ok: true, total: 0, enabled: 0, expected: 10 };
    try {
      const rows = await db
        .select({ id: agentRegistry.id, isEnabled: agentRegistry.isEnabled })
        .from(agentRegistry);
      registry = {
        ok: true,
        total: rows.length,
        enabled: rows.filter((r) => r.isEnabled).length,
        expected: 10,
      };
    } catch {
      registry = { ok: false, total: 0, enabled: 0, expected: 10 };
    }

    // Schedule counts.
    let schedules = { ok: true, total: 0, enabled: 0, dryRun: 0, expected: 10 };
    try {
      const rows = await db
        .select({ id: agentSchedules.id, isEnabled: agentSchedules.isEnabled, isDryRun: agentSchedules.isDryRun })
        .from(agentSchedules);
      schedules = {
        ok: true,
        total: rows.length,
        enabled: rows.filter((r) => r.isEnabled).length,
        dryRun: rows.filter((r) => r.isDryRun).length,
        expected: 10,
      };
    } catch {
      schedules = { ok: false, total: 0, enabled: 0, dryRun: 0, expected: 10 };
    }

    // Apify source counts.
    let apify = { ok: true, total: 0, active: 0, expected: 7 };
    try {
      const rows = await db.select({ id: apifySourceConfigs.id, isActive: apifySourceConfigs.isActive }).from(apifySourceConfigs);
      apify = {
        ok: true,
        total: rows.length,
        active: rows.filter((r) => r.isActive).length,
        expected: 7,
      };
    } catch {
      apify = { ok: false, total: 0, active: 0, expected: 7 };
    }

    // Graph smoke check.
    const personCount = await safeCount(db.select({ id: persons.id }).from(persons));
    const orgCount = await safeCount(db.select({ id: organizations.id }).from(organizations));

    // Recent agent runs.
    let recentRuns: Array<{
      id: string;
      agentId: string;
      status: string;
      startedAt: Date | null;
      finishedAt: Date | null;
      durationMs: number | null;
      errorMessage: string | null;
    }> = [];
    try {
      recentRuns = await db
        .select({
          id: agentRuns.id,
          agentId: agentRuns.agentId,
          status: agentRuns.status,
          startedAt: agentRuns.startedAt,
          finishedAt: agentRuns.finishedAt,
          durationMs: agentRuns.durationMs,
          errorMessage: agentRuns.errorMessage,
        })
        .from(agentRuns)
        .orderBy(desc(agentRuns.createdAt))
        .limit(10);
    } catch {
      recentRuns = [];
    }

    // Overall ok: every critical-severity secret present AND db.ok AND
    // registry.ok AND schedules.ok AND apify.ok.
    const criticalSecretsOk = secrets.filter((s) => s.severity === "critical").every((s) => s.present);
    const ok = dbOk && registry.ok && schedules.ok && apify.ok && criticalSecretsOk;

    return {
      ok,
      secrets,
      registry,
      schedules,
      apify,
      graph: { ok: personCount.ok && orgCount.ok, persons: personCount.count, organizations: orgCount.count },
      recentRuns,
      db: { ok: dbOk, latencyMs: dbLatencyMs, error: dbError },
      generatedAt: new Date().toISOString(),
      probeDurationMs: Date.now() - startedAt,
    };
  }),
});
