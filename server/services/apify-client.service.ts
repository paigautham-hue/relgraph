/**
 * Apify client wrapper.
 *
 * Provides three operations the ingestion dispatcher needs:
 *   - runActor(actorName, input, options) — start a synchronous run, poll
 *     until complete, return { runId, datasetId, status, statusMessage }.
 *   - fetchDataset(datasetId, limit, offset) — pull items from a run's
 *     default dataset.
 *   - withinTokenBudget(usdSoFar, capUsd, estimatedCostUsd) — pre-flight
 *     check so a dispatcher can refuse to start a run that would blow the cap.
 *
 * The wrapper uses the public Apify REST API directly (not the SDK) to keep
 * the dependency footprint small and to make it trivial to replace if we
 * later switch ingestion providers.
 *
 * All calls require `APIFY_API_TOKEN` in the environment. The agent-runner
 * will catch missing-token errors and surface them as a clear admin-facing
 * "Set APIFY_API_TOKEN to enable ingestion" message in the run's
 * error_message field.
 */

const APIFY_API_BASE = "https://api.apify.com/v2";

/**
 * Apify run lifecycle states. We poll until terminal.
 * https://docs.apify.com/platform/actors/running#run-lifecycle
 */
const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);

export interface ApifyRunResult {
  runId: string;
  datasetId: string;
  status: string;
  statusMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  /** Apify-billed compute cost in USD for this run, when available */
  computeUsageUsd: number | null;
}

export interface ApifyDatasetItem {
  [key: string]: unknown;
}

function getApifyToken(): string {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error(
      "APIFY_API_TOKEN is not configured. Set it in the environment to enable ingestion agents.",
    );
  }
  return token;
}

/**
 * Start an Apify Actor run synchronously and poll until it finishes.
 *
 * Convention: actor names use the `username~name` form in URLs (Apify replaces
 * the slash). We accept the slash form (`apify/website-content-crawler`) and
 * URL-encode internally so callers don't have to.
 *
 * Polling: starts at 2s, doubles up to 30s, capped at `maxWaitMs`. On any
 * fetch failure we return the partial result with status `POLLING_ERROR` so
 * the dispatcher can record it without throwing.
 */
export async function runActor(params: {
  actorName: string;
  input: Record<string, unknown>;
  /** Memory in MB. Default 1024 (cheapest viable for Website Content Crawler). */
  memoryMbytes?: number;
  /** Timeout in seconds for the actor run. Default 300 (5 min). */
  timeoutSecs?: number;
  /** Cap how long we poll before giving up. Default same as timeoutSecs+30s. */
  maxWaitMs?: number;
}): Promise<ApifyRunResult> {
  const token = getApifyToken();
  const actorPath = encodeURIComponent(params.actorName.replace("/", "~"));
  const memoryMbytes = params.memoryMbytes ?? 1024;
  const timeoutSecs = params.timeoutSecs ?? 300;
  const maxWaitMs = params.maxWaitMs ?? (timeoutSecs + 30) * 1000;

  // Start the run
  const startResp = await fetch(
    `${APIFY_API_BASE}/acts/${actorPath}/runs?memory=${memoryMbytes}&timeout=${timeoutSecs}&token=${token}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params.input),
    },
  );
  if (!startResp.ok) {
    const text = await startResp.text().catch(() => "");
    throw new Error(`Apify start-run failed (${startResp.status}): ${text.slice(0, 500)}`);
  }
  const startJson = (await startResp.json()) as { data: { id: string; defaultDatasetId: string; status: string; startedAt: string } };
  const runId = startJson.data.id;
  const datasetId = startJson.data.defaultDatasetId;
  const startedAt = new Date(startJson.data.startedAt);

  // Poll until terminal
  const pollStart = Date.now();
  let backoffMs = 2000;
  while (Date.now() - pollStart < maxWaitMs) {
    await new Promise((r) => setTimeout(r, backoffMs));
    const pollResp = await fetch(`${APIFY_API_BASE}/actor-runs/${runId}?token=${token}`);
    if (!pollResp.ok) {
      // Transient — keep polling but don't crash the run.
      backoffMs = Math.min(backoffMs * 2, 30_000);
      continue;
    }
    const pollJson = (await pollResp.json()) as {
      data: {
        status: string;
        statusMessage: string | null;
        finishedAt: string | null;
        usageTotalUsd: number | null;
      };
    };
    if (TERMINAL_STATUSES.has(pollJson.data.status)) {
      const finishedAt = pollJson.data.finishedAt ? new Date(pollJson.data.finishedAt) : null;
      return {
        runId,
        datasetId,
        status: pollJson.data.status,
        statusMessage: pollJson.data.statusMessage ?? null,
        startedAt,
        finishedAt,
        durationMs: finishedAt ? finishedAt.getTime() - startedAt.getTime() : null,
        computeUsageUsd: pollJson.data.usageTotalUsd ?? null,
      };
    }
    backoffMs = Math.min(backoffMs * 2, 30_000);
  }

  // Timed out from our side. The Apify run might still be going; we record
  // what we have.
  return {
    runId,
    datasetId,
    status: "POLLING_TIMEOUT",
    statusMessage: `RelGraph stopped polling after ${maxWaitMs}ms`,
    startedAt,
    finishedAt: null,
    durationMs: null,
    computeUsageUsd: null,
  };
}

/**
 * Pull items from a run's default dataset. Returns up to `limit` items; the
 * caller can paginate via `offset`.
 */
export async function fetchDataset(
  datasetId: string,
  limit = 1000,
  offset = 0,
): Promise<ApifyDatasetItem[]> {
  const token = getApifyToken();
  const resp = await fetch(
    `${APIFY_API_BASE}/datasets/${datasetId}/items?clean=true&limit=${limit}&offset=${offset}&token=${token}`,
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Apify fetch-dataset failed (${resp.status}): ${text.slice(0, 500)}`);
  }
  const items = (await resp.json()) as ApifyDatasetItem[];
  return items;
}

/**
 * Pre-flight check: would running this estimated cost stay within the
 * monthly cap? The dispatcher uses this to decide whether to mark the
 * run `budget_exhausted` immediately rather than starting an Apify run we
 * can't afford to finish. Treats `null` cap as no limit.
 */
export function withinTokenBudget(
  monthlyTokensUsedUsd: number,
  monthlyCapUsd: number | null,
  estimatedCostUsd: number,
): { allowed: boolean; remaining: number | null; reason?: string } {
  if (monthlyCapUsd == null) return { allowed: true, remaining: null };
  const remaining = monthlyCapUsd - monthlyTokensUsedUsd;
  if (remaining <= 0) {
    return {
      allowed: false,
      remaining: 0,
      reason: `Monthly cap of $${monthlyCapUsd} exhausted (used $${monthlyTokensUsedUsd.toFixed(2)}).`,
    };
  }
  if (estimatedCostUsd > remaining) {
    return {
      allowed: false,
      remaining,
      reason: `Estimated cost $${estimatedCostUsd.toFixed(2)} exceeds remaining budget $${remaining.toFixed(2)}.`,
    };
  }
  return { allowed: true, remaining };
}

/**
 * Test helper: returns true iff the APIFY_API_TOKEN env var is set. Used by
 * the ingestion dispatcher's pre-flight to fail fast with a clear message
 * rather than calling `getApifyToken()` and throwing mid-run.
 */
export function isApifyConfigured(): boolean {
  return Boolean(process.env.APIFY_API_TOKEN);
}
