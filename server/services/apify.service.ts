import { randomUUID } from "crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import { ENV } from "../_core/env";
import {
  alerts,
  apifyRuns,
  apifySourceConfigs,
  bankLeadershipRecords,
  domains,
  organizations,
  personIntel,
  persons,
  tenures,
  type ApifyRun,
  type ApifySourceConfig,
  type BankLeadershipRecord,
  type InsertAlert,
  type InsertApifyRun,
  type InsertApifySourceConfig,
  type InsertBankLeadershipRecord,
  type InsertOrganization,
  type InsertPerson,
  type InsertPersonIntel,
  type InsertTenure,
} from "../db/schema";
import type { z } from "zod";
import {
  apifyCapabilitySchema,
  apifyTargetTypeSchema,
  bankLeadershipRecordFilterSchema,
  createApifySourceConfigSchema,
  updateApifySourceConfigSchema,
  runApifySourceSchema,
  applyApifyDiscoverySchema,
  applyApifyEnrichmentSchema,
  createBankLeadershipRecordSchema,
  importBankLeadershipRecordSchema,
  syncApifyMonitoringSchema,
  updateBankLeadershipRecordSchema,
} from "@shared/validation";

export type ApifyCapability = z.infer<typeof apifyCapabilitySchema>;
export type ApifyTargetType = z.infer<typeof apifyTargetTypeSchema>;
export type CreateApifySourceConfigInput = z.infer<typeof createApifySourceConfigSchema>;
export type UpdateApifySourceConfigInput = z.infer<typeof updateApifySourceConfigSchema>;
export type RunApifySourceInput = z.infer<typeof runApifySourceSchema>;
export type ApplyApifyDiscoveryInput = z.infer<typeof applyApifyDiscoverySchema>;
export type ApplyApifyEnrichmentInput = z.infer<typeof applyApifyEnrichmentSchema>;
export type SyncApifyMonitoringInput = z.infer<typeof syncApifyMonitoringSchema>;
export type BankLeadershipRecordFilterInput = z.infer<typeof bankLeadershipRecordFilterSchema>;
export type CreateBankLeadershipRecordInput = z.infer<typeof createBankLeadershipRecordSchema>;
export type UpdateBankLeadershipRecordInput = z.infer<typeof updateBankLeadershipRecordSchema>;
export type ImportBankLeadershipRecordInput = z.infer<typeof importBankLeadershipRecordSchema>;

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

function toLegacyUserForeignKey(userId: string | null | undefined): number | null {
  if (!userId) return null;
  const normalized = String(userId).trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function asLegacyUserRef(userId: string | null | undefined) {
  return toLegacyUserForeignKey(userId) as any;
}

function toLegacyBankType(value: string | null | undefined) {
  switch (value) {
    case "psu_bank":
    case "private_bank":
    case "nbfc":
    case "dfi":
    case "bank":
      return "bank";
    case "corporate":
    case "company":
      return "company";
    case "regulator":
      return "regulator";
    case "government":
      return "government";
    default:
      return "other";
  }
}

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

function normalizeBankLeadershipRole(title: string | null): InsertBankLeadershipRecord["roleType"] {
  const value = (title ?? "").toLowerCase();
  if (value.includes("chairman and managing director") || value.includes("chairman & managing director") || value.includes("cmd")) {
    return "chairman_and_managing_director";
  }
  if (value.includes("managing director") || value.includes("md & ceo") || value.includes("md and ceo")) {
    return "managing_director";
  }
  if (value.includes("executive director")) {
    return "executive_director";
  }
  if (value.includes("chairman") || value.includes("chairperson")) {
    return "chairman";
  }
  return "other";
}

function inferBankLeadershipSourceType(sourceUrl: string | null, record: JsonRecord): InsertBankLeadershipRecord["sourceType"] {
  const flattened = JSON.stringify(record).toLowerCase();
  const url = (sourceUrl ?? "").toLowerCase();
  if (flattened.includes("annual report")) return "annual_report";
  if (flattened.includes("stock exchange") || url.includes("bseindia") || url.includes("nseindia")) return "stock_exchange_filing";
  if (flattened.includes("reserve bank of india") || url.includes("rbi.org.in")) return "regulator_publication";
  if (flattened.includes("ministry") || flattened.includes("government of india") || url.includes("gov.in")) return "government_release";
  if (flattened.includes("press release")) return "press_release";
  try {
    if (sourceUrl) {
      const hostname = new URL(sourceUrl).hostname.toLowerCase();
      if (!hostname.includes("linkedin.com") && !hostname.includes("wikipedia.org") && !hostname.includes("twitter.com") && !hostname.includes("x.com")) {
        return "official_bank_website";
      }
    }
  } catch {
    // Ignore malformed URLs and fall back to a generic type.
  }
  return sourceUrl ? "secondary_reference" : "unknown";
}

function inferConfidenceLevel(score: number | null | undefined): InsertBankLeadershipRecord["confidenceLevel"] {
  if (typeof score !== "number") return "medium";
  if (score >= 0.85) return "high";
  if (score >= 0.65) return "medium";
  return "low";
}

function buildBankLeadershipEvidence(item: NormalizedApifyItem) {
  const evidence: Array<{ label: string; url?: string; note?: string }> = [];
  if (item.sourceUrl) {
    evidence.push({
      label: "Observed source",
      url: item.sourceUrl,
      note: item.summary ?? item.currentTitle ?? undefined,
    });
  }
  if (item.summary) {
    evidence.push({
      label: "Normalized summary",
      note: item.summary,
    });
  }
  if (item.signals.length > 0) {
    evidence.push({
      label: "Detected signals",
      note: item.signals.join(", "),
    });
  }
  return evidence;
}

function isBankLeadershipCandidate(item: NormalizedApifyItem) {
  return Boolean(item.personName && item.currentTitle && (normalizeBankLeadershipRole(item.currentTitle) !== "other" || item.signals.length > 0));
}

async function persistBankLeadershipRecords(params: {
  runId: string;
  source: ApifySourceConfig | null;
  normalized: NormalizedApifyItem[];
  userId: string;
}) {
  const db = getDb();
  const targetOrganization = params.source?.targetOrganizationId
    ? (await db.select().from(organizations).where(eq(organizations.id, params.source.targetOrganizationId)).limit(1))[0] ?? null
    : null;

  const records: InsertBankLeadershipRecord[] = [];

  for (const item of params.normalized) {
    if (!isBankLeadershipCandidate(item)) continue;

    const matchedOrganization = item.organizationName
      ? await findOrganizationByName(item.organizationName)
      : targetOrganization;
    const sourceUrl = item.sourceUrl ?? matchedOrganization?.website ?? null;
    const sourceDomain = sourceUrl
      ? (() => {
          try {
            return new URL(sourceUrl).hostname.toLowerCase();
          } catch {
            return null;
          }
        })()
      : null;

    records.push({
      id: randomUUID(),
      organizationId: matchedOrganization?.id ?? targetOrganization?.id ?? null,
      apifyRunId: params.runId,
      sourceConfigId: params.source?.id ?? null,
      roleType: normalizeBankLeadershipRole(item.currentTitle),
      personName: item.personName ?? item.title,
      title: item.currentTitle ?? item.title,
      normalizedTitle: item.currentTitle ?? null,
      bankName: matchedOrganization?.name ?? item.organizationName ?? targetOrganization?.name ?? params.source?.name ?? "Unknown bank",
      bankType: toLegacyBankType(matchedOrganization?.type ?? "bank") as InsertBankLeadershipRecord["bankType"],
      sourceUrl: sourceUrl ?? "https://apify.invalid/local-record",
      sourceDomain,
      sourceType: inferBankLeadershipSourceType(sourceUrl, item.raw),
      sourcePublishedDate: null,
      sourceObservedAt: new Date(),
      sourceExcerpt: item.summary,
      sourcePayload: item.raw,
      validationStatus: "pending_review",
      confidenceLevel: inferConfidenceLevel(item.confidence),
      confidenceScore: item.confidence,
      validationNotes: null,
      validationEvidence: buildBankLeadershipEvidence(item),
      isImported: false,
      importedPersonId: null,
      importedTenureId: null,
      createdBy: asLegacyUserRef(params.userId),
    });
  }

  if (records.length > 0) {
    await db.insert(bankLeadershipRecords).values(records);
  }

  return records.length;
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
    createdBy: asLegacyUserRef(userId),
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
    apifyRunId: null,
    datasetId: null,
    status: "running",
    query: input.query ?? null,
    startUrls: input.startUrls ?? [],
    inputPayload: buildApifyInput(source, input),
    outputPreview: [],
    normalizedOutput: [],
    detectedChanges: [],
    summary: source?.description ?? null,
    itemCount: 0,
    errorMessage: null,
    sourceSnapshot: source ? JSON.parse(JSON.stringify(source)) : {},
    executionMeta: {
      requestedAt: now.toISOString(),
      requestInput: input,
    },
    targetOrganizationId: input.targetOrganizationId ?? source?.targetOrganizationId ?? null,
    targetPersonId: input.targetPersonId ?? source?.targetPersonId ?? null,
    initiatedBy: asLegacyUserRef(userId),
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

    const persistedLeadershipRecordCount = await persistBankLeadershipRecords({
      runId,
      source,
      normalized,
      userId,
    });

    const summary = [
      `${normalized.length} normalized item${normalized.length === 1 ? "" : "s"}`,
      detectedChanges.length > 0 ? `${detectedChanges.length} detected change${detectedChanges.length === 1 ? "" : "s"}` : null,
      persistedLeadershipRecordCount > 0 ? `${persistedLeadershipRecordCount} bank leadership review candidate${persistedLeadershipRecordCount === 1 ? "" : "s"}` : null,
    ].filter(Boolean).join(" • ");

    await db.update(apifyRuns).set({
      apifyRunId,
      datasetId: datasetId ?? null,
      status,
      outputPreview: datasetItems.slice(0, 10),
      normalizedOutput: normalized,
      detectedChanges,
      summary,
      itemCount: normalized.length,
      errorMessage: null,
      executionMeta: {
        completedAt: new Date().toISOString(),
        datasetItemCount: datasetItems.length,
        persistedLeadershipRecordCount,
      },
      finishedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(apifyRuns.id, runId));

    if (source?.id) {
      await db.update(apifySourceConfigs).set({
        lastRunAt: new Date(),
        lastRunStatus: status,
        lastRunSummary: summary,
        updatedAt: new Date(),
      }).where(eq(apifySourceConfigs.id, source.id));
    }

    return (await getApifyRunById(runId))!;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Apify error";
    await db.update(apifyRuns).set({
      status: "failed",
      outputPreview: [{ error: message }],
      summary: "Apify run failed before records could be normalized.",
      errorMessage: message,
      executionMeta: {
        failedAt: new Date().toISOString(),
        message,
      },
      finishedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(apifyRuns.id, runId));
    if (source?.id) {
      await db.update(apifySourceConfigs).set({
        lastRunAt: new Date(),
        lastRunStatus: "failed",
        lastRunSummary: message,
        updatedAt: new Date(),
      }).where(eq(apifySourceConfigs.id, source.id));
    }
    throw error;
  }
}

async function findOrganizationByName(name: string) {
  const db = getDb();
  const rows = await db.select().from(organizations).where(eq(organizations.name, name)).limit(1);
  return rows[0] ?? null;
}

function normalizeBankSegmentLabel(target: IndianBankTarget) {
  return target.regulatorGroup === "public_sector_bank" ? "Public sector" : "Private sector";
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
        createdBy: asLegacyUserRef(userId),
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
        contributedBy: asLegacyUserRef(userId),
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
        createdBy: asLegacyUserRef(userId),
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
        contributedBy: asLegacyUserRef(userId),
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

export async function listBankLeadershipRecords(input: BankLeadershipRecordFilterInput) {
  const db = getDb();
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const rows = await db.select().from(bankLeadershipRecords).orderBy(desc(bankLeadershipRecords.createdAt));

  const filtered = rows.filter((row) => {
    if (input.organizationId && row.organizationId !== input.organizationId) return false;
    if (input.apifyRunId && row.apifyRunId !== input.apifyRunId) return false;
    if (input.sourceConfigId && row.sourceConfigId !== input.sourceConfigId) return false;
    if (input.validationStatus && row.validationStatus !== input.validationStatus) return false;
    if (input.roleType && row.roleType !== input.roleType) return false;
    if (input.onlyUnimported && row.isImported) return false;
    if (input.search) {
      const query = input.search.toLowerCase();
      const haystack = `${row.personName} ${row.title} ${row.bankName} ${row.sourceUrl}`.toLowerCase();
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

export async function getBankLeadershipRecordById(id: string) {
  const db = getDb();
  const rows = await db.select().from(bankLeadershipRecords).where(eq(bankLeadershipRecords.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createBankLeadershipRecord(input: CreateBankLeadershipRecordInput, userId: string) {
  const db = getDb();
  const organization = input.organizationId
    ? (await db.select().from(organizations).where(eq(organizations.id, input.organizationId)).limit(1))[0] ?? null
    : input.bankName
      ? await findOrganizationByName(input.bankName)
      : null;

  const bankName = organization?.name ?? input.bankName ?? "Unknown bank";
  const roleType = normalizeBankLeadershipRole(input.title);
  const confidenceScore = input.confidenceScore ?? 0.92;
  const validationEvidence = input.validationEvidence ?? [
    {
      label: "Submitted source",
      url: input.sourceUrl,
      note: input.sourceExcerpt ?? `Manual leadership evidence for ${bankName}`,
    },
  ];

  const record: InsertBankLeadershipRecord = {
    id: randomUUID(),
    organizationId: organization?.id ?? input.organizationId ?? null,
    apifyRunId: null,
    sourceConfigId: input.sourceConfigId ?? null,
    roleType,
    personName: input.personName,
    title: input.title,
    normalizedTitle: input.title,
    bankName,
    bankType: toLegacyBankType(organization?.type ?? "bank") as InsertBankLeadershipRecord["bankType"],
    sourceUrl: input.sourceUrl,
    sourceDomain: (() => {
      try {
        return new URL(input.sourceUrl).hostname.toLowerCase();
      } catch {
        return null;
      }
    })(),
    sourceType: input.sourceType,
    sourcePublishedDate: input.sourcePublishedDate ? new Date(input.sourcePublishedDate) : null,
    sourceObservedAt: new Date(),
    sourceExcerpt: input.sourceExcerpt ?? null,
    sourcePayload: input.sourcePayload,
    validationStatus: input.validationStatus ?? "official_source_confirmed",
    confidenceLevel: input.confidenceLevel ?? inferConfidenceLevel(confidenceScore),
    confidenceScore,
    validationNotes: input.validationNotes ?? null,
    validationEvidence,
    isImported: false,
    importedPersonId: null,
    importedTenureId: null,
    createdBy: asLegacyUserRef(userId),
  };

  await db.insert(bankLeadershipRecords).values(record);
  return (await getBankLeadershipRecordById(record.id))!;
}

export async function updateBankLeadershipRecord(input: UpdateBankLeadershipRecordInput) {
  const db = getDb();
  const patch: Partial<InsertBankLeadershipRecord> = {
    updatedAt: new Date(),
  };

  if (input.validationStatus !== undefined) patch.validationStatus = input.validationStatus;
  if (input.confidenceLevel !== undefined) patch.confidenceLevel = input.confidenceLevel;
  if (input.confidenceScore !== undefined) patch.confidenceScore = input.confidenceScore;
  if (input.validationNotes !== undefined) patch.validationNotes = input.validationNotes;
  if (input.validationEvidence !== undefined) patch.validationEvidence = input.validationEvidence;
  if (input.sourceType !== undefined) patch.sourceType = input.sourceType;
  if (input.sourcePublishedDate !== undefined) {
    patch.sourcePublishedDate = input.sourcePublishedDate ? new Date(input.sourcePublishedDate) : null;
  }

  await db.update(bankLeadershipRecords).set(patch).where(eq(bankLeadershipRecords.id, input.id));
  const updated = await getBankLeadershipRecordById(input.id);
  if (!updated) {
    throw new Error("Bank leadership record not found.");
  }
  return updated;
}

export async function importBankLeadershipRecord(input: ImportBankLeadershipRecordInput, userId: string) {
  const db = getDb();
  const record = await getBankLeadershipRecordById(input.id);
  if (!record) {
    throw new Error("Bank leadership record not found.");
  }

  let organization = record.organizationId
    ? (await db.select().from(organizations).where(eq(organizations.id, record.organizationId)).limit(1))[0] ?? null
    : await findOrganizationByName(record.bankName);

  if (!organization) {
    if (!input.createOrganizationIfMissing || !input.domainId) {
      throw new Error("A domain is required to create the bank organization before import.");
    }
    organization = await ensureOrganization({
      name: record.bankName,
      domainId: input.domainId,
      website: record.sourceType === "official_bank_website" ? record.sourceUrl : null,
      type: "bank",
      city: null,
    });
  }

  const personName = input.personNameOverride ?? record.personName;
  const title = input.titleOverride ?? record.title;
  let person = await findPersonByNameAndOrg(personName, organization?.id ?? null);

  if (!person) {
    const personRow: InsertPerson = {
      id: randomUUID(),
      name: personName,
      currentTitle: title,
      currentOrgId: organization?.id ?? null,
      category: "banker",
      photoUrl: null,
      isTracked: true,
      createdBy: asLegacyUserRef(userId),
    };
    await db.insert(persons).values(personRow);
    person = (await db.select().from(persons).where(eq(persons.id, personRow.id)).limit(1))[0] ?? null;
  }

  let importedTenureId: string | null = null;
  if (person && organization) {
    const existingTenures = await db.select().from(tenures)
      .where(and(eq(tenures.personId, person.id), eq(tenures.orgId, organization.id)));
    const existingTenure = existingTenures.find((tenure) => tenure.title === title && Boolean(tenure.isCurrent) === input.markAsCurrent);

    if (existingTenure) {
      importedTenureId = existingTenure.id;
    } else {
      const tenureRow: InsertTenure = {
        id: randomUUID(),
        personId: person.id,
        orgId: organization.id,
        title,
        startDate: input.startDate ? new Date(input.startDate) : new Date(),
        endDate: input.markAsCurrent ? null : null,
        isCurrent: input.markAsCurrent,
        source: "auto_scraped",
        sourceUrl: record.sourceUrl,
        createdBy: asLegacyUserRef(userId),
      };
      await db.insert(tenures).values(tenureRow);
      importedTenureId = tenureRow.id;
    }
  }

  await db.update(bankLeadershipRecords).set({
    organizationId: organization?.id ?? record.organizationId ?? null,
    validationStatus: "imported",
    isImported: true,
    importedPersonId: person?.id ?? null,
    importedTenureId,
    updatedAt: new Date(),
  }).where(eq(bankLeadershipRecords.id, input.id));

  return {
    record: await getBankLeadershipRecordById(input.id),
    organization,
    person,
    importedTenureId,
  };
}

export async function getIndianBankTargets() {
  const db = getDb();
  const existingDomains = await db.select().from(domains).orderBy(desc(domains.createdAt));
  const existingOrganizations = await db.select().from(organizations);

  return INDIAN_BANK_TARGETS.map((target) => {
    const matchedOrganization = existingOrganizations.find((organization) => organization.name === target.name);
    return {
      ...target,
      sectorLabel: normalizeBankSegmentLabel(target),
      organizationExists: Boolean(matchedOrganization),
      organizationId: matchedOrganization?.id ?? null,
      suggestedDomainId: existingDomains[0]?.id ?? null,
    };
  });
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
      type: "bank",
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
      createdBy: asLegacyUserRef(userId),
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
