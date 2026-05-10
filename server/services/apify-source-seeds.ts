/**
 * Curated apify_source_configs for the 7 Indian institutional sources.
 *
 * Idempotent — `syncApifySourceSeeds()` runs at boot (alongside
 * syncAgentRegistry) and upserts each config by name. Existing admin
 * customizations (cron, watch_fields, default_input overrides) are
 * preserved on re-sync — only metadata fields get refreshed if changed
 * in code.
 *
 * Cost guardrail: every seed has `is_active=false` by default. Admin must
 * explicitly enable each from Apify Ops after reviewing target URLs and
 * estimated cost. Mirrors Week 1's agent-registry pattern.
 *
 * Actor choice: `apify/website-content-crawler` for all 7. It's official
 * Apify, FREE, 4.6/5 rating, 123K users, designed for the RAG-feeding
 * pattern we need (HTML → clean Markdown). Per-source customization
 * happens via start_urls + glob filters + crawl depth.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { apifySourceConfigs } from "../db/schema";

const WEBSITE_CONTENT_CRAWLER = "apify/website-content-crawler";

interface ApifySourceSeed {
  /** Stable identifier — matches by name on upsert */
  name: string;
  description: string;
  /** Maps to apify_source_configs.capability — used by ingestion dispatcher routing */
  capability: "discovery" | "enrichment" | "monitoring";
  /** Maps to target_type — what kind of entity this source feeds */
  targetType: "person" | "organization" | "filing" | "release";
  actorId: string;
  /** Default input for the actor — start URLs, globs, crawl depth */
  defaultInput: Record<string, unknown>;
  /** Fields the change-detection agent watches for diffs */
  watchFields: string[];
  /** Cron in IST. Schedule is set on the agent, not the source — this is informational. */
  cadenceHint: string;
  /** Per-run estimated cost in USD for the budget pre-flight */
  estimatedRunCostUsd: number;
}

export const APIFY_SOURCE_SEEDS: ApifySourceSeed[] = [
  {
    name: "rbi_press_releases",
    description: "Reserve Bank of India — press releases. New leadership appointments, regulatory orders, sectoral directives.",
    capability: "monitoring",
    targetType: "release",
    actorId: WEBSITE_CONTENT_CRAWLER,
    defaultInput: {
      startUrls: [{ url: "https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx" }],
      includeUrlGlobs: ["https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=*"],
      excludeUrlGlobs: ["https://www.rbi.org.in/**/Archive*", "https://www.rbi.org.in/**/_files/*"],
      crawlerType: "playwright:adaptive",
      maxCrawlPages: 200,
      maxCrawlDepth: 2,
      saveMarkdown: true,
      saveHtml: false,
      htmlTransformer: "readableTextIfPossible",
      proxyConfiguration: { useApifyProxy: true },
    },
    watchFields: ["title", "publishedAt", "url"],
    cadenceHint: "0 */6 * * *",
    estimatedRunCostUsd: 1.5,
  },
  {
    name: "pib_releases",
    description: "Press Information Bureau — Government of India press releases. Cabinet appointments, ministry-level changes, regulatory transitions.",
    capability: "monitoring",
    targetType: "release",
    actorId: WEBSITE_CONTENT_CRAWLER,
    defaultInput: {
      startUrls: [{ url: "https://pib.gov.in/PressReleasePage.aspx" }],
      includeUrlGlobs: ["https://pib.gov.in/PressReleasePage.aspx*", "https://pib.gov.in/PressReleseDetail.aspx*"],
      excludeUrlGlobs: ["https://pib.gov.in/Allarchive*", "https://pib.gov.in/IndexEng.aspx*"],
      crawlerType: "playwright:adaptive",
      maxCrawlPages: 300,
      maxCrawlDepth: 2,
      saveMarkdown: true,
      htmlTransformer: "readableTextIfPossible",
      proxyConfiguration: { useApifyProxy: true },
    },
    watchFields: ["title", "publishedAt", "ministry", "url"],
    cadenceHint: "0 */6 * * *",
    estimatedRunCostUsd: 2.0,
  },
  {
    name: "mca21_filings",
    description: "Ministry of Corporate Affairs — corporate filings index. Director changes, board reshuffles, company status updates.",
    capability: "monitoring",
    targetType: "filing",
    actorId: WEBSITE_CONTENT_CRAWLER,
    defaultInput: {
      startUrls: [{ url: "https://www.mca.gov.in/MinistryV2/companyformsdownload.html" }],
      includeUrlGlobs: ["https://www.mca.gov.in/**"],
      excludeUrlGlobs: [
        "https://www.mca.gov.in/**/Old/**",
        "https://www.mca.gov.in/**/_files/*",
        "https://www.mca.gov.in/**/notices/**",
      ],
      crawlerType: "playwright:adaptive",
      maxCrawlPages: 150,
      maxCrawlDepth: 2,
      saveMarkdown: true,
      htmlTransformer: "readableTextIfPossible",
      proxyConfiguration: { useApifyProxy: true },
    },
    watchFields: ["companyName", "filingType", "filingDate"],
    cadenceHint: "0 2 * * *",
    estimatedRunCostUsd: 1.0,
  },
  {
    name: "sebi_orders",
    description: "Securities and Exchange Board of India — orders and circulars. Adjudication orders, settlement orders, sectoral circulars.",
    capability: "monitoring",
    targetType: "release",
    actorId: WEBSITE_CONTENT_CRAWLER,
    defaultInput: {
      startUrls: [
        { url: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=6&smid=0" },
        { url: "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0" },
      ],
      includeUrlGlobs: ["https://www.sebi.gov.in/enforcement/**", "https://www.sebi.gov.in/legal/**"],
      excludeUrlGlobs: ["https://www.sebi.gov.in/sebiweb/**/_files/*"],
      crawlerType: "playwright:adaptive",
      maxCrawlPages: 200,
      maxCrawlDepth: 2,
      saveMarkdown: true,
      htmlTransformer: "readableTextIfPossible",
      proxyConfiguration: { useApifyProxy: true },
    },
    watchFields: ["orderTitle", "respondent", "orderDate"],
    cadenceHint: "0 4 * * *",
    estimatedRunCostUsd: 1.5,
  },
  {
    name: "bse_announcements",
    description: "BSE — corporate announcements. Board meeting outcomes, KMP changes, results, postal ballot notices.",
    capability: "monitoring",
    targetType: "filing",
    actorId: WEBSITE_CONTENT_CRAWLER,
    defaultInput: {
      startUrls: [
        { url: "https://www.bseindia.com/corporates/ann.html" },
      ],
      includeUrlGlobs: ["https://www.bseindia.com/corporates/**"],
      excludeUrlGlobs: ["https://www.bseindia.com/**/Old/**"],
      crawlerType: "playwright:adaptive",
      maxCrawlPages: 150,
      maxCrawlDepth: 2,
      saveMarkdown: true,
      htmlTransformer: "readableTextIfPossible",
      proxyConfiguration: { useApifyProxy: true },
    },
    watchFields: ["announcementType", "company", "date"],
    cadenceHint: "0 20 * * *",
    estimatedRunCostUsd: 1.5,
  },
  {
    name: "nse_announcements",
    description: "NSE — corporate announcements. Same shape as BSE; both sources confirm major events independently.",
    capability: "monitoring",
    targetType: "filing",
    actorId: WEBSITE_CONTENT_CRAWLER,
    defaultInput: {
      startUrls: [{ url: "https://www.nseindia.com/companies-listing/corporate-filings-announcements" }],
      includeUrlGlobs: ["https://www.nseindia.com/companies-listing/**"],
      crawlerType: "playwright:adaptive",
      maxCrawlPages: 150,
      maxCrawlDepth: 2,
      saveMarkdown: true,
      htmlTransformer: "readableTextIfPossible",
      proxyConfiguration: { useApifyProxy: true },
    },
    watchFields: ["announcementType", "company", "date"],
    cadenceHint: "0 20 * * *",
    estimatedRunCostUsd: 1.5,
  },
  {
    name: "gazette_of_india",
    description: "Gazette of India — official notifications. Final source of truth for senior government appointments and statutory changes.",
    capability: "monitoring",
    targetType: "release",
    actorId: WEBSITE_CONTENT_CRAWLER,
    defaultInput: {
      startUrls: [{ url: "https://egazette.gov.in/(S(WeeklyGazette))/Default.aspx" }],
      includeUrlGlobs: ["https://egazette.gov.in/**"],
      excludeUrlGlobs: ["https://egazette.gov.in/**/Archive*"],
      crawlerType: "playwright:adaptive",
      maxCrawlPages: 100,
      maxCrawlDepth: 2,
      saveMarkdown: true,
      saveContentTypes: "application/pdf",
      htmlTransformer: "readableTextIfPossible",
      proxyConfiguration: { useApifyProxy: true },
    },
    watchFields: ["notificationTitle", "ministry", "publishedDate"],
    cadenceHint: "0 2 * * *",
    estimatedRunCostUsd: 1.0,
  },
];

/**
 * Idempotent boot-time sync. Inserts new seeds, refreshes metadata on
 * existing rows, never overwrites admin customizations of cron, defaultInput
 * (the admin can edit URLs/depth/etc.), or watchFields once set.
 */
export async function syncApifySourceSeeds(): Promise<{
  created: number;
  updated: number;
  skipped: number;
}> {
  const db = getDb();
  if (!db) throw new Error("[apify-source-seeds] Database not available");

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const seed of APIFY_SOURCE_SEEDS) {
    const [existing] = await db
      .select()
      .from(apifySourceConfigs)
      .where(eq(apifySourceConfigs.name, seed.name))
      .limit(1);

    if (!existing) {
      await db.insert(apifySourceConfigs).values({
        id: crypto.randomUUID(),
        name: seed.name,
        description: seed.description,
        capability: seed.capability,
        targetType: seed.targetType,
        actorId: seed.actorId,
        defaultInput: seed.defaultInput,
        watchFields: seed.watchFields,
        runFrequencyCron: seed.cadenceHint,
        isActive: false, // cost guardrail — admin must enable
      });
      created++;
      continue;
    }

    // Refresh metadata only. Don't touch admin-customizable fields.
    const drift =
      existing.description !== seed.description ||
      existing.capability !== seed.capability ||
      existing.targetType !== seed.targetType ||
      existing.actorId !== seed.actorId;
    if (drift) {
      await db
        .update(apifySourceConfigs)
        .set({
          description: seed.description,
          capability: seed.capability,
          targetType: seed.targetType,
          actorId: seed.actorId,
        })
        .where(eq(apifySourceConfigs.id, existing.id));
      updated++;
    } else {
      skipped++;
    }
  }

  return { created, updated, skipped };
}

/**
 * Lookup helper for the ingestion dispatcher.
 */
export function getSeedByName(name: string): ApifySourceSeed | undefined {
  return APIFY_SOURCE_SEEDS.find((s) => s.name === name);
}
