import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { domains, organizations } from "../db/schema";
import {
  CONTACT_IMPORT_HEADERS,
  CONTACT_IMPORT_INSTRUCTIONS,
  CONTACT_IMPORT_MAX_ROWS,
  CONTACT_IMPORT_SAMPLE_ROWS,
  CONTACT_IMPORT_TEMPLATE_VERSION,
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

export type ContactImportValidationResult = {
  ok: boolean;
  templateVersion: string;
  headers: string[];
  fileName: string;
  source: ContactImportSource;
  rowCount: number;
  validRows: NormalizedImportRow[];
  issues: ContactImportIssue[];
  review: ContactImportReview;
  validationDigest: string;
};

type OrganizationMatch = {
  id: string;
  name: string;
  domainId: string;
  domainName: string;
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
        })),
      }),
    )
    .digest("hex");
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

async function runAiReview(args: {
  fileName: string;
  issues: ContactImportIssue[];
  validRows: NormalizedImportRow[];
  invalidRowCount: number;
}) {
  const { fileName, issues, validRows, invalidRowCount } = args;
  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You review enterprise contact imports. Be conservative. If structural or mapping errors exist, fail the file. If data is structurally valid but contains suspicious patterns, mark needs_review. Return JSON only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            fileName,
            invalidRowCount,
            issueCount: issues.length,
            issues: issues.slice(0, 30),
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

    if (invalidRowCount > 0 && parsed.verdict === "pass") {
      return {
        score: Math.min(parsed.score, 60),
        verdict: "fail" as const,
        summary: "The import failed deterministic validation, so it cannot be approved.",
        warnings: parsed.warnings,
      };
    }

    return parsed;
  } catch {
    return invalidRowCount > 0
      ? {
          score: 42,
          verdict: "fail" as const,
          summary: "The file failed deterministic validation and AI review was unavailable.",
          warnings: ["AI review was unavailable during validation."],
        }
      : {
          score: 78,
          verdict: "needs_review" as const,
          summary: "The file passed structural validation, but AI review was unavailable. Please review the preview carefully before import.",
          warnings: ["AI review was unavailable during validation."],
        };
  }
}

export async function validateContactImport(params: {
  fileName: string;
  source: ContactImportSource;
  templateVersion?: string;
  headers: string[];
  rows: RawContactImportRow[];
  accessibleDomainIds?: string[] | null;
}) : Promise<ContactImportValidationResult> {
  const fileName = normalizeString(params.fileName);
  const headers = params.headers.map((header) => normalizeString(header));
  const issues: ContactImportIssue[] = [];

  if (params.templateVersion !== CONTACT_IMPORT_TEMPLATE_VERSION) {
    issues.push({
      rowNumber: 1,
      field: "templateVersion",
      severity: "error",
      message: `Template version mismatch. Expected ${CONTACT_IMPORT_TEMPLATE_VERSION}.`,
    });
  }

  if (headers.length !== CONTACT_IMPORT_HEADERS.length) {
    issues.push({
      rowNumber: 1,
      field: "headers",
      severity: "error",
      message: "The uploaded file does not use the exact RelGraph template columns.",
    });
  }

  CONTACT_IMPORT_HEADERS.forEach((expected, index) => {
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
  const validRows: NormalizedImportRow[] = [];
  const seenDuplicateKeys = new Set<string>();

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
      issues.push({
        rowNumber,
        field: "name",
        severity: "error",
        message: "Name is required.",
      });
    }

    if (name.length > 255) {
      issues.push({
        rowNumber,
        field: "name",
        severity: "error",
        message: "Name is too long.",
      });
    }

    if (currentTitle && currentTitle.length > 255) {
      issues.push({
        rowNumber,
        field: "currentTitle",
        severity: "error",
        message: "Title is too long.",
      });
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

    if (category) {
      const normalizedCategory = category as ContactImportCategory;
      if (!PERSON_CATEGORIES.includes(normalizedCategory)) {
        issues.push({
          rowNumber,
          field: "category",
          severity: "error",
          message: `Category '${category}' is not supported by the template.`,
        });
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

    const hasRowError = issues.some(
      (issue) => issue.rowNumber === rowNumber && issue.severity === "error",
    );

    if (!hasRowError && tracked !== null) {
      validRows.push({
        rowNumber,
        name,
        currentTitle,
        organizationId,
        organizationName,
        domainName,
        category: category ? (category as ContactImportCategory) : undefined,
        isTracked: tracked,
        photoUrl,
      });
    }
  }

  const review = await runAiReview({
    fileName,
    issues,
    validRows,
    invalidRowCount: params.rows.length - validRows.length,
  });

  const validationDigest = buildDigest(
    validRows,
    fileName,
    params.templateVersion || CONTACT_IMPORT_TEMPLATE_VERSION,
  );

  return {
    ok: issues.every((issue) => issue.severity !== "error") && review.verdict === "pass",
    templateVersion: params.templateVersion || CONTACT_IMPORT_TEMPLATE_VERSION,
    headers,
    fileName,
    source: params.source,
    rowCount: params.rows.length,
    validRows,
    issues,
    review,
    validationDigest,
  };
}

export function getContactImportTemplatePayload() {
  return {
    templateVersion: CONTACT_IMPORT_TEMPLATE_VERSION,
    headers: CONTACT_IMPORT_HEADERS,
    rows: CONTACT_IMPORT_SAMPLE_ROWS,
    instructions: CONTACT_IMPORT_INSTRUCTIONS,
  };
}
