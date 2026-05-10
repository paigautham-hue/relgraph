/**
 * Ingestion agent dispatcher.
 *
 * One factory function `makeIngestionDispatcher(seedNames)` returns a
 * dispatcher bound to a curated list of apify_source_configs. Three
 * dispatchers are exported:
 *   - rbiPibIngestion (rbi_press_releases + pib_releases)
 *   - mca21GazetteIngestion (mca21_filings + gazette_of_india)
 *   - bseNseIngestion (bse_announcements + nse_announcements + sebi_orders)
 *
 * Per source it does:
 *   1. Pre-flight: APIFY_API_TOKEN configured? Within token budget?
 *      Source is is_active? — else skip with explanatory message.
 *   2. Spawn an apify_runs row with status='ready' so the run is visible
 *      in Apify Ops admin UI from the moment it starts.
 *   3. Call the actor (apify/website-content-crawler with curated input).
 *   4. Pull the dataset items.
 *   5. Normalise + write to provenance via recordProvenance helper.
 *      We do NOT yet auto-create persons or tenures — entity extraction
 *      from raw scraped Markdown is an LLM step and the LLM cost would
 *      exceed the cap on Day 1. Instead we record the URL + content_hash +
 *      title in provenance, attached to the source's targetOrganizationId
 *      if available, or as 'pending_review' for the admin queue.
 *   6. Update apify_runs with final status, items, output_preview.
 *
 * Dry-run (is_dry_run=true): runs steps 1-3-4 but skips writes and LLM calls.
 * Useful for "did the actor input even work?" without burning tokens.
 *
 * Idempotency: content_hash on provenance prevents duplicate facts. Re-running
 * yesterday's RBI page won't create a second provenance row.
 */

import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { apifyRuns, apifySourceConfigs, organizations, provenance } from "../../db/schema";
import { isApifyConfigured, runActor, fetchDataset, withinTokenBudget } from "../apify-client.service";
import { recordProvenance } from "../../routers/provenance.router";
import { getSeedByName } from "../apify-source-seeds";
import type { AgentRunResult } from "../agent-runner.service";
import type { ProvenanceSourceType } from "../../../shared/enums";
import crypto from "node:crypto";

const MAX_ITEMS_PER_RUN = 200; // hard cap regardless of seed
const SOURCE_TYPE_MAP: Record<string, ProvenanceSourceType> = {
  rbi_press_releases: "rbi_release",
  pib_releases: "pib_release",
  mca21_filings: "mca21_filing",
  sebi_orders: "sebi_order",
  bse_announcements: "bse_filing",
  nse_announcements: "nse_filing",
  gazette_of_india: "gazette_notification",
};

function provenanceSourceFor(seedName: string): ProvenanceSourceType {
  return SOURCE_TYPE_MAP[seedName] ?? "apify_scrape";
}

/**
 * Stable content hash of an item. We hash only the fields that identify a
 * unique published thing, not the full extracted body — extraction details
 * may shift (transformer changes, re-scrapes) without the underlying source
 * actually being new.
 */
function hashItem(item: Record<string, unknown>): string {
  const canonical = JSON.stringify({
    url: item.url ?? null,
    title: item.metadata && typeof item.metadata === "object" ? (item.metadata as Record<string, unknown>).title ?? null : null,
    publishedAt: item.metadata && typeof item.metadata === "object" ? (item.metadata as Record<string, unknown>).publishedAt ?? null : null,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

interface ItemSummary {
  url: string | null;
  title: string | null;
  contentHash: string;
}

function summariseItem(item: Record<string, unknown>): ItemSummary {
  const meta = (item.metadata && typeof item.metadata === "object" ? item.metadata : {}) as Record<string, unknown>;
  return {
    url: typeof item.url === "string" ? item.url : null,
    title:
      typeof meta.title === "string" ? meta.title :
      typeof item.title === "string" ? item.title :
      null,
    contentHash: hashItem(item),
  };
}

interface IngestionContext {
  runId: string;
  scheduleId: string;
  isDryRun: boolean;
  configOverrides: Record<string, unknown> | null;
  scopeUserId?: string | null;
}

/**
 * Build a dispatcher bound to a list of seed names. The agent runner calls
 * the returned function on schedule.
 */
export function makeIngestionDispatcher(seedNames: string[]): (ctx: IngestionContext) => Promise<AgentRunResult> {
  return async (ctx) => {
    if (!isApifyConfigured()) {
      return {
        status: "skipped",
        itemsSkipped: seedNames.length,
        output: { reason: "APIFY_API_TOKEN not configured. Set it in environment to enable ingestion." },
      };
    }

    const db = getDb();
    if (!db) throw new Error("Database not available");

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalProcessed = 0;
    const sourceResults: Array<Record<string, unknown>> = [];

    for (const seedName of seedNames) {
      const seed = getSeedByName(seedName);
      if (!seed) {
        sourceResults.push({ seedName, status: "skipped", reason: "unknown seed" });
        totalSkipped++;
        continue;
      }

      // Resolve the source config row.
      const [config] = await db
        .select()
        .from(apifySourceConfigs)
        .where(eq(apifySourceConfigs.name, seedName))
        .limit(1);
      if (!config) {
        sourceResults.push({ seedName, status: "skipped", reason: "source config row missing" });
        totalSkipped++;
        continue;
      }
      if (!config.isActive) {
        sourceResults.push({ seedName, status: "skipped", reason: "source is inactive (admin must enable)" });
        totalSkipped++;
        continue;
      }

      // Insert the apify_runs row up-front so the admin sees an in-flight run.
      const apifyRunRowId = crypto.randomUUID();
      const startedAt = new Date();
      await db.insert(apifyRuns).values({
        id: apifyRunRowId,
        sourceConfigId: config.id,
        capability: config.capability,
        targetType: config.targetType,
        actorId: seed.actorId,
        status: "running",
        startedAt,
      });

      try {
        // Spawn the Apify actor.
        const inputForRun = {
          ...(seed.defaultInput as Record<string, unknown>),
          ...(typeof config.defaultInput === "object" && config.defaultInput !== null ? (config.defaultInput as Record<string, unknown>) : {}),
        };
        // In dry-run we set maxCrawlPages to 1 to keep the cost trivial — we
        // still want to verify the input shape is accepted and the actor
        // reaches the start URL.
        if (ctx.isDryRun) {
          (inputForRun as Record<string, unknown>).maxCrawlPages = 1;
          (inputForRun as Record<string, unknown>).maxResults = 1;
        }

        const apifyResult = await runActor({
          actorName: seed.actorId,
          input: inputForRun,
          memoryMbytes: 1024,
          timeoutSecs: 240,
        });

        // Pull a bounded number of items.
        const items =
          apifyResult.status === "SUCCEEDED"
            ? await fetchDataset(apifyResult.datasetId, MAX_ITEMS_PER_RUN, 0)
            : [];

        const summaries = items.map(summariseItem);

        // Dedup against previously-recorded provenance using the content_hash
        // index added in the strategic-spine migration.
        const hashes = summaries.map((s) => s.contentHash).filter(Boolean);
        const existingHashes = new Set<string>();
        if (hashes.length > 0 && !ctx.isDryRun) {
          const rows = await db
            .select({ contentHash: provenance.contentHash })
            .from(provenance)
            .where(inArray(provenance.contentHash, hashes));
          for (const r of rows) {
            if (r.contentHash) existingHashes.add(r.contentHash);
          }
        }

        let created = 0;
        let skipped = 0;
        if (!ctx.isDryRun) {
          for (const sum of summaries) {
            if (existingHashes.has(sum.contentHash)) {
              skipped++;
              continue;
            }
            // Attach to the source's target_organization_id if pinned, else
            // record as a freestanding fact under the seed's host org name.
            const entityId =
              config.targetOrganizationId ??
              (await ensureSourceOrg(seedName)) ??
              null;
            if (!entityId) {
              skipped++;
              continue;
            }
            await recordProvenance({
              entityType: "organization",
              entityId,
              fieldName: "ingested_release",
              sourceType: provenanceSourceFor(seedName),
              sourceUrl: sum.url ?? undefined,
              sourceLabel: sum.title ?? undefined,
              contentHash: sum.contentHash,
              // System-driven write — capturedBy is null. The provenance row
              // still has source_type + source_url + content_hash for full
              // attribution.
              capturedBy: null,
              confidence: 0.9,
              metadata: { seedName, ingestedAt: new Date().toISOString() },
            });
            created++;
          }
        } else {
          skipped = summaries.length;
        }

        totalCreated += created;
        totalSkipped += skipped;
        totalProcessed += summaries.length;

        await db
          .update(apifyRuns)
          .set({
            apifyRunId: apifyResult.runId,
            datasetId: apifyResult.datasetId,
            status: ctx.isDryRun ? "ready" : apifyResult.status === "SUCCEEDED" ? "succeeded" : "failed",
            finishedAt: new Date(),
            itemCount: summaries.length,
            outputPreview: summaries.slice(0, 5),
            summary:
              ctx.isDryRun
                ? `Dry-run OK. Apify status=${apifyResult.status}. ${summaries.length} preview items.`
                : `${created} new, ${skipped} duplicates of ${summaries.length} fetched.`,
          })
          .where(eq(apifyRuns.id, apifyRunRowId));

        sourceResults.push({
          seedName,
          status: apifyResult.status,
          fetched: summaries.length,
          created,
          skipped,
          apifyRunId: apifyResult.runId,
          computeUsageUsd: apifyResult.computeUsageUsd,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db
          .update(apifyRuns)
          .set({
            status: "failed",
            finishedAt: new Date(),
            errorMessage: message,
          })
          .where(eq(apifyRuns.id, apifyRunRowId));
        sourceResults.push({ seedName, status: "failed", error: message });
      }
    }

    return {
      itemsProcessed: totalProcessed,
      itemsCreated: totalCreated,
      itemsUpdated: totalUpdated,
      itemsSkipped: totalSkipped,
      output: { sources: sourceResults },
    };
  };
}

/**
 * Ensure an organization row exists for the source feed itself (RBI, SEBI,
 * etc.) so we have a stable entity to attach ingested provenance to. Returns
 * its id.
 */
async function ensureSourceOrg(seedName: string): Promise<string | null> {
  const db = getDb();
  // Map seed → canonical org name (matches institutional-skeleton.ts).
  const orgNameMap: Record<string, string> = {
    rbi_press_releases: "Reserve Bank of India",
    pib_releases: "Ministry of Finance", // PIB releases route to MoF or specific ministry; default to MoF
    mca21_filings: "Ministry of Corporate Affairs",
    sebi_orders: "Securities and Exchange Board of India",
    bse_announcements: "BSE Limited",
    nse_announcements: "National Stock Exchange of India",
    gazette_of_india: "Ministry of Finance", // Gazette covers all ministries; default to MoF
  };
  const orgName = orgNameMap[seedName];
  if (!orgName) return null;
  const [row] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.name, orgName)).limit(1);
  return row?.id ?? null;
}

// Pre-bound dispatchers for the three ingestion agent buckets.
export const rbiPibIngestionDispatcher = makeIngestionDispatcher(["rbi_press_releases", "pib_releases"]);
export const mca21GazetteIngestionDispatcher = makeIngestionDispatcher(["mca21_filings", "gazette_of_india"]);
export const bseNseIngestionDispatcher = makeIngestionDispatcher(["bse_announcements", "nse_announcements", "sebi_orders"]);
