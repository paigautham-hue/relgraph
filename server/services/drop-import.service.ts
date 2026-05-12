/**
 * Drop-import service.
 *
 * Single entry point that accepts anything a user can paste, drop, or paste-as-
 * file (text, CSV, Excel, vCard, JSON) and produces a structured `Proposal`
 * the UI can preview and commit. Branches transparently based on input shape:
 *
 *   Text paste / vCard / JSON / small CSV-Excel (≤30 rows)
 *     → LLM extraction via Claude Sonnet (handles unstructured + tolerates
 *       messy column names)
 *
 *   CSV / Excel with >30 rows
 *     → AI-column-mapping (reuses the existing `validateContactImport` for
 *       cheap, deterministic per-row processing)
 *
 * Proposals are NOT persisted server-side. The full proposal is returned to
 * the client, edited there, and sent back to `commit`. This avoids a stale-
 * row-cleanup table and matches the existing CSV-importer flow.
 *
 * Idempotency: each proposed entity gets a `contentHash` (sha256 of its
 * canonical form). On commit, the provenance write uses this hash so re-
 * importing the same content surfaces "already imported" rather than
 * duplicating.
 */

import { z } from "zod";
import { read as xlsxRead, utils as xlsxUtils } from "xlsx";
import crypto from "node:crypto";
import { extractEntitiesFromText, type ExtractedEntities } from "./drop-extractor.service";
import { parseVCardText } from "./vcard-parser";

const LLM_ROW_THRESHOLD = 30; // ≤ this → LLM extraction; > → column-mapping
const MAX_RAW_TEXT_CHARS = 100_000; // ~25-page paste; reject larger
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export type DropInputContentType =
  | "text"
  | "csv"
  | "excel"
  | "vcard"
  | "json"
  | "auto"; // let the classifier decide

export type ProposedEntityType =
  | "person"
  | "organization"
  | "tenure"
  | "relationship"
  | "interaction";

export interface ProposedField {
  key: string;
  value: string | number | null;
  // 0..1; high = LLM/source very confident; low = needs human eye.
  confidence: number;
}

export interface ProposedRow {
  /** Stable id within the proposal — used for client edits + commit dedup */
  id: string;
  type: ProposedEntityType;
  fields: ProposedField[];
  /** SHA-256 hex of the canonical row content for provenance dedup */
  contentHash: string;
  /** Best-guess overall confidence (min of field confidences) */
  confidence: number;
  /** If a likely existing entity was found, this is its id + name */
  dedupeCandidate: { id: string; name: string; matchScore: number } | null;
  /** Short excerpt from the source for the chip; populated for LLM path only */
  sourceExcerpt: string | null;
  /** Per-row decision the user makes on the client; defaults to "create" */
  decision?: "create" | "merge" | "skip";
}

export interface Proposal {
  /** Stable id across analyze→commit (sha of source content). Idempotent. */
  id: string;
  /** Shape we routed through */
  routedAs: "llm_extraction" | "column_mapping";
  /** Friendly label for UI ("Pasted text", "Acme.xlsx", "Conference contacts.csv") */
  sourceLabel: string;
  /** Source kind for provenance — maps to PROVENANCE_SOURCE_TYPES */
  sourceType: "csv_import" | "text_capture" | "manual_form" | "voice_capture" | "email_forward";
  rows: ProposedRow[];
  /** True for large/tabular proposals — UI virtualizes the list */
  isBulk: boolean;
  /** Diagnostics + warnings to surface in the UI */
  warnings: string[];
  /** Total cost estimate in USD for LLM-path proposals (zero for column-mapping) */
  llmCostUsd: number;
}

export const analyzeInputSchema = z.object({
  content: z.string().min(1),
  contentType: z.enum(["text", "csv", "excel", "vcard", "json", "auto"]).default("auto"),
  /** Filename for source-label display; ignored otherwise */
  fileName: z.string().max(255).optional(),
  /** For binary inputs (xlsx), `content` is base64. Plain text passes `text`. */
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
});
export type AnalyzeInput = z.infer<typeof analyzeInputSchema>;

/**
 * Top-level entry: classify, parse, normalize, return a Proposal.
 *
 * Never throws on bad user input — returns a Proposal with `rows=[]` and a
 * `warnings` array so the UI can render the cause (e.g. "Couldn't detect
 * a known format. Try plain text or a CSV.").
 */
export async function analyzeDropInput(input: AnalyzeInput): Promise<Proposal> {
  const warnings: string[] = [];

  // 1. Decode + size check
  const decodedBytes = input.encoding === "base64" ? Buffer.from(input.content, "base64") : Buffer.from(input.content, "utf8");
  if (decodedBytes.length > MAX_FILE_BYTES) {
    return emptyProposal(input.fileName, [
      `Input is ${(decodedBytes.length / 1024 / 1024).toFixed(1)} MB. Keep imports under 10 MB; split larger files.`,
    ]);
  }
  if (input.encoding === "utf8" && input.content.length > MAX_RAW_TEXT_CHARS) {
    return emptyProposal(input.fileName, [
      `Pasted text is ${(input.content.length / 1000).toFixed(0)}k characters. Cap is ${MAX_RAW_TEXT_CHARS / 1000}k.`,
    ]);
  }

  // 2. Classify
  const contentType = input.contentType === "auto" ? classifyContent(input.content, input.fileName, decodedBytes) : input.contentType;

  // 3. Route
  switch (contentType) {
    case "excel":
      return await handleSpreadsheet({ buffer: decodedBytes, fileName: input.fileName, format: "excel", warnings });
    case "csv":
      return await handleSpreadsheet({ text: input.content, fileName: input.fileName, format: "csv", warnings });
    case "vcard":
      return await handleVcard({ text: input.content, fileName: input.fileName, warnings });
    case "json":
      return await handleJson({ text: input.content, fileName: input.fileName, warnings });
    case "text":
    default:
      return await handleText({ text: input.content, fileName: input.fileName, warnings });
  }
}

// ─── Classification ──────────────────────────────────────────────────────────

function classifyContent(content: string, fileName: string | undefined, bytes: Buffer): DropInputContentType {
  // Filename extension wins when present.
  const ext = fileName?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") return "excel";
  if (ext === "csv" || ext === "tsv") return "csv";
  if (ext === "vcf" || ext === "vcard") return "vcard";
  if (ext === "json") return "json";

  // xlsx files start with PK (ZIP magic bytes).
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "excel";
  }

  // vCard payloads start with BEGIN:VCARD.
  if (/^\s*BEGIN:VCARD/im.test(content.slice(0, 200))) return "vcard";

  // JSON: starts with { or [.
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";

  // CSV heuristic: at least 2 lines, both with the same comma count ≥ 1.
  const lines = content.split(/\r?\n/).slice(0, 5).filter((l) => l.trim());
  if (lines.length >= 2) {
    const commaCount = lines[0].split(",").length;
    if (commaCount >= 2 && lines.slice(1).every((l) => Math.abs(l.split(",").length - commaCount) <= 1)) {
      return "csv";
    }
  }

  return "text";
}

// ─── Spreadsheet path (CSV + Excel) ──────────────────────────────────────────

async function handleSpreadsheet(args: {
  buffer?: Buffer;
  text?: string;
  fileName: string | undefined;
  format: "csv" | "excel";
  warnings: string[];
}): Promise<Proposal> {
  const sourceLabel = args.fileName ?? (args.format === "csv" ? "Pasted CSV" : "Spreadsheet");

  // Use SheetJS to read either binary xlsx or text csv into a unified rows array.
  let rows: Record<string, unknown>[];
  try {
    const workbook = args.buffer
      ? xlsxRead(args.buffer, { type: "buffer" })
      : xlsxRead(args.text!, { type: "string" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return emptyProposal(sourceLabel, ["Spreadsheet has no sheets."]);
    }
    const sheet = workbook.Sheets[firstSheetName];
    rows = xlsxUtils.sheet_to_json(sheet, { raw: false, defval: null }) as Record<string, unknown>[];
  } catch (err) {
    return emptyProposal(sourceLabel, [
      `Could not parse spreadsheet: ${err instanceof Error ? err.message : String(err)}`,
    ]);
  }

  if (rows.length === 0) {
    return emptyProposal(sourceLabel, ["Spreadsheet is empty (no data rows after the header)."]);
  }

  // Route on row count.
  const useLlm = rows.length <= LLM_ROW_THRESHOLD;
  const inputHash = sha256(JSON.stringify({ src: sourceLabel, rows }));

  if (useLlm) {
    // For small sheets, flatten to a text representation and let the LLM
    // do flexible extraction. Tolerates messy column names.
    const flat = rowsToText(rows);
    const extracted = await extractEntitiesFromText(flat, { sourceLabel });
    return buildLlmProposal(extracted, inputHash, sourceLabel, "csv_import", args.warnings, flat);
  }

  // Bulk path: column-mapping. We don't run the full `validateContactImport`
  // here (it's tied to the contact-import-history table). Instead, we
  // generate proposed rows directly with a lightweight column heuristic. The
  // existing contact-import flow is still the right tool for the formal
  // template-based import; this is the "drop and go" companion.
  const proposed = columnMapRowsToProposal(rows);
  return {
    id: inputHash,
    routedAs: "column_mapping",
    sourceLabel,
    sourceType: "csv_import",
    rows: proposed,
    isBulk: true,
    warnings: args.warnings,
    llmCostUsd: 0,
  };
}

// ─── vCard path ──────────────────────────────────────────────────────────────

async function handleVcard(args: {
  text: string;
  fileName: string | undefined;
  warnings: string[];
}): Promise<Proposal> {
  const sourceLabel = args.fileName ?? "vCard";
  const cards = parseVCardText(args.text);
  if (cards.length === 0) {
    return emptyProposal(sourceLabel, ["No valid vCard entries found in the input."]);
  }
  const inputHash = sha256(args.text);

  const rows: ProposedRow[] = cards.map((card) => {
    const fields: ProposedField[] = [];
    if (card.fullName) fields.push({ key: "name", value: card.fullName, confidence: 0.95 });
    if (card.title) fields.push({ key: "currentTitle", value: card.title, confidence: 0.9 });
    if (card.email) fields.push({ key: "email", value: card.email, confidence: 0.95 });
    if (card.phone) fields.push({ key: "phone", value: card.phone, confidence: 0.95 });
    if (card.organization) fields.push({ key: "_orgName", value: card.organization, confidence: 0.9 });

    const hash = sha256(JSON.stringify(fields));
    const minConfidence = fields.length === 0 ? 0 : Math.min(...fields.map((f) => f.confidence));
    return {
      id: crypto.randomUUID(),
      type: "person",
      fields,
      contentHash: hash,
      confidence: minConfidence,
      dedupeCandidate: null,
      sourceExcerpt: card.fullName ? `vCard: ${card.fullName}` : null,
    };
  });

  return {
    id: inputHash,
    routedAs: "llm_extraction", // closest match — structured upfront
    sourceLabel,
    sourceType: "csv_import",
    rows,
    isBulk: false,
    warnings: args.warnings,
    llmCostUsd: 0,
  };
}

// ─── JSON path ───────────────────────────────────────────────────────────────

async function handleJson(args: {
  text: string;
  fileName: string | undefined;
  warnings: string[];
}): Promise<Proposal> {
  const sourceLabel = args.fileName ?? "JSON";
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.text);
  } catch (err) {
    return emptyProposal(sourceLabel, [
      `JSON is not valid: ${err instanceof Error ? err.message : String(err)}`,
    ]);
  }

  // If it's an array of objects, treat as a tabular import.
  if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
    const rows = parsed as Record<string, unknown>[];
    const inputHash = sha256(args.text);
    if (rows.length <= LLM_ROW_THRESHOLD) {
      const flat = rowsToText(rows);
      const extracted = await extractEntitiesFromText(flat, { sourceLabel });
      return buildLlmProposal(extracted, inputHash, sourceLabel, "csv_import", args.warnings, flat);
    }
    const proposed = columnMapRowsToProposal(rows);
    return {
      id: inputHash,
      routedAs: "column_mapping",
      sourceLabel,
      sourceType: "csv_import",
      rows: proposed,
      isBulk: true,
      warnings: args.warnings,
      llmCostUsd: 0,
    };
  }

  // Single object or nested — fall through to LLM extraction.
  return await handleText({ text: args.text, fileName: args.fileName, warnings: args.warnings });
}

// ─── Free text path ──────────────────────────────────────────────────────────

async function handleText(args: { text: string; fileName: string | undefined; warnings: string[] }): Promise<Proposal> {
  const sourceLabel = args.fileName ?? "Pasted text";
  const inputHash = sha256(args.text);
  const extracted = await extractEntitiesFromText(args.text, { sourceLabel });
  return buildLlmProposal(extracted, inputHash, sourceLabel, "text_capture", args.warnings, args.text);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildLlmProposal(
  extracted: ExtractedEntities,
  inputHash: string,
  sourceLabel: string,
  sourceType: Proposal["sourceType"],
  warnings: string[],
  originalContent: string,
): Proposal {
  const rows: ProposedRow[] = [];
  const excerptOf = (s: string) => s.slice(0, 140);

  for (const p of extracted.persons) {
    const fields: ProposedField[] = [
      { key: "name", value: p.name, confidence: p.confidence ?? 0.8 },
    ];
    if (p.currentTitle) fields.push({ key: "currentTitle", value: p.currentTitle, confidence: p.confidence ?? 0.7 });
    if (p.orgName) fields.push({ key: "_orgName", value: p.orgName, confidence: p.confidence ?? 0.7 });
    if (p.email) fields.push({ key: "email", value: p.email, confidence: 0.9 });
    rows.push(makeRow("person", fields, excerptOf(p.sourceSnippet ?? originalContent)));
  }
  for (const o of extracted.organizations) {
    const fields: ProposedField[] = [{ key: "name", value: o.name, confidence: o.confidence ?? 0.8 }];
    if (o.type) fields.push({ key: "type", value: o.type, confidence: o.confidence ?? 0.7 });
    if (o.city) fields.push({ key: "city", value: o.city, confidence: o.confidence ?? 0.7 });
    rows.push(makeRow("organization", fields, excerptOf(o.sourceSnippet ?? originalContent)));
  }

  return {
    id: inputHash,
    routedAs: "llm_extraction",
    sourceLabel,
    sourceType,
    rows,
    isBulk: rows.length > 50,
    warnings: [...warnings, ...(extracted.warnings ?? [])],
    llmCostUsd: extracted.costUsd ?? 0,
  };
}

function makeRow(type: ProposedEntityType, fields: ProposedField[], excerpt: string | null): ProposedRow {
  const hash = sha256(JSON.stringify({ type, fields: fields.map((f) => [f.key, f.value]) }));
  const minConfidence = fields.length === 0 ? 0 : Math.min(...fields.map((f) => f.confidence));
  return {
    id: crypto.randomUUID(),
    type,
    fields,
    contentHash: hash,
    confidence: minConfidence,
    dedupeCandidate: null,
    sourceExcerpt: excerpt,
  };
}

/**
 * Bulk-path heuristic mapping: scan column names, guess what each one is,
 * produce ProposedRows directly. Compact compared to the full
 * `validateContactImport` flow — meant for the "I dragged in an Excel and
 * want it in fast" case rather than the formal template-based flow.
 */
function columnMapRowsToProposal(rows: Record<string, unknown>[]): ProposedRow[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0] ?? {});

  // Map common header variants to canonical RelGraph field names.
  const headerMap: Record<string, string> = {};
  for (const h of headers) {
    const lower = h.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (/^(name|fullname|contactname|personname)$/.test(lower)) headerMap[h] = "name";
    else if (/^(firstname|givenname)$/.test(lower)) headerMap[h] = "_firstName";
    else if (/^(lastname|surname|familyname)$/.test(lower)) headerMap[h] = "_lastName";
    else if (/^(title|currenttitle|role|jobtitle|designation|position)$/.test(lower)) headerMap[h] = "currentTitle";
    else if (/^(company|organization|org|employer|institution)$/.test(lower)) headerMap[h] = "_orgName";
    else if (/^(email|emailaddress|mail)$/.test(lower)) headerMap[h] = "email";
    else if (/^(phone|mobile|cell|telephone|contactnumber)$/.test(lower)) headerMap[h] = "phone";
    else if (/^(city|location|town)$/.test(lower)) headerMap[h] = "city";
    else headerMap[h] = h; // pass-through
  }

  return rows.map((raw) => {
    const fields: ProposedField[] = [];

    // Build name from first+last if name itself is missing.
    let nameValue = (raw[headers.find((h) => headerMap[h] === "name") ?? ""] ?? null) as string | null;
    if (!nameValue) {
      const fn = (raw[headers.find((h) => headerMap[h] === "_firstName") ?? ""] ?? "") as string;
      const ln = (raw[headers.find((h) => headerMap[h] === "_lastName") ?? ""] ?? "") as string;
      const joined = `${fn} ${ln}`.trim();
      if (joined) nameValue = joined;
    }
    if (nameValue) {
      fields.push({ key: "name", value: String(nameValue), confidence: 0.9 });
    }

    for (const h of headers) {
      const canonical = headerMap[h];
      if (canonical === "name" || canonical === "_firstName" || canonical === "_lastName") continue;
      const value = raw[h];
      if (value === null || value === undefined || value === "") continue;
      const conf =
        canonical === "email" || canonical === "phone" ? 0.95 :
        canonical === "_orgName" || canonical === "currentTitle" || canonical === "city" ? 0.85 :
        0.6; // unknown column passthrough
      fields.push({ key: canonical, value: typeof value === "number" ? value : String(value), confidence: conf });
    }

    const hash = sha256(JSON.stringify(fields.map((f) => [f.key, f.value])));
    const minConfidence = fields.length === 0 ? 0 : Math.min(...fields.map((f) => f.confidence));
    return {
      id: crypto.randomUUID(),
      type: "person" as const,
      fields,
      contentHash: hash,
      confidence: minConfidence,
      dedupeCandidate: null,
      sourceExcerpt: null,
    };
  });
}

function rowsToText(rows: Record<string, unknown>[]): string {
  return rows
    .map((row, i) => {
      const pairs = Object.entries(row)
        .filter(([_, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${k}: ${v}`);
      return `Row ${i + 1}: ${pairs.join("; ")}`;
    })
    .join("\n");
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function emptyProposal(sourceLabel: string | undefined, warnings: string[]): Proposal {
  return {
    id: sha256(warnings.join("|")),
    routedAs: "llm_extraction",
    sourceLabel: sourceLabel ?? "Drop import",
    sourceType: "text_capture",
    rows: [],
    isBulk: false,
    warnings,
    llmCostUsd: 0,
  };
}
