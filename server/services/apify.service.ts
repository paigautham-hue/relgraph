import { randomUUID } from "crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import {
  alerts,
  apifyRuns,
  apifySourceConfigs,
  domains,
  organizations,
  personIntel,
  persons,
  tenures,
  type ApifyRun,
  type ApifySourceConfig,
  type InsertAlert,
  type InsertApifyRun,
  type InsertApifySourceConfig,
  type InsertOrganization,
  type InsertPerson,
  type InsertPersonIntel,
  type InsertTenure,
} from "../db/schema";
import type { z } from "zod";
import {
  apifyCapabilitySchema,
  apifyTargetTypeSchema,
  createApifySourceConfigSchema,
  updateApifySourceConfigSchema,
  runApifySourceSchema,
  applyApifyDiscoverySchema,
  applyApifyEnrichmentSchema,
  syncApifyMonitoringSchema,
} from "@shared/validation";

export type ApifyCapability = z.infer<typeof apifyCapabilitySchema>;
export type ApifyTargetType = z.infer<typeof apifyTargetTypeSchema>;
export type CreateApifySourceConfigInput = z.infer<typeof createApifySourceConfigSchema>;
export type UpdateApifySourceConfigInput = z.infer<typeof updateApifySourceConfigSchema>;
export type RunApifySourceInput = z.infer<typeof runApifySourceSchema>;
export type ApplyApifyDiscoveryInput = z.infer<typeof applyApifyDiscoverySchema>;
export type ApplyApifyEnrichmentInput = z.infer<typeof applyApifyEnrichmentSchema>;
export type SyncApifyMonitoringInput = z.infer<typeof syncApifyMonitoringSchema>;

type JsonRecord = Record<string, unknown>;

type ApifyApiRunResponse = {
  data?: {
    id?: string;
    status?: string;
    defaultDatasetId?: string;
  };
};

type ApifyDatasetItemsResponse = unknown[];

type NormalizedApifyItem = {
  index: number;
  title: string;
  summary: string | null;
  sourceUrl: string | null;
  imageUrl: string | null;
  personName: string | null;
  currentTitle: string | null;
  organizationName: string | null;
  location: string | null;
  category: string | null;
  confidence: number;
  signals: string[];
  raw: JsonRecord;
};

type ChangeDetectionRecord = {
  index: number;
  sourceUrl: string | null;
  changedFields: Array<{
    field: string;
    previousValue: string;
    nextValue: string;
  }>;
};

type IndianBankTarget = {
  name: string;
  type: "psu_bank" | "private_bank";
  website: string;
  regulatorGroup: string;
};

const APIFY_API_BASE_URL = "https://api.apify.com/v2";

const INDIAN_BANK_TARGETS: IndianBankTarget[] = [
  { name: "State Bank of India", type: "psu_bank", website: "https://sbi.co.in", regulatorGroup: "public_sector_bank" },
  { name: "Bank of Baroda", type: "psu_bank", website: "https://www.bankofbaroda.in", regulatorGroup: "public_sector_bank" },
  { name: "Punjab National Bank", type: "psu_bank", website: "https://www.pnbindia.in", regulatorGroup: "public_sector_bank" },
  { name: "Canara Bank", type: "psu_bank", website: "https://canarabank.com", regulatorGroup: "public_sector_bank" },
  { name: "Union Bank of India", type: "psu_bank", website: "https://www.unionbankofindia.co.in", regulatorGroup: "public_sector_bank" },
  { name: "Indian Bank", type: "psu_bank", website: "https://www.indianbank.in", regulatorGroup: "public_sector_bank" },
  { name: "Bank of India", type: "psu_bank", website: "https://bankofindia.co.in", regulatorGroup: "public_sector_bank" },
  { name: "Central Bank of India", type: "psu_bank", website: "https://www.centralbankofindia.co.in", regulatorGroup: "public_sector_bank" },
  { name: "Indian Overseas Bank", type: "psu_bank", website: "https://www.iob.in", regulatorGroup: "public_sector_bank" },
  { name: "UCO Bank", type: "psu_bank", website: "https://www.ucobank.com", regulatorGroup: "public_sector_bank" },
  { name: "Bank of Maharashtra", type: "psu_bank", website: "https://bankofmaharashtra.in", regulatorGroup: "public_sector_bank" },
  { name: "Punjab & Sind Bank", type: "psu_bank", website: "https://punjabandsindbank.co.in", regulatorGroup: "public_sector_bank" },
  { name: "HDFC Bank", type: "private_bank", website: "https://www.hdfcbank.com", regulatorGroup: "private_sector_bank" },
  { name: "ICICI Bank", type: "private_bank", website: "https://www.icicibank.com", regulatorGroup: "private_sector_bank" },
  { name: "Axis Bank", type: "private_bank", website: "https://www.axisbank.com", regulatorGroup: "private_sector_bank" },
  { name: "Kotak Mahindra Bank", type: "private_bank", website: "https://www.kotak.com", regulatorGroup: "private_sector_bank" },
  { name: "IndusInd Bank", type: "private_bank", website: "https://www.indusind.com", regulatorGroup: "private_sector_bank" },
  { name: "Yes Bank", type: "private_bank", website: "https://www.yesbank.in", regulatorGroup: "private_sector_bank" },
  { name: "IDFC FIRST Bank", type: "private_bank", website: "https://www.idfcfirstbank.com", regulatorGroup: "private_sector_bank" },
  { name: "Federal Bank", type: "private_bank", website: "https://www.federalbank.co.in", regulatorGroup: "private_sector_bank" },
  { name: "South Indian Bank", type: "private_bank", website: "https://www.southindianbank.com", regulatorGroup: "private_sector_bank" },
  { name: "RBL Bank", type: "private_bank", website: "https://www.rblbank.com", regulatorGroup: "private_sector_bank" },
  { name: "Bandhan Bank", type: "private_bank", website: "https://bandhanbank.com", regulatorGroup: "private_sector_bank" },
  { name: "CSB Bank", type: "private_bank", website: "https://www.csb.co.in", regulatorGroup: "private_sector_bank" },
  { name: "City Union Bank", type: "private_bank", website: "https://www.cityunionbank.com", regulatorGroup: "private_sector_bank" },
  { name: "DCB Bank", type: "private_bank", website: "https://www.dcbbank.com", regulatorGroup: "private_sector_bank" },
  { name: "Karnataka Bank", type: "private_bank", website: "https://karnatakabank.com", regulatorGroup: "private_sector_bank" },
  { name: "Karur Vysya Bank", type: "private_bank", website: "https://www.kvb.co.in", regulatorGroup: "private_sector_bank" },
  { name: "Tamilnad Mercantile Bank", type: "private_bank", website: "https://www.tmbnet.in", regulatorGroup: "private_sector_bank" },
  { name: "Dhanlaxmi Bank", type: "private_bank", website: "https://www.dhanbank.com", regulatorGroup: "private_sector_bank" },
  { name: "Nainital Bank", type: "private_bank", website: "https://www.nainitalbank.co.in", regulatorGroup: "private_sector_bank" },
];

function ensureApifyToken() {
  if (!ENV.apifyApiToken) {
    throw new Error("APIFY_API_TOKEN is not configured");
  }
}

function parseJsonRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}

function parseJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asCleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function coalesceString(...values: unknown[]): string | null {
  for (const value of values) {
    const candidate = asCleanString(value);
    if (candidate) return candidate;
  }
  return null;
}

function pickUrl(record: JsonRecord): string | null {
  return coalesceString(
    record.url,
    record.link,
    record.profileUrl,
    record.profile_url,
    record.linkedinUrl,
    record.linkedin_url,
    record.sourceUrl,
    record.source_url,
    record.website,
  );
}

function summarizeRecord(record: JsonRecord): string | null {
  return coalesceString(
    record.summary,
    record.description,
    record.snippet,
    record.bio,
    record.about,
    record.text,
  );
}

function detectSignals(record: JsonRecord): string[] {
  const signals = new Set<string>();
  const flattened = JSON.stringify(record).toLowerCase();
  if (flattened.includes("chairman") || flattened.includes("chairperson")) signals.add("chairman_mentioned");
  if (flattened.includes("managing director") || flattened.includes("md & ceo") || flattened.includes("md and ceo")) signals.add("md_mentioned");
  if (flattened.includes("executive director")) signals.add("ed_mentioned");
  if (flattened.includes("bank")) signals.add("banking_context");
  return Array.from(signals);
}

function inferCategory(record: JsonRecord): string | null {
  const flattened = JSON.stringify(record).toLowerCase();
  if (flattened.includes("bank") || flattened.includes("banking")) return "banker";
  if (flattened.includes("rbi") || flattened.includes("regulator")) return "regulator";
  return null;
}

function normalizeApifyItem(item: unknown, index: number): NormalizedApifyItem {
  const record = parseJsonRecord(item);
  const personName = coalesceString(record.name, record.fullName, record.full_name, record.personName, record.person_name);
  const organizationName = coalesceString(record.organization, record.organizationName, record.organization_name, record.company, record.bankName, record.bank_name);
  const currentTitle = coalesceString(record.title, record.jobTitle, record.job_title, record.role, record.designation, record.position);
  const sourceUrl = pickUrl(record);
  const title = coalesceString(personName, currentTitle, organizationName, `Item ${index + 1}`) ?? `Item ${index + 1}`;

  return {
    index,
    title,
    summary: summarizeRecord(record),
    sourceUrl,
    imageUrl: coalesceString(record.imageUrl, record.image_url, record.photoUrl, record.photo_url),
    personName,
    currentTitle,
    organizationName,
    location: coalesceString(record.location, record.city, record.region, record.country),
    category: inferCategory(record),
    confidence: sourceUrl ? 0.82 : 0.58,
    signals: detectSignals(record),
    raw: record,
  };
}

function stringifyComparable(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  return JSON.stringify(value);
}

function detectChanges(previousItems: NormalizedApifyItem[], nextItems: NormalizedApifyItem[], watchFields: string[]): ChangeDetectionRecord[] {
  if (previousItems.length === 0 || watchFields.length === 0) {
    return [];
  }

  const previousByUrl = new Map<string, NormalizedApifyItem>();
  for (const item of previousItems) {
    if (item.sourceUrl) {
      previousByUrl.set(item.sourceUrl, item);
    }
  }

  const changes: ChangeDetectionRecord[] = [];
  for (const item of nextItems) {
    if (!item.sourceUrl) continue;
    const previous = previousByUrl.get(item.sourceUrl);
    if (!previous) continue;

    const changedFields = watchFields
      .map((field) => {
        const previousValue = stringifyComparable((previous as unknown as JsonRecord)[field] ?? previous.raw[field]);
        const nextValue = stringifyComparable((item as unknown as JsonRecord)[field] ?? item.raw[field]);
        if (!previousValue && !nextValue) return null;
        if (previousValue === nextValue) return null;
        return { field, previousValue, nextValue };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    if (changedFields.length > 0) {
      changes.push({
        index: item.index,
        sourceUrl: item.sourceUrl,
        changedFields,
      });
    }
  }

  return changes;
}

async function apifyRequest<T>(path: string, init?: RequestInit): Promise<T> {
  ensureApifyToken();
  const response = await fetch(`${APIFY_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ENV.apifyApiToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Apify request failed (${response.status}): ${body}`);
  }

  return response.json() as Promise<T>;
}

function buildApifyInput(source: Partial<ApifySourceConfig> | null, input: RunApifySourceInput) {
  const baseInput = parseJsonRecord(source?.defaultInput ?? {});
  const merged: JsonRecord = {
    ...baseInput,
    ...parseJsonRecord(input.inputOverrides),
  };

  if (input.query) merged.search = input.query;
  if (input.startUrls?.length) {
    merged.startUrls = input.startUrls.map((url: string) => ({ url }));
  }
  if (input.maxItems) merged.maxItems = input.maxItems;
  return merged;
}

async function runActor(source: Partial<ApifySourceConfig> | null, input: RunApifySourceInput) {
  const actorId = input.actorId ?? source?.actorId;
  const actorTaskId = input.actorTaskId ?? source?.actorTaskId;
  const payload = buildApifyInput(source, input);

  if (actorTaskId) {
    return apifyRequest<ApifyApiRunResponse>(`/actor-tasks/${actorTaskId}/runs?waitForFinish=120`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  if (!actorId) {
    throw new Error("No Apify actor or actor task was provided.");
  }

  return apifyRequest<ApifyApiRunResponse>(`/acts/${actorId}/runs?waitForFinish=120`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function fetchDatasetItems(datasetId: string): Promise<ApifyDatasetItemsResponse> {
  return apifyRequest<ApifyDatasetItemsResponse>(`/datasets/${datasetId}/items?clean=true&format=json`);
}

export async function listApifySourceConfigs(input: { page?: number; pageSize?: number; capability?: string; targetType?: string; isActive?: boolean; search?: string; }) {
  const db = getDb();
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const rows = await db.select().from(apifySourceConfigs).orderBy(desc(apifySourceConfigs.updatedAt));

  const filtered = rows.filter((row) => {
    if (input.capability && row.capability !== input.capability) return false;
    if (input.targetType && row.targetType !== input.targetType) return false;
    if (input.isActive !== undefined && row.isActive !== input.isActive) return false;
    if (input.search) {
      const query = input.search.toLowerCase();
      const haystack = `${row.name} ${row.description ?? ""} ${row.actorId ?? ""} ${row.actorTaskId ?? ""}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const offset = (page - 1) * pageSize;
  return {
    data: filtered.slice(offset, offset + pageSize),
    total: filtered.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
  };
}

export async function getApifySourceConfigById(id: string) {
  const db = getDb();
  const rows = await db.select().from(apifySourceConfigs).where(eq(apifySourceConfigs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createApifySourceConfig(input: CreateApifySourceConfigInput, userId: string) {
  const db = getDb();
  const id = randomUUID();
  const record: InsertApifySourceConfig = {
    id,
    name: input.name,
    description: input.description ?? null,
    capability: input.capability,
    targetType: input.targetType,
    actorId: input.actorId ?? null,
    actorTaskId: input.actorTaskId ?? null,
    defaultInput: input.defaultInput,
    fieldMappings: input.fieldMappings,
    watchFields: input.watchFields,
    runFrequencyCron: input.runFrequencyCron ?? null,
    targetOrganizationId: input.targetOrganizationId ?? null,
    targetPersonId: input.targetPersonId ?? null,
    createdBy: userId,
    isActive: input.isActive,
  };

  await db.insert(apifySourceConfigs).values(record);
  const created = await getApifySourceConfigById(id);
  if (!created) {
    throw new Error("Failed to create Apify source configuration.");
  }
  return created;
}

export async function updateApifySourceConfig(input: UpdateApifySourceConfigInput) {
  const db = getDb();
  const patch: Partial<InsertApifySourceConfig> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) patch.name = input.name;
  if (input.description !== undefined) patch.description = input.description;
  if (input.capability !== undefined) patch.capability = input.capability;
  if (input.targetType !== undefined) patch.targetType = input.targetType;
  if (input.actorId !== undefined) patch.actorId = input.actorId;
  if (input.actorTaskId !== undefined) patch.actorTaskId = input.actorTaskId;
  if (input.defaultInput !== undefined) patch.defaultInput = input.defaultInput;
  if (input.fieldMappings !== undefined) patch.fieldMappings = input.fieldMappings;
  if (input.watchFields !== undefined) patch.watchFields = input.watchFields;
  if (input.runFrequencyCron !== undefined) patch.runFrequencyCron = input.runFrequencyCron;
  if (input.targetOrganizationId !== undefined) patch.targetOrganizationId = input.targetOrganizationId;
  if (input.targetPersonId !== undefined) patch.targetPersonId = input.targetPersonId;
  if (input.isActive !== undefined) patch.isActive = input.isActive;

  await db.update(apifySourceConfigs).set(patch).where(eq(apifySourceConfigs.id, input.id));
  const updated = await getApifySourceConfigById(input.id);
  if (!updated) {
    throw new Error("Apify source configuration not found.");
  }
  return updated;
}

export async function listApifyRuns(input: { page?: number; pageSize?: number; sourceConfigId?: string; capability?: string; status?: string; targetPersonId?: string; targetOrganizationId?: string; }) {
  const db = getDb();
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const rows = await db.select().from(apifyRuns).orderBy(desc(apifyRuns.createdAt));

  const filtered = rows.filter((row) => {
    if (input.sourceConfigId && row.sourceConfigId !== input.sourceConfigId) return false;
    if (input.capability && row.capability !== input.capability) return false;
    if (input.status && row.status !== input.status) return false;
    if (input.targetPersonId && row.targetPersonId !== input.targetPersonId) return false;
    if (input.targetOrganizationId && row.targetOrganizationId !== input.targetOrganizationId) return false;
    return true;
  });

  const offset = (page - 1) * pageSize;
  return {
    data: filtered.slice(offset, offset + pageSize),
    total: filtered.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
  };
}

export async function getApifyRunById(id: string) {
  const db = getDb();
  const rows = await db.select().from(apifyRuns).where(eq(apifyRuns.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function runApifySource(input: RunApifySourceInput, userId: string) {
  const db = getDb();
  const source = input.sourceConfigId ? await getApifySourceConfigById(input.sourceConfigId) : null;
  const runId = randomUUID();
  const now = new Date();
  const seeded: InsertApifyRun = {
    id: runId,
    sourceConfigId: source?.id ?? null,
    capability: input.capability ?? source?.capability ?? "discovery",
    targetType: input.targetType ?? source?.targetType ?? "search",
    actorId: input.actorId ?? source?.actorId ?? null,
    actorTaskId: input.actorTaskId ?? source?.actorTaskId ?? null,
    status: "running",
    query: input.query ?? null,
    startUrls: input.startUrls ?? [],
    inputPayload: buildApifyInput(source, input),
    outputPreview: [],
    normalizedOutput: [],
    detectedChanges: [],
    targetOrganizationId: input.targetOrganizationId ?? source?.targetOrganizationId ?? null,
    targetPersonId: input.targetPersonId ?? source?.targetPersonId ?? null,
    initiatedBy: userId,
    startedAt: now,
  };

  await db.insert(apifyRuns).values(seeded);

  try {
    const apiRun = await runActor(source, input);
    const apifyRunId = apiRun.data?.id ?? null;
    const status = apiRun.data?.status ?? "succeeded";
    const datasetId = apiRun.data?.defaultDatasetId;
    const datasetItems = datasetId ? await fetchDatasetItems(datasetId) : [];
    const normalized = datasetItems.map((item, index) => normalizeApifyItem(item, index));

    const previousRuns = source?.id
      ? await db.select().from(apifyRuns)
          .where(and(eq(apifyRuns.sourceConfigId, source.id), eq(apifyRuns.status, "succeeded")))
          .orderBy(desc(apifyRuns.finishedAt), desc(apifyRuns.createdAt))
      : [];
    const previousNormalized = previousRuns[0] ? parseJsonArray(previousRuns[0].normalizedOutput).map((item, index) => normalizeApifyItem(item, index)) : [];
    const watchFields = Array.isArray(source?.watchFields) ? source.watchFields.filter((value): value is string => typeof value === "string") : [];
    const detectedChanges = detectChanges(previousNormalized, normalized, watchFields);

    await db.update(apifyRuns).set({
      apifyRunId,
      status,
      outputPreview: datasetItems.slice(0, 10),
      normalizedOutput: normalized,
      detectedChanges,
      finishedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(apifyRuns.id, runId));

    if (source?.id) {
      await db.update(apifySourceConfigs).set({ lastRunAt: new Date(), updatedAt: new Date() }).where(eq(apifySourceConfigs.id, source.id));
    }

    return (await getApifyRunById(runId))!;
  } catch (error) {
    await db.update(apifyRuns).set({
      status: "failed",
      outputPreview: [{ error: error instanceof Error ? error.message : "Unknown Apify error" }],
      finishedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(apifyRuns.id, runId));
    throw error;
  }
}

async function findOrganizationByName(name: string) {
  const db = getDb();
  const rows = await db.select().from(organizations).where(eq(organizations.name, name)).limit(1);
  return rows[0] ?? null;
}

async function ensureOrganization(input: { name: string; domainId: string; website?: string | null; type?: string | null; city?: string | null; }) {
  const existing = await findOrganizationByName(input.name);
  if (existing) return existing;

  const db = getDb();
  const id = randomUUID();
  const row: InsertOrganization = {
    id,
    name: input.name,
    domainId: input.domainId,
    website: input.website ?? null,
    city: input.city ?? null,
    type: (input.type as InsertOrganization["type"]) ?? null,
  };
  await db.insert(organizations).values(row);
  return (await db.select().from(organizations).where(eq(organizations.id, id)).limit(1))[0]!;
}

async function findPersonByNameAndOrg(name: string, orgId: string | null) {
  const db = getDb();
  const base = await db.select().from(persons).where(eq(persons.name, name));
  return base.find((person) => (person.currentOrgId ?? null) === (orgId ?? null)) ?? null;
}

export async function applyApifyDiscovery(input: ApplyApifyDiscoveryInput, userId: string) {
  const db = getDb();
  const run = await getApifyRunById(input.runId);
  if (!run) {
    throw new Error("Apify run not found.");
  }

  const selectedIndexes = new Set(input.selectedItemIndexes);
  const normalized = parseJsonArray(run.normalizedOutput)
    .map((item, index) => normalizeApifyItem(item, index))
    .filter((item) => selectedIndexes.has(item.index));

  const createdPeople: Array<{ personId: string; organizationId: string | null; name: string; }> = [];
  const createdIntel: InsertPersonIntel[] = [];

  for (const item of normalized) {
    const organization = item.organizationName
      ? await ensureOrganization({
          name: item.organizationName,
          domainId: input.domainId,
          website: item.sourceUrl,
          city: item.location,
        })
      : null;

    const existingPerson = item.personName ? await findPersonByNameAndOrg(item.personName, organization?.id ?? null) : null;
    const personId = existingPerson?.id ?? randomUUID();

    if (!existingPerson && item.personName) {
      const row: InsertPerson = {
        id: personId,
        name: item.personName,
        currentTitle: item.currentTitle ?? null,
        currentOrgId: organization?.id ?? null,
        category: (item.category ?? input.defaultCategory ?? "banker") as InsertPerson["category"],
        photoUrl: item.imageUrl ?? null,
        isTracked: true,
        createdBy: userId,
      };
      await db.insert(persons).values(row);
    }

    if (item.personName) {
      createdPeople.push({ personId, organizationId: organization?.id ?? null, name: item.personName });
    }

    const intelPayload: Array<[string, string | null]> = [
      ["apify_summary", item.summary],
      ["apify_source_url", item.sourceUrl],
      ["apify_location", item.location],
      ["apify_signals", item.signals.length > 0 ? item.signals.join(", ") : null],
    ];

    for (const [fieldName, fieldValue] of intelPayload) {
      if (!fieldValue || !item.personName) continue;
      createdIntel.push({
        id: randomUUID(),
        personId,
        fieldName,
        fieldValue,
        contributedBy: userId,
        inputMethod: "auto_scraper",
        sourceUrl: item.sourceUrl,
        aiConfidence: item.confidence,
      });
    }

    if (organization && item.currentTitle && item.personName) {
      const tenureRow: InsertTenure = {
        id: randomUUID(),
        personId,
        orgId: organization.id,
        title: item.currentTitle,
        startDate: new Date(),
        endDate: null,
        isCurrent: true,
        source: "auto_scraped",
        sourceUrl: item.sourceUrl,
        createdBy: userId,
      };
      await db.insert(tenures).values(tenureRow);
    }
  }

  if (createdIntel.length > 0) {
    await db.insert(personIntel).values(createdIntel);
  }

  return {
    runId: run.id,
    importedCount: createdPeople.length,
    people: createdPeople,
  };
}

export async function applyApifyEnrichment(input: ApplyApifyEnrichmentInput, userId: string) {
  const db = getDb();
  const run = await getApifyRunById(input.runId);
  if (!run) {
    throw new Error("Apify run not found.");
  }

  const items = parseJsonArray(run.normalizedOutput).map((item, index) => normalizeApifyItem(item, index));
  const selectedFields = new Set(input.selectedFields);
  const payload: InsertPersonIntel[] = [];

  for (const item of items) {
    const fieldEntries: Array<[string, string | null]> = [
      ["apify_current_title", item.currentTitle],
      ["apify_organization_name", item.organizationName],
      ["apify_location", item.location],
      ["apify_summary", item.summary],
      ["apify_source_url", item.sourceUrl],
      ["apify_signals", item.signals.length ? item.signals.join(", ") : null],
    ];

    for (const [fieldName, fieldValue] of fieldEntries) {
      if (!fieldValue) continue;
      if (selectedFields.size > 0 && !selectedFields.has(fieldName)) continue;
      payload.push({
        id: randomUUID(),
        personId: input.personId,
        fieldName,
        fieldValue,
        contributedBy: userId,
        inputMethod: "auto_scraper",
        sourceUrl: item.sourceUrl,
        aiConfidence: item.confidence,
      });
    }
  }

  if (payload.length > 0) {
    await db.insert(personIntel).values(payload);
  }

  return {
    runId: run.id,
    personId: input.personId,
    savedFieldCount: payload.length,
  };
}

export async function syncApifyMonitoring(input: SyncApifyMonitoringInput) {
  const db = getDb();
  const source = await getApifySourceConfigById(input.sourceConfigId);
  if (!source) {
    throw new Error("Apify source configuration not found.");
  }

  const recentRuns = await db.select().from(apifyRuns)
    .where(and(eq(apifyRuns.sourceConfigId, source.id), eq(apifyRuns.status, "succeeded")))
    .orderBy(desc(apifyRuns.finishedAt), desc(apifyRuns.createdAt));

  const latestRun = recentRuns[0];
  if (!latestRun) {
    return {
      sourceConfigId: source.id,
      changeCount: 0,
      alertsCreated: 0,
    };
  }

  const changes = parseJsonArray(latestRun.detectedChanges) as ChangeDetectionRecord[];
  if (!input.createAlerts || changes.length === 0) {
    return {
      sourceConfigId: source.id,
      changeCount: changes.length,
      alertsCreated: 0,
    };
  }

  const alertRows: InsertAlert[] = changes.map((change) => ({
    id: randomUUID(),
    type: "source_change_detected",
    severity: "warning",
    title: `${source.name} detected a leadership change`,
    description: change.changedFields
      .map((field) => `${field.field}: ${field.previousValue || "—"} → ${field.nextValue || "—"}`)
      .join("; "),
    personId: source.targetPersonId ?? null,
    orgId: source.targetOrganizationId ?? null,
    suggestedAction: "Review the detected change, verify against an official bank or organization source, and update the contact record if confirmed.",
    isDismissed: false,
    actionTaken: false,
  }));

  await db.insert(alerts).values(alertRows);
  return {
    sourceConfigId: source.id,
    changeCount: changes.length,
    alertsCreated: alertRows.length,
  };
}

export async function getIndianBankTargets() {
  const db = getDb();
  const existingDomains = await db.select().from(domains).orderBy(desc(domains.createdAt));
  const existingOrganizations = await db.select().from(organizations);

  return INDIAN_BANK_TARGETS.map((target) => ({
    ...target,
    organizationExists: existingOrganizations.some((organization) => organization.name === target.name),
    suggestedDomainId: existingDomains[0]?.id ?? null,
  }));
}

export async function createIndianBankSeedPreview(domainId: string) {
  const db = getDb();
  const domainRows = await db.select().from(domains).where(eq(domains.id, domainId)).limit(1);
  const selectedDomain = domainRows[0];
  if (!selectedDomain) {
    throw new Error("Domain not found.");
  }

  return {
    domain: selectedDomain,
    banks: INDIAN_BANK_TARGETS.map((bank) => ({
      ...bank,
      recommendedSearchQuery: `${bank.name} chairman managing director executive director official leadership`,
      monitoringHint: `Track leadership page changes for ${bank.name}`,
    })),
  };
}

export async function seedIndianBankOrganizations(domainId: string, userId: string) {
  const db = getDb();
  const existing = await db.select().from(organizations);
  const existingByName = new Map(existing.map((row) => [row.name, row]));
  const created: string[] = [];

  for (const bank of INDIAN_BANK_TARGETS) {
    if (existingByName.has(bank.name)) continue;
    const row: InsertOrganization = {
      id: randomUUID(),
      name: bank.name,
      domainId,
      type: bank.type,
      website: bank.website,
      city: null,
    };
    await db.insert(organizations).values(row);
    created.push(bank.name);
  }

  const monitoringConfigs = await db.select().from(apifySourceConfigs)
    .where(and(eq(apifySourceConfigs.capability, "monitoring"), eq(apifySourceConfigs.targetType, "organization")));
  const monitoredOrgNames = new Set(monitoringConfigs.map((row) => row.name));

  const currentOrganizations = await db.select().from(organizations).where(inArray(organizations.name, INDIAN_BANK_TARGETS.map((bank) => bank.name)));

  for (const bank of INDIAN_BANK_TARGETS) {
    const organization = currentOrganizations.find((row) => row.name === bank.name);
    if (!organization) continue;
    const configName = `${bank.name} leadership monitor`;
    if (monitoredOrgNames.has(configName)) continue;

    const sourceConfig: InsertApifySourceConfig = {
      id: randomUUID(),
      name: configName,
      description: `Monitor official leadership updates for ${bank.name}`,
      capability: "monitoring",
      targetType: "organization",
      actorId: null,
      actorTaskId: null,
      defaultInput: {
        search: `${bank.name} chairman managing director executive director official leadership`,
        bankWebsite: bank.website,
      },
      fieldMappings: {
        name: "name",
        title: "title",
        organization: "organizationName",
        sourceUrl: "url",
      },
      watchFields: ["title", "organizationName", "url"],
      runFrequencyCron: "0 0 * * 1",
      targetOrganizationId: organization.id,
      targetPersonId: null,
      createdBy: userId,
      isActive: true,
    };
    await db.insert(apifySourceConfigs).values(sourceConfig);
  }

  return {
    domainId,
    createdOrganizations: created,
    bankCount: INDIAN_BANK_TARGETS.length,
  };
}

export async function createMonitoringFailureAlert(sourceConfigId: string, message: string) {
  const db = getDb();
  const source = await getApifySourceConfigById(sourceConfigId);
  if (!source) return null;

  const alertRow: InsertAlert = {
    id: randomUUID(),
    type: "source_run_failed",
    severity: "critical",
    title: `${source.name} failed to run`,
    description: message,
    personId: source.targetPersonId ?? null,
    orgId: source.targetOrganizationId ?? null,
    suggestedAction: "Check the Apify actor configuration, source URL stability, and input mappings before rerunning.",
    isDismissed: false,
    actionTaken: false,
  };

  await db.insert(alerts).values(alertRow);
  return alertRow;
}
