import { createHash } from "crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { auditLog, domains, organizations, persons } from "../db/schema";
import {
  CONTACT_IMPORT_FIELD_LIBRARY,
  CONTACT_IMPORT_INSTRUCTIONS,
  CONTACT_IMPORT_MAX_ROWS,
  CONTACT_IMPORT_SAMPLE_ROWS,
  CONTACT_IMPORT_TEMPLATE_VERSION,
  DEFAULT_CONTACT_IMPORT_CATEGORY_FIELDS,
  getEnabledTemplateColumns,
  type ContactImportCategoryFieldConfig,
  type ContactImportExtraFieldKey,
} from "@shared/contactImport";
import { PERSON_CATEGORIES, type PersonCategory } from "@shared/enums";

export type ContactImportSource = "csv" | "xlsx" | "xls";
export type ContactImportCategory = PersonCategory;

export type RawContactImportRow = {
  rowNumber: number;
  name?: string;
  currentTitle?: string;
  organizationName?: string;
  domainName?: string;
  category?: string;
  isTracked?: boolean | string | number;
  photoUrl?: string;
} & Partial<Record<ContactImportExtraFieldKey, string | number | boolean | null | undefined>>;

export type DuplicateCandidate = {
  personId: string;
  name: string;
  currentTitle?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  domainName?: string | null;
  score: number;
  reason: string;
};

export type NormalizedImportRow = {
  rowNumber: number;
  name: string;
  currentTitle?: string;
  organizationId: string | null;
  organizationName?: string;
  domainName?: string;
  category?: ContactImportCategory;
  isTracked: boolean;
  photoUrl?: string;
  extraFieldValues: Partial<Record<ContactImportExtraFieldKey, string>>;
  duplicateCandidates: DuplicateCandidate[];
};

export type ContactImportIssue = {
  rowNumber: number;
  field: string;
  severity: "error" | "warning";
  message: string;
};

export type ContactImportReview = {
  score: number;
  verdict: "pass" | "needs_review" | "fail";
  summary: string;
  warnings: string[];
};

export type ContactImportHistoryStatus = "validated" | "blocked" | "imported";

export type ContactImportHistoryEntry = {
  id: string;
  createdAt: Date;
  createdByUserId: string | null;
  status: ContactImportHistoryStatus;
  fileName: string;
  source: ContactImportSource;
  templateVersion: string;
  rowCount: number;
  validRowCount: number;
  issueCount: number;
  duplicateCount: number;
  aiVerdict: ContactImportReview["verdict"];
  category?: ContactImportCategory;
  validationDigest?: string;
  summary?: string;
  errorReport?: Array<{ rowNumber: number; field: string; severity: string; message: string }>;
};

export type ContactImportValidationResult = {
  ok: boolean;
  blockedByDuplicates: boolean;
  templateVersion: string;
  headers: string[];
  expectedHeaders: string[];
  fileName: string;
  source: ContactImportSource;
  rowCount: number;
  validRows: NormalizedImportRow[];
  issues: ContactImportIssue[];
  review: ContactImportReview;
  validationDigest: string;
  duplicateRows: Array<{
    rowNumber: number;
    name: string;
    candidates: DuplicateCandidate[];
  }>;
  categoryFieldConfig: ContactImportCategoryFieldConfig[];
};

type OrganizationMatch = {
  id: string;
  name: string;
  domainId: string;
  domainName: string;
};

type ExistingPersonMatch = {
  id: string;
  name: string;
  currentTitle: string | null;
  organizationId: string | null;
  organizationName: string | null;
  domainName: string | null;
};

function normalizeString(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeLookup(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseTracked(value: RawContactImportRow["isTracked"]) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = normalizeString(value).toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0", ""].includes(normalized)) return false;
  return null;
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildDigest(rows: NormalizedImportRow[], fileName: string, templateVersion: string) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        fileName,
        templateVersion,
        rows: rows.map((row) => ({
          rowNumber: row.rowNumber,
          name: row.name,
          currentTitle: row.currentTitle,
          organizationId: row.organizationId,
          category: row.category,
          isTracked: row.isTracked,
          photoUrl: row.photoUrl,
          extraFieldValues: row.extraFieldValues,
        })),
      }),
    )
    .digest("hex");
}

function parseJsonSafe<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.trim().length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeConfig(
  overrides?: ContactImportCategoryFieldConfig[] | null,
): ContactImportCategoryFieldConfig[] {
  const source = overrides && overrides.length > 0
    ? overrides
    : DEFAULT_CONTACT_IMPORT_CATEGORY_FIELDS;

  return PERSON_CATEGORIES.map((category) => {
    const entry = source.find((candidate) => candidate.category === category);
    const enabledFieldKeys = (entry?.enabledFieldKeys ?? [])
      .filter((fieldKey): fieldKey is ContactImportExtraFieldKey => fieldKey in CONTACT_IMPORT_FIELD_LIBRARY);

    return {
      category,
      enabledFieldKeys: Array.from(new Set(enabledFieldKeys)),
    };
  });
}

function getTemplateHeaders(config?: ContactImportCategoryFieldConfig[] | null) {
  return getEnabledTemplateColumns(normalizeConfig(config)).map((column) => column.label);
}

async function loadOrganizations(accessibleDomainIds?: string[] | null) {
  const db = getDb();
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      domainId: organizations.domainId,
      domainName: domains.name,
    })
    .from(organizations)
    .innerJoin(domains, eq(organizations.domainId, domains.id))
    .where(
      accessibleDomainIds && accessibleDomainIds.length > 0
        ? inArray(organizations.domainId, accessibleDomainIds)
        : undefined,
    );

  const byComposite = new Map<string, OrganizationMatch>();
  const byName = new Map<string, OrganizationMatch[]>();

  for (const row of rows) {
    const orgKey = normalizeLookup(row.name);
    const domainKey = normalizeLookup(row.domainName);
    byComposite.set(`${orgKey}::${domainKey}`, row);
    const existing = byName.get(orgKey) ?? [];
    existing.push(row);
    byName.set(orgKey, existing);
  }

  return { byComposite, byName };
}

async function loadExistingPersons(accessibleDomainIds?: string[] | null) {
  const db = getDb();
  const rows = await db
    .select({
      id: persons.id,
      name: persons.name,
      currentTitle: persons.currentTitle,
      organizationId: persons.currentOrgId,
      organizationName: organizations.name,
      domainName: domains.name,
    })
    .from(persons)
    .leftJoin(organizations, eq(persons.currentOrgId, organizations.id))
    .leftJoin(domains, eq(organizations.domainId, domains.id))
    .where(
      accessibleDomainIds && accessibleDomainIds.length > 0
        ? inArray(organizations.domainId, accessibleDomainIds)
        : undefined,
    );

  const byName = new Map<string, ExistingPersonMatch[]>();

  for (const row of rows) {
    const key = normalizeLookup(row.name);
    const existing = byName.get(key) ?? [];
    existing.push(row);
    byName.set(key, existing);
  }

  return byName;
}

function detectDuplicateCandidates(
  row: {
    name: string;
    currentTitle?: string;
    organizationId: string | null;
    organizationName?: string;
    domainName?: string;
  },
  existingPersonsByName: Map<string, ExistingPersonMatch[]>,
) {
  const candidates = existingPersonsByName.get(normalizeLookup(row.name)) ?? [];

  return candidates
    .map<DuplicateCandidate | null>((candidate) => {
      let score = 0;
      const reasons: string[] = [];

      score += 70;
      reasons.push("Same contact name already exists in RelGraph.");

      if (row.organizationId && candidate.organizationId && row.organizationId === candidate.organizationId) {
        score += 20;
        reasons.push("Current organization matches exactly.");
      } else if (
        row.organizationName &&
        candidate.organizationName &&
        normalizeLookup(row.organizationName) === normalizeLookup(candidate.organizationName)
      ) {
        score += 15;
        reasons.push("Organization name appears to match.");
      }

      if (
        row.currentTitle &&
        candidate.currentTitle &&
        normalizeLookup(row.currentTitle) === normalizeLookup(candidate.currentTitle)
      ) {
        score += 10;
        reasons.push("Current title matches exactly.");
      }

      if (score < 80) return null;

      return {
        personId: candidate.id,
        name: candidate.name,
        currentTitle: candidate.currentTitle,
        organizationId: candidate.organizationId,
        organizationName: candidate.organizationName,
        domainName: candidate.domainName,
        score: Math.min(score, 99),
        reason: reasons.join(" "),
      };
    })
    .filter((candidate): candidate is DuplicateCandidate => Boolean(candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

async function runAiReview(args: {
  fileName: string;
  issues: ContactImportIssue[];
  validRows: NormalizedImportRow[];
  duplicateRows: Array<{ rowNumber: number; name: string; candidates: DuplicateCandidate[] }>;
  invalidRowCount: number;
}) {
  const { fileName, issues, validRows, duplicateRows, invalidRowCount } = args;

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You review enterprise contact imports. Be conservative. If structural, mapping, or duplicate-blocking issues exist, fail the file. If the file is structurally valid but still needs a human look, mark needs_review. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            fileName,
            invalidRowCount,
            issueCount: issues.length,
            duplicateRowCount: duplicateRows.length,
            issues: issues.slice(0, 30),
            duplicateRows: duplicateRows.slice(0, 10),
            sampleRows: validRows.slice(0, 20),
            rules: CONTACT_IMPORT_INSTRUCTIONS,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "contact_import_review",
          strict: true,
          schema: {
            type: "object",
            properties: {
              score: { type: "number" },
              verdict: {
                type: "string",
                enum: ["pass", "needs_review", "fail"],
              },
              summary: { type: "string" },
              warnings: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["score", "verdict", "summary", "warnings"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices[0]?.message.content;
    const text = typeof content === "string" ? content : JSON.stringify(content);
    const parsed = JSON.parse(text) as ContactImportReview;

    if ((invalidRowCount > 0 || duplicateRows.length > 0) && parsed.verdict === "pass") {
      return {
        score: Math.min(parsed.score, 60),
        verdict: "fail" as const,
        summary:
          duplicateRows.length > 0
            ? "The import includes likely duplicate contacts, so it cannot be approved until those rows are resolved."
            : "The import failed deterministic validation, so it cannot be approved.",
        warnings: parsed.warnings,
      };
    }

    return parsed;
  } catch {
    return invalidRowCount > 0 || duplicateRows.length > 0
      ? {
          score: 42,
          verdict: "fail" as const,
          summary:
            duplicateRows.length > 0
              ? "The file is blocked by likely duplicate contacts and AI review was unavailable."
              : "The file failed deterministic validation and AI review was unavailable.",
          warnings: ["AI review was unavailable during validation."],
        }
      : {
          score: 78,
          verdict: "needs_review" as const,
          summary:
            "The file passed structural validation, but AI review was unavailable. Please review the preview carefully before import.",
          warnings: ["AI review was unavailable during validation."],
        };
  }
}

export async function getStoredContactImportTemplateConfig() {
  const db = getDb();
  const [latest] = await db
    .select({
      id: auditLog.id,
      newValue: auditLog.newValue,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
      userId: auditLog.userId,
    })
    .from(auditLog)
    .where(eq(auditLog.fieldName, "contact_import.template_config"))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  if (!latest) {
    return {
      categories: normalizeConfig(DEFAULT_CONTACT_IMPORT_CATEGORY_FIELDS),
      templateVersion: CONTACT_IMPORT_TEMPLATE_VERSION,
      source: "default" as const,
      updatedAt: null,
      updatedByUserId: null,
    };
  }

  const parsed = parseJsonSafe<{
    templateVersion?: string;
    categories?: ContactImportCategoryFieldConfig[];
  }>(latest.newValue, {});

  return {
    categories: normalizeConfig(parsed.categories),
    templateVersion: parsed.templateVersion || CONTACT_IMPORT_TEMPLATE_VERSION,
    source: "audit_log" as const,
    updatedAt: latest.createdAt,
    updatedByUserId: latest.userId,
  };
}

export async function getContactImportTemplatePayload(overrides?: ContactImportCategoryFieldConfig[] | null) {
  const stored = await getStoredContactImportTemplateConfig();
  const categories = normalizeConfig(overrides ?? stored.categories);
  const columns = getEnabledTemplateColumns(categories);
  const headers = columns.map((column) => column.label);

  return {
    templateVersion: CONTACT_IMPORT_TEMPLATE_VERSION,
    headers,
    columns,
    rows: CONTACT_IMPORT_SAMPLE_ROWS,
    instructions: CONTACT_IMPORT_INSTRUCTIONS,
    categories,
  };
}

export async function validateContactImport(params: {
  fileName: string;
  source: ContactImportSource;
  templateVersion?: string;
  headers: string[];
  rows: RawContactImportRow[];
  accessibleDomainIds?: string[] | null;
  categoryFieldConfig?: ContactImportCategoryFieldConfig[] | null;
}): Promise<ContactImportValidationResult> {
  const fileName = normalizeString(params.fileName);
  const headers = params.headers.map((header) => normalizeString(header));
  const stored = await getStoredContactImportTemplateConfig();
  const categoryFieldConfig = normalizeConfig(params.categoryFieldConfig ?? stored.categories);
  const expectedHeaders = getTemplateHeaders(categoryFieldConfig);
  const issues: ContactImportIssue[] = [];

  if (params.templateVersion !== CONTACT_IMPORT_TEMPLATE_VERSION) {
    issues.push({
      rowNumber: 1,
      field: "templateVersion",
      severity: "error",
      message: `Template version mismatch. Expected ${CONTACT_IMPORT_TEMPLATE_VERSION}.`,
    });
  }

  if (headers.length !== expectedHeaders.length) {
    issues.push({
      rowNumber: 1,
      field: "headers",
      severity: "error",
      message: "The uploaded file does not use the exact RelGraph template columns for the selected configuration.",
    });
  }

  expectedHeaders.forEach((expected, index) => {
    if (headers[index] !== expected) {
      issues.push({
        rowNumber: 1,
        field: expected,
        severity: "error",
        message: `Column ${index + 1} must be '${expected}'.`,
      });
    }
  });

  if (params.rows.length === 0) {
    issues.push({
      rowNumber: 1,
      field: "rows",
      severity: "error",
      message: "The file has no contact rows.",
    });
  }

  if (params.rows.length > CONTACT_IMPORT_MAX_ROWS) {
    issues.push({
      rowNumber: 1,
      field: "rows",
      severity: "error",
      message: `Each import is limited to ${CONTACT_IMPORT_MAX_ROWS} contacts for a careful review experience.`,
    });
  }

  const { byComposite, byName } = await loadOrganizations(params.accessibleDomainIds);
  const existingPersonsByName = await loadExistingPersons(params.accessibleDomainIds);
  const validRows: NormalizedImportRow[] = [];
  const seenDuplicateKeys = new Set<string>();
  const duplicateRows: Array<{ rowNumber: number; name: string; candidates: DuplicateCandidate[] }> = [];

  for (const rawRow of params.rows.slice(0, CONTACT_IMPORT_MAX_ROWS)) {
    const rowNumber = rawRow.rowNumber;
    const name = normalizeString(rawRow.name);
    const currentTitle = normalizeString(rawRow.currentTitle) || undefined;
    const organizationName = normalizeString(rawRow.organizationName) || undefined;
    const domainName = normalizeString(rawRow.domainName) || undefined;
    const photoUrl = normalizeString(rawRow.photoUrl) || undefined;
    const category = normalizeString(rawRow.category);
    const tracked = parseTracked(rawRow.isTracked);
    let organizationId: string | null = null;

    if (!name) {
      issues.push({ rowNumber, field: "name", severity: "error", message: "Name is required." });
    }

    if (name.length > 255) {
      issues.push({ rowNumber, field: "name", severity: "error", message: "Name is too long." });
    }

    if (currentTitle && currentTitle.length > 255) {
      issues.push({ rowNumber, field: "currentTitle", severity: "error", message: "Title is too long." });
    }

    if (organizationName && !domainName) {
      issues.push({
        rowNumber,
        field: "domainName",
        severity: "error",
        message: "Domain name is required whenever organizationName is provided.",
      });
    }

    if (!organizationName && domainName) {
      issues.push({
        rowNumber,
        field: "organizationName",
        severity: "error",
        message: "Organization name is required whenever domainName is provided.",
      });
    }

    if (organizationName && domainName) {
      const compositeKey = `${normalizeLookup(organizationName)}::${normalizeLookup(domainName)}`;
      const matched = byComposite.get(compositeKey);
      if (!matched) {
        const nameMatches = byName.get(normalizeLookup(organizationName)) ?? [];
        issues.push({
          rowNumber,
          field: "organizationName",
          severity: "error",
          message:
            nameMatches.length > 0
              ? `Organization '${organizationName}' exists, but not in domain '${domainName}'. Use an exact organization and domain combination from the template reference.`
              : `Organization '${organizationName}' in domain '${domainName}' does not exist in RelGraph. The importer will not create new organizations automatically.`,
        });
      } else {
        organizationId = matched.id;
      }
    }

    let parsedCategory: ContactImportCategory | undefined;
    if (category) {
      if (!PERSON_CATEGORIES.includes(category as ContactImportCategory)) {
        issues.push({
          rowNumber,
          field: "category",
          severity: "error",
          message: `Category '${category}' is not supported by the template.`,
        });
      } else {
        parsedCategory = category as ContactImportCategory;
      }
    }

    if (tracked === null) {
      issues.push({
        rowNumber,
        field: "isTracked",
        severity: "error",
        message: "isTracked must be TRUE or FALSE.",
      });
    }

    if (photoUrl && !isValidHttpUrl(photoUrl)) {
      issues.push({
        rowNumber,
        field: "photoUrl",
        severity: "error",
        message: "photoUrl must be a valid public HTTP or HTTPS URL.",
      });
    }

    const duplicateKey = `${normalizeLookup(name)}::${organizationId ?? normalizeLookup(organizationName || "")}`;
    if (name && seenDuplicateKeys.has(duplicateKey)) {
      issues.push({
        rowNumber,
        field: "name",
        severity: "warning",
        message: "This file appears to contain a duplicate contact row.",
      });
    }
    seenDuplicateKeys.add(duplicateKey);

    const resolvedCategory = parsedCategory ?? "other";
    const enabledFieldKeys = new Set(
      categoryFieldConfig.find((entry) => entry.category === resolvedCategory)?.enabledFieldKeys ?? [],
    );
    const extraFieldValues: Partial<Record<ContactImportExtraFieldKey, string>> = {};

    for (const [fieldKey, definition] of Object.entries(CONTACT_IMPORT_FIELD_LIBRARY) as Array<[
      ContactImportExtraFieldKey,
      (typeof CONTACT_IMPORT_FIELD_LIBRARY)[ContactImportExtraFieldKey]
    ]>) {
      const rawValue = normalizeString(rawRow[fieldKey]);
      if (!rawValue) continue;

      if (!enabledFieldKeys.has(fieldKey)) {
        issues.push({
          rowNumber,
          field: fieldKey,
          severity: "error",
          message: `${definition.label} is not enabled for category '${resolvedCategory}'. Download a fresh template and try again.`,
        });
        continue;
      }

      if (fieldKey.toLowerCase().includes("url") && !isValidHttpUrl(rawValue)) {
        issues.push({
          rowNumber,
          field: fieldKey,
          severity: "error",
          message: `${definition.label} must be a valid public HTTP or HTTPS URL.`,
        });
        continue;
      }

      extraFieldValues[fieldKey] = rawValue;
    }

    const hasRowError = issues.some((issue) => issue.rowNumber === rowNumber && issue.severity === "error");

    if (!hasRowError && tracked !== null) {
      const duplicateCandidates = detectDuplicateCandidates(
        {
          name,
          currentTitle,
          organizationId,
          organizationName,
          domainName,
        },
        existingPersonsByName,
      );

      if (duplicateCandidates.length > 0) {
        issues.push({
          rowNumber,
          field: "name",
          severity: "error",
          message: "Likely duplicate contacts were found in RelGraph. Resolve them before importing.",
        });

        duplicateRows.push({
          rowNumber,
          name,
          candidates: duplicateCandidates,
        });
      }

      validRows.push({
        rowNumber,
        name,
        currentTitle,
        organizationId,
        organizationName,
        domainName,
        category: parsedCategory,
        isTracked: tracked,
        photoUrl,
        extraFieldValues,
        duplicateCandidates,
      });
    }
  }

  const review = await runAiReview({
    fileName,
    issues,
    validRows,
    duplicateRows,
    invalidRowCount: params.rows.length - validRows.length,
  });

  const validationDigest = buildDigest(
    validRows,
    fileName,
    params.templateVersion || CONTACT_IMPORT_TEMPLATE_VERSION,
  );

  return {
    ok:
      issues.every((issue) => issue.severity !== "error") &&
      duplicateRows.length === 0 &&
      review.verdict === "pass",
    blockedByDuplicates: duplicateRows.length > 0,
    templateVersion: params.templateVersion || CONTACT_IMPORT_TEMPLATE_VERSION,
    headers,
    expectedHeaders,
    fileName,
    source: params.source,
    rowCount: params.rows.length,
    validRows,
    issues,
    review,
    validationDigest,
    duplicateRows,
    categoryFieldConfig,
  };
}

export function buildContactImportErrorReport(result: ContactImportValidationResult) {
  const reportRows = result.issues.map((issue) => ({
    rowNumber: issue.rowNumber,
    field: issue.field,
    severity: issue.severity,
    message: issue.message,
  }));

  for (const duplicate of result.duplicateRows) {
    for (const candidate of duplicate.candidates) {
      reportRows.push({
        rowNumber: duplicate.rowNumber,
        field: "duplicate",
        severity: "error",
        message: `Possible match: ${candidate.name}${candidate.organizationName ? ` at ${candidate.organizationName}` : ""} (${candidate.reason})`,
      });
    }
  }

  return reportRows;
}

export async function listContactImportHistory(args?: {
  page?: number;
  pageSize?: number;
  status?: ContactImportHistoryStatus;
  category?: ContactImportCategory;
  source?: ContactImportSource;
  createdByUserId?: string;
  search?: string;
}) {
  const db = getDb();
  const page = args?.page ?? 1;
  const pageSize = args?.pageSize ?? 20;

  const rows = await db
    .select({
      id: auditLog.id,
      userId: auditLog.userId,
      newValue: auditLog.newValue,
      metadata: auditLog.metadata,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(eq(auditLog.fieldName, "contact_import.run"))
    .orderBy(desc(auditLog.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const data = rows
    .map<ContactImportHistoryEntry | null>((row) => {
      const payload = parseJsonSafe<Partial<ContactImportHistoryEntry>>(row.newValue, {});
      if (!payload.fileName || !payload.source || !payload.templateVersion) return null;

      return {
        id: row.id,
        createdAt: row.createdAt,
        createdByUserId: row.userId,
        status: (payload.status as ContactImportHistoryStatus) || "validated",
        fileName: payload.fileName,
        source: payload.source as ContactImportSource,
        templateVersion: payload.templateVersion,
        rowCount: payload.rowCount ?? 0,
        validRowCount: payload.validRowCount ?? 0,
        issueCount: payload.issueCount ?? 0,
        duplicateCount: payload.duplicateCount ?? 0,
        aiVerdict: (payload.aiVerdict as ContactImportReview["verdict"]) || "needs_review",
        category: payload.category as ContactImportCategory | undefined,
        validationDigest: payload.validationDigest,
        summary: payload.summary,
        errorReport: Array.isArray(payload.errorReport) ? payload.errorReport as ContactImportHistoryEntry["errorReport"] : [],
      };
    })
    .filter((row): row is ContactImportHistoryEntry => Boolean(row))
    .filter((row) => (args?.status ? row.status === args.status : true))
    .filter((row) => (args?.category ? row.category === args.category : true))
    .filter((row) => (args?.source ? row.source === args.source : true))
    .filter((row) => (args?.createdByUserId ? row.createdByUserId === args.createdByUserId : true))
    .filter((row) => {
      if (!args?.search) return true;
      const needle = normalizeLookup(args.search);
      return normalizeLookup(row.fileName).includes(needle) || normalizeLookup(row.summary || "").includes(needle);
    });

  return {
    data,
    page,
    pageSize,
    total: data.length,
    totalPages: Math.max(1, Math.ceil(data.length / pageSize)),
  };
}

export async function getContactImportHistoryEntry(id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: auditLog.id,
      userId: auditLog.userId,
      newValue: auditLog.newValue,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .where(eq(auditLog.id, id))
    .limit(1);

  if (!row) return null;

  const payload = parseJsonSafe<Partial<ContactImportHistoryEntry>>(row.newValue, {});
  if (!payload.fileName || !payload.source || !payload.templateVersion) return null;

  return {
    id: row.id,
    createdAt: row.createdAt,
    createdByUserId: row.userId,
    status: (payload.status as ContactImportHistoryStatus) || "validated",
    fileName: payload.fileName,
    source: payload.source as ContactImportSource,
    templateVersion: payload.templateVersion,
    rowCount: payload.rowCount ?? 0,
    validRowCount: payload.validRowCount ?? 0,
    issueCount: payload.issueCount ?? 0,
    duplicateCount: payload.duplicateCount ?? 0,
    aiVerdict: (payload.aiVerdict as ContactImportReview["verdict"]) || "needs_review",
    category: payload.category as ContactImportCategory | undefined,
    validationDigest: payload.validationDigest,
    summary: payload.summary,
    errorReport: Array.isArray(payload.errorReport) ? payload.errorReport as ContactImportHistoryEntry["errorReport"] : [],
  } satisfies ContactImportHistoryEntry;
}

export function buildContactImportArtifacts(args: {
  row: NormalizedImportRow;
  personId: string;
  userId: string;
}) {
  const intelEntries = Object.entries(args.row.extraFieldValues)
    .filter((entry): entry is [ContactImportExtraFieldKey, string] => Boolean(entry[1]))
    .filter(([fieldKey]) => fieldKey !== "notes")
    .map(([fieldKey, fieldValue]) => ({
      personId: args.personId,
      fieldName: fieldKey,
      fieldValue,
      contributedBy: args.userId,
      inputMethod: "system" as const,
      aiConfidence: 0.95,
    }));

  const noteValue = args.row.extraFieldValues.notes;
  const noteEntry = noteValue
    ? {
        personId: args.personId,
        authorId: args.userId,
        content: noteValue,
        inputMethod: "system" as const,
        visibilityLevel: "contributor" as const,
      }
    : null;

  return {
    intelEntries,
    noteEntry,
  };
}

export function buildContactImportRunPayload(args: {
  status: ContactImportHistoryStatus;
  category?: ContactImportCategory;
  result: Pick<
    ContactImportValidationResult,
    "fileName" | "source" | "templateVersion" | "rowCount" | "validRows" | "issues" | "review" | "validationDigest" | "duplicateRows"
  >;
}) {
  return {
    status: args.status,
    fileName: args.result.fileName,
    source: args.result.source,
    templateVersion: args.result.templateVersion,
    rowCount: args.result.rowCount,
    validRowCount: args.result.validRows.length,
    issueCount: args.result.issues.length,
    duplicateCount: args.result.duplicateRows.length,
    aiVerdict: args.result.review.verdict,
    validationDigest: args.result.validationDigest,
    category: args.category,
    summary: args.result.review.summary,
    errorReport: buildContactImportErrorReport(args.result as ContactImportValidationResult),
  } satisfies Omit<ContactImportHistoryEntry, "id" | "createdAt" | "createdByUserId">;
}

export function getContactImportTemplateFieldLibrary() {
  return CONTACT_IMPORT_FIELD_LIBRARY;
}
