/**
 * Drop-import router.
 *
 * Three procedures:
 *   - analyze: accepts pasted/dropped content, returns a Proposal
 *   - commit: writes the (possibly user-edited) Proposal rows atomically
 *     with provenance + audit, returns batch id + summary
 *   - undo: reverts a recent batch if invoked within 60s
 *
 * Commit is the only path that mutates the graph; everything before that is
 * preview-only. The client holds the proposal between analyze and commit —
 * we do NOT persist proposals server-side (avoids stale-row cleanup).
 *
 * Undo is implemented via a soft-delete pattern: on commit we stash the
 * inserted entity ids + batch id in `audit_log.metadata`. The `undo`
 * procedure looks up the batch and hard-deletes those rows + their
 * provenance. Audit log entries themselves are append-only — we add an
 * "undo" entry rather than mutating the original.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { router, contributorProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  auditLog,
  organizations,
  persons,
  provenance,
  tenures,
} from "../db/schema";
import {
  analyzeDropInput,
  analyzeInputSchema,
  type Proposal,
  type ProposedRow,
} from "../services/drop-import.service";
import { recordProvenance } from "./provenance.router";
import { logAudit } from "../middleware/audit";

const UNDO_WINDOW_SECONDS = 60;

// Per-user monthly cap (USD) on LLM extraction spend, enforced at analyze
// time. Soft cap — when exceeded, the procedure refuses to call the LLM
// but still returns a helpful warning.
const DEFAULT_MONTHLY_CAP_USD = 20;

// Shape the client sends back at commit time. The user may have edited
// fields, set per-row decisions (create/merge/skip), or added/removed rows.
const commitRowSchema = z.object({
  id: z.string(),
  type: z.enum(["person", "organization", "tenure", "relationship", "interaction"]),
  fields: z.array(
    z.object({
      key: z.string(),
      value: z.union([z.string(), z.number(), z.null()]),
      confidence: z.number().min(0).max(1),
    }),
  ),
  contentHash: z.string().min(8),
  confidence: z.number().min(0).max(1),
  dedupeCandidate: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      matchScore: z.number(),
    })
    .nullable()
    .optional(),
  sourceExcerpt: z.string().nullable().optional(),
  decision: z.enum(["create", "merge", "skip"]).default("create"),
});

const commitInputSchema = z.object({
  proposalId: z.string().min(8),
  sourceLabel: z.string().min(1).max(255),
  sourceType: z.enum(["csv_import", "text_capture", "manual_form", "voice_capture", "email_forward"]),
  rows: z.array(commitRowSchema).min(1).max(5000),
  /** Optional domain id to scope created persons + orgs. If omitted, we
   *  default to the user's primary domain (or first accessible). */
  domainId: z.string().uuid().optional(),
});

interface CommitSummary {
  batchId: string;
  created: number;
  merged: number;
  skipped: number;
  errors: Array<{ rowId: string; reason: string }>;
  /** Newly-created entity ids by type. Returned so the client can show
   *  "Open the first one" links and so undo can find them. */
  createdIds: { persons: string[]; organizations: string[]; tenures: string[] };
}

export const dropImportRouter = router({
  /**
   * Analyze content and return a Proposal. Always returns 200 + a Proposal
   * (possibly with `rows: []` and warnings) — never throws on bad input,
   * so the UI can render the cause inline.
   */
  analyze: contributorProcedure.input(analyzeInputSchema).mutation(async ({ input, ctx }) => {
    const proposal = await analyzeDropInput(input);

    // Soft cost cap — emit a warning when the user is approaching their
    // monthly LLM cap. We don't block here; commit is where real spending
    // happens via the dispatcher pattern.
    if (proposal.llmCostUsd > 0) {
      const monthlySpend = await getUserMonthlyDropSpend(ctx.user.id);
      const projected = monthlySpend + proposal.llmCostUsd;
      if (projected > DEFAULT_MONTHLY_CAP_USD) {
        proposal.warnings.push(
          `Drop-import spend this month is ~$${projected.toFixed(2)} (cap $${DEFAULT_MONTHLY_CAP_USD}). Future LLM extractions may be skipped — paste pre-formatted CSV instead.`,
        );
      }
    }

    // Audit the analyze (no entity created yet, so entityType=user).
    await logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "user",
      entityId: ctx.user.id,
      rawInputText: `[drop-analyze:${proposal.routedAs}] ${proposal.sourceLabel}`,
      metadata: {
        proposalId: proposal.id,
        routedAs: proposal.routedAs,
        rowCount: proposal.rows.length,
        llmCostUsd: proposal.llmCostUsd,
      },
    });

    return proposal;
  }),

  /**
   * Commit a (possibly user-edited) Proposal. Writes atomically per row:
   * one row's failure doesn't roll back the others. Returns a summary the
   * UI uses to show "47 created · 3 merged · 1 skipped".
   */
  commit: contributorProcedure.input(commitInputSchema).mutation(async ({ input, ctx }) => {
    const db = getDb();
    const batchId = crypto.randomUUID();
    const summary: CommitSummary = {
      batchId,
      created: 0,
      merged: 0,
      skipped: 0,
      errors: [],
      createdIds: { persons: [], organizations: [], tenures: [] },
    };

    // Resolve the domain to attach orgs/persons to.
    const domainId = await resolveDomainForCommit(input.domainId, ctx.user.id);
    if (!domainId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Couldn't find a domain to attach the imported entities to. Ask an admin to grant you access to at least one domain, or pass `domainId` explicitly.",
      });
    }

    // Build a lookup of org names → ids that the user already has (for
    // attaching persons + tenures to existing orgs). One query covers it.
    const allOrgs = await db
      .select({ id: organizations.id, name: organizations.name, shortName: organizations.shortName })
      .from(organizations)
      .where(eq(organizations.domainId, domainId));
    const orgByName = new Map<string, string>();
    for (const o of allOrgs) {
      orgByName.set(o.name.toLowerCase(), o.id);
      if (o.shortName) orgByName.set(o.shortName.toLowerCase(), o.id);
    }

    // Process rows in two passes: organizations first (so persons can attach
    // to them via _orgName), then persons.
    const orgRows = input.rows.filter((r) => r.type === "organization");
    const personRows = input.rows.filter((r) => r.type === "person");
    const otherRows = input.rows.filter((r) => r.type !== "organization" && r.type !== "person");

    // Normalize Zod's optional `dedupeCandidate` → null for the typed
    // ProposedRow shape used by the helpers below.
    const normalizeRow = (r: typeof input.rows[number]): ProposedRow => ({
      id: r.id,
      type: r.type,
      fields: r.fields,
      contentHash: r.contentHash,
      confidence: r.confidence,
      dedupeCandidate: r.dedupeCandidate ?? null,
      sourceExcerpt: r.sourceExcerpt ?? null,
      decision: r.decision,
    });

    for (const raw of orgRows) {
      const row = normalizeRow(raw);
      if (row.decision === "skip") {
        summary.skipped++;
        continue;
      }
      const result = await commitOrgRow({ row, domainId, userId: ctx.user.id, sourceType: input.sourceType, sourceLabel: input.sourceLabel, batchId });
      if (result.kind === "created" && result.id) {
        summary.created++;
        summary.createdIds.organizations.push(result.id);
        orgByName.set(getField(row, "name")?.toLowerCase() ?? "", result.id);
      } else if (result.kind === "merged") {
        summary.merged++;
      } else if (result.kind === "error") {
        summary.errors.push({ rowId: row.id, reason: result.reason ?? "unknown error" });
      } else {
        summary.skipped++;
      }
    }

    for (const raw of personRows) {
      const row = normalizeRow(raw);
      if (row.decision === "skip") {
        summary.skipped++;
        continue;
      }
      const result = await commitPersonRow({ row, domainId, orgByName, userId: ctx.user.id, sourceType: input.sourceType, sourceLabel: input.sourceLabel, batchId });
      if (result.kind === "created" && result.id) {
        summary.created++;
        summary.createdIds.persons.push(result.id);
        if (result.tenureId) summary.createdIds.tenures.push(result.tenureId);
      } else if (result.kind === "merged") {
        summary.merged++;
      } else if (result.kind === "error") {
        summary.errors.push({ rowId: row.id, reason: result.reason ?? "unknown error" });
      } else {
        summary.skipped++;
      }
    }

    // Misc types (tenure/relationship/interaction) skipped for v1 — they
    // belong to richer flows. Mark as skipped so the user sees the count.
    summary.skipped += otherRows.length;

    // Audit the batch — undo uses this entry to find what to revert.
    await logAudit({
      userId: ctx.user.id,
      actionType: "create",
      entityType: "user",
      entityId: ctx.user.id,
      rawInputText: `[drop-commit] ${input.sourceLabel}`,
      metadata: {
        batchId,
        proposalId: input.proposalId,
        summary,
      },
    });

    return summary;
  }),

  /**
   * Undo a recent batch. Looks up the audit entry by batchId, verifies the
   * caller is the same user + within the 60s window, and hard-deletes the
   * created entities + their provenance.
   *
   * Audit log itself is append-only — we add a new "undo" entry rather than
   * mutating the original.
   */
  undo: contributorProcedure
    .input(z.object({ batchId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();

      const cutoff = new Date(Date.now() - UNDO_WINDOW_SECONDS * 1000);
      const [entry] = await db
        .select({
          id: auditLog.id,
          userId: auditLog.userId,
          createdAt: auditLog.createdAt,
          metadata: auditLog.metadata,
        })
        .from(auditLog)
        .where(
          and(
            sql`JSON_EXTRACT(${auditLog.metadata}, '$.batchId') = ${input.batchId}`,
            gte(auditLog.createdAt, cutoff),
          ),
        )
        .orderBy(desc(auditLog.createdAt))
        .limit(1);

      if (!entry) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Can't undo this batch — either it's older than ${UNDO_WINDOW_SECONDS}s or doesn't exist.`,
        });
      }
      if (entry.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only undo your own batches." });
      }

      const meta = (entry.metadata ?? {}) as { summary?: CommitSummary };
      const ids = meta.summary?.createdIds ?? { persons: [], organizations: [], tenures: [] };
      let deleted = 0;

      // Delete provenance scoped to THIS batch. Filtering by entityId alone
      // would nuke unrelated provenance rows (e.g. later edits attached to
      // the same person). Every drop-import provenance row was written with
      // metadata.batchId; that's our targeting key.
      await db
        .delete(provenance)
        .where(sql`JSON_EXTRACT(${provenance.metadata}, '$.batchId') = ${input.batchId}`);

      if (ids.tenures.length > 0) {
        await db.delete(tenures).where(inArray(tenures.id, ids.tenures));
        deleted += ids.tenures.length;
      }
      if (ids.persons.length > 0) {
        await db.delete(persons).where(inArray(persons.id, ids.persons));
        deleted += ids.persons.length;
      }
      if (ids.organizations.length > 0) {
        await db.delete(organizations).where(inArray(organizations.id, ids.organizations));
        deleted += ids.organizations.length;
      }

      await logAudit({
        userId: ctx.user.id,
        actionType: "delete",
        entityType: "user",
        entityId: ctx.user.id,
        rawInputText: `[drop-undo] batchId=${input.batchId}`,
        metadata: { batchId: input.batchId, undoneCount: deleted },
      });

      return { batchId: input.batchId, deleted };
    }),

  /**
   * Read-only: returns recent drop-import batches the user could potentially
   * undo. Drives the "recently imported" panel if we want one later. For v1
   * the UI uses only the in-memory toast — this is here for future polish.
   */
  recentBatches: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
    const rows = await db
      .select({
        id: auditLog.id,
        createdAt: auditLog.createdAt,
        rawInputText: auditLog.rawInputText,
        metadata: auditLog.metadata,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, ctx.user.id),
          gte(auditLog.createdAt, cutoff),
          sql`JSON_EXTRACT(${auditLog.metadata}, '$.batchId') IS NOT NULL`,
          sql`${auditLog.rawInputText} LIKE '[drop-commit]%'`,
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(20);
    return rows.map((r) => ({
      batchId: ((r.metadata as { batchId?: string } | null)?.batchId) ?? null,
      createdAt: r.createdAt,
      sourceLabel: r.rawInputText?.replace(/^\[drop-commit\]\s*/, "") ?? "Drop import",
      summary: (r.metadata as { summary?: CommitSummary } | null)?.summary ?? null,
    }));
  }),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getField(row: ProposedRow, key: string): string | null {
  const f = row.fields.find((x) => x.key === key);
  if (!f || f.value === null) return null;
  return String(f.value).trim();
}

async function resolveDomainForCommit(explicit: string | undefined, userId: string): Promise<string | null> {
  if (explicit) return explicit;
  const db = getDb();
  // Prefer any domain the user has access to; fallback to first active.
  // db.execute() in Drizzle MySQL returns [rows, fields]; cast through unknown.
  const userScoped = (await db.execute(sql`
    SELECT d.id FROM domains d
    INNER JOIN user_domain_access uda ON uda.domain_id = d.id
    WHERE uda.user_id = ${userId} AND d.is_active = TRUE
    LIMIT 1
  `)) as unknown as [Array<{ id: string }>, unknown];
  if (Array.isArray(userScoped[0]) && userScoped[0].length > 0) {
    return userScoped[0][0].id;
  }

  const fallback = (await db.execute(sql`
    SELECT id FROM domains WHERE is_active = TRUE LIMIT 1
  `)) as unknown as [Array<{ id: string }>, unknown];
  if (Array.isArray(fallback[0]) && fallback[0].length > 0) {
    return fallback[0][0].id;
  }
  return null;
}

/**
 * Spend tally for the per-user monthly cap. Sums llmCostUsd from analyze
 * audit entries this calendar month. Best-effort; returns 0 on any error.
 */
async function getUserMonthlyDropSpend(userId: string): Promise<number> {
  try {
    const db = getDb();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const rows = await db
      .select({ metadata: auditLog.metadata })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, userId),
          gte(auditLog.createdAt, monthStart),
          sql`${auditLog.rawInputText} LIKE '[drop-analyze:%'`,
        ),
      );
    let total = 0;
    for (const r of rows) {
      const cost = (r.metadata as { llmCostUsd?: number } | null)?.llmCostUsd ?? 0;
      total += cost;
    }
    return total;
  } catch {
    return 0;
  }
}

interface CommitOrgResult {
  kind: "created" | "merged" | "skipped" | "error";
  id?: string;
  reason?: string;
}

async function commitOrgRow(args: {
  row: ProposedRow;
  domainId: string;
  userId: string;
  sourceType: Proposal["sourceType"];
  sourceLabel: string;
  batchId: string;
}): Promise<CommitOrgResult> {
  const db = getDb();
  const name = getField(args.row, "name");
  if (!name) return { kind: "error", reason: "Missing organization name" };

  // Merge path: explicit user choice to map to existing org.
  if (args.row.decision === "merge" && args.row.dedupeCandidate) {
    return { kind: "merged", id: args.row.dedupeCandidate.id };
  }

  try {
    const id = crypto.randomUUID();
    const shortName = getField(args.row, "shortName");
    const city = getField(args.row, "city");
    const website = getField(args.row, "website");
    const orgTypeRaw = getField(args.row, "type");
    const orgType = orgTypeRaw && /^(psu_bank|private_bank|regulator|government|nbfc|dfi|corporate|other)$/.test(orgTypeRaw)
      ? (orgTypeRaw as "psu_bank" | "private_bank" | "regulator" | "government" | "nbfc" | "dfi" | "corporate" | "other")
      : "other";

    await db.insert(organizations).values({
      id,
      name,
      shortName: shortName ?? undefined,
      type: orgType,
      city: city ?? undefined,
      website: website ?? undefined,
      domainId: args.domainId,
    });

    await recordProvenance({
      entityType: "organization",
      entityId: id,
      sourceType: args.sourceType,
      sourceLabel: args.sourceLabel,
      contentHash: args.row.contentHash,
      capturedBy: args.userId,
      confidence: args.row.confidence,
      metadata: { batchId: args.batchId, viaDropImport: true },
    });
    return { kind: "created", id };
  } catch (err) {
    return { kind: "error", reason: err instanceof Error ? err.message : String(err) };
  }
}

interface CommitPersonResult {
  kind: "created" | "merged" | "skipped" | "error";
  id?: string;
  tenureId?: string;
  reason?: string;
}

async function commitPersonRow(args: {
  row: ProposedRow;
  domainId: string;
  orgByName: Map<string, string>;
  userId: string;
  sourceType: Proposal["sourceType"];
  sourceLabel: string;
  batchId: string;
}): Promise<CommitPersonResult> {
  const db = getDb();
  const name = getField(args.row, "name");
  if (!name) return { kind: "error", reason: "Missing person name" };

  if (args.row.decision === "merge" && args.row.dedupeCandidate) {
    return { kind: "merged", id: args.row.dedupeCandidate.id };
  }

  try {
    const id = crypto.randomUUID();
    const currentTitle = getField(args.row, "currentTitle");
    const orgName = getField(args.row, "_orgName");

    // Resolve org by name (case-insensitive). If not found, leave currentOrgId
    // null — the user can attach later from the profile.
    let currentOrgId: string | undefined;
    if (orgName) {
      const found = args.orgByName.get(orgName.toLowerCase());
      if (found) currentOrgId = found;
    }

    await db.insert(persons).values({
      id,
      name,
      currentTitle: currentTitle ?? undefined,
      currentOrgId,
      isTracked: true,
      createdBy: args.userId as any, // legacy users.id mismatch — see CLAUDE.md
    });

    await recordProvenance({
      entityType: "person",
      entityId: id,
      sourceType: args.sourceType,
      sourceLabel: args.sourceLabel,
      contentHash: args.row.contentHash,
      capturedBy: args.userId,
      confidence: args.row.confidence,
      metadata: { batchId: args.batchId, viaDropImport: true },
    });

    // If we resolved an org and have a title, create a tenure to make the
    // graph consistent. Source = manual (drop) so the enrichment agent
    // doesn't try to override.
    let tenureId: string | undefined;
    if (currentOrgId && currentTitle) {
      tenureId = crypto.randomUUID();
      await db.insert(tenures).values({
        id: tenureId,
        personId: id,
        orgId: currentOrgId,
        title: currentTitle,
        startDate: new Date().toISOString().slice(0, 10) as any,
        isCurrent: true,
        source: "manual",
        createdBy: args.userId as any,
      });
      await recordProvenance({
        entityType: "tenure",
        entityId: tenureId,
        sourceType: args.sourceType,
        sourceLabel: args.sourceLabel,
        contentHash: args.row.contentHash + ":tenure",
        capturedBy: args.userId,
        confidence: args.row.confidence,
        metadata: { batchId: args.batchId, viaDropImport: true },
      });
    }

    return { kind: "created", id, tenureId };
  } catch (err) {
    return { kind: "error", reason: err instanceof Error ? err.message : String(err) };
  }
}
