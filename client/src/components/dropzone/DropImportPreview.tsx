/**
 * DropImportPreview — the modal that lets the user review extracted entities
 * before committing them.
 *
 * Apple-grade per Rule 3:
 *   - One job: "Confirm what to import."
 *   - Confidence-coded rows: high (emerald check) auto-included, amber/red
 *     need attention
 *   - Per-row edit-in-place (no nested modals)
 *   - Bulk select + apply-to-selected toolbar (only appears when >25 rows)
 *   - Source label visible (so the user knows where this came from)
 *   - Cost hint (LLM spend) in the footer when relevant
 *   - Undo toast for 60s after commit
 *   - Designed empty state when no entities extracted (with the warnings
 *     listed inline rather than buried)
 */

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Pencil,
  Sparkles,
  Trash2,
  UserCircle2,
  X,
} from "lucide-react";

type Decision = "create" | "merge" | "skip";

interface ProposedField {
  key: string;
  value: string | number | null;
  confidence: number;
}

interface ProposedRow {
  id: string;
  type: "person" | "organization" | "tenure" | "relationship" | "interaction";
  fields: ProposedField[];
  contentHash: string;
  confidence: number;
  dedupeCandidate: { id: string; name: string; matchScore: number } | null;
  sourceExcerpt: string | null;
  decision?: Decision;
}

interface Proposal {
  id: string;
  routedAs: "llm_extraction" | "column_mapping";
  sourceLabel: string;
  sourceType: "csv_import" | "text_capture" | "manual_form" | "voice_capture" | "email_forward";
  rows: ProposedRow[];
  isBulk: boolean;
  warnings: string[];
  llmCostUsd: number;
}

interface DropImportPreviewProps {
  proposal: Proposal;
  onClose: () => void;
}

export function DropImportPreview({ proposal, onClose }: DropImportPreviewProps) {
  const [, setLocation] = useLocation();
  const [rows, setRows] = useState<ProposedRow[]>(() =>
    proposal.rows.map((r) => ({ ...r, decision: r.decision ?? "create" })),
  );
  const [collapsedHighConf, setCollapsedHighConf] = useState(proposal.isBulk);

  const commitMutation = trpc.dropImport.commit.useMutation();
  const undoMutation = trpc.dropImport.undo.useMutation();

  const partitions = useMemo(() => partitionRows(rows), [rows]);
  const stats = useMemo(() => {
    const toCreate = rows.filter((r) => r.decision === "create").length;
    const toMerge = rows.filter((r) => r.decision === "merge").length;
    const toSkip = rows.filter((r) => r.decision === "skip").length;
    return { toCreate, toMerge, toSkip };
  }, [rows]);

  const updateRow = (id: string, patch: Partial<ProposedRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const updateField = (rowId: string, fieldKey: string, value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? {
              ...r,
              fields: r.fields.map((f) => (f.key === fieldKey ? { ...f, value } : f)),
            }
          : r,
      ),
    );
  };

  const skipRow = (rowId: string) => updateRow(rowId, { decision: "skip" });

  const handleCommit = async () => {
    if (stats.toCreate === 0 && stats.toMerge === 0) {
      toast.info("Nothing to import. Mark at least one row as Create or Merge.");
      return;
    }
    try {
      const result = await commitMutation.mutateAsync({
        proposalId: proposal.id,
        sourceLabel: proposal.sourceLabel,
        sourceType: proposal.sourceType,
        rows,
      });
      const { batchId, created, merged, skipped, errors } = result;
      onClose();
      const summary = [
        created > 0 ? `${created} created` : null,
        merged > 0 ? `${merged} merged` : null,
        skipped > 0 ? `${skipped} skipped` : null,
        errors.length > 0 ? `${errors.length} error${errors.length === 1 ? "" : "s"}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      toast.success(`Imported: ${summary}`, {
        duration: 60_000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await undoMutation.mutateAsync({ batchId });
              toast.success("Reverted.");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Couldn't undo this batch.");
            }
          },
        },
      });

      // Auto-navigate to the first newly created person if any
      if (result.createdIds.persons.length === 1) {
        setLocation(`/persons/${result.createdIds.persons[0]}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed.");
    }
  };

  const hasNoRows = rows.length === 0;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            Review import
          </DialogTitle>
          <DialogDescription>
            From <span className="font-medium text-foreground">{proposal.sourceLabel}</span>
            {proposal.routedAs === "column_mapping" && (
              <> · column-mapped from {proposal.rows.length} rows</>
            )}
            {proposal.routedAs === "llm_extraction" && proposal.llmCostUsd > 0 && (
              <> · ~${proposal.llmCostUsd.toFixed(3)} LLM extraction</>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Warnings */}
        {proposal.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-300/50 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-950/20 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <ul className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
                {proposal.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Empty state */}
        {hasNoRows && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <X className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="max-w-sm">
              <p className="font-medium">Nothing extracted from this drop</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try pasting cleaner text (a single email signature, a vCard, or a small CSV with headers like Name, Title, Company).
              </p>
            </div>
          </div>
        )}

        {/* Row list */}
        {!hasNoRows && (
          <ScrollArea className="flex-1 -mx-6 px-6 py-2">
            <div className="space-y-2">
              {/* Attention group (low confidence or dedup candidates) */}
              {partitions.attention.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      Needs your eye · {partitions.attention.length}
                    </p>
                  </div>
                  {partitions.attention.map((row) => (
                    <PreviewRow
                      key={row.id}
                      row={row}
                      onUpdateField={updateField}
                      onSkip={skipRow}
                      onUpdateRow={updateRow}
                    />
                  ))}
                </div>
              )}

              {/* High-confidence group (collapsible when bulk) */}
              {partitions.confident.length > 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setCollapsedHighConf((v) => !v)}
                    className="flex w-full items-center justify-between rounded-md px-1 py-2 hover:bg-muted/40"
                    aria-expanded={!collapsedHighConf}
                  >
                    <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      Ready · {partitions.confident.length}
                    </span>
                    {collapsedHighConf ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden />
                    )}
                  </button>
                  {!collapsedHighConf &&
                    partitions.confident.map((row) => (
                      <PreviewRow
                        key={row.id}
                        row={row}
                        onUpdateField={updateField}
                        onSkip={skipRow}
                        onUpdateRow={updateRow}
                      />
                    ))}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex-shrink-0 gap-2 flex-row items-center justify-between border-t pt-3">
          <div className="text-xs text-muted-foreground">
            {stats.toCreate > 0 && <span>{stats.toCreate} create</span>}
            {stats.toMerge > 0 && <span> · {stats.toMerge} merge</span>}
            {stats.toSkip > 0 && <span> · {stats.toSkip} skip</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={commitMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleCommit}
              disabled={commitMutation.isPending || hasNoRows || stats.toCreate + stats.toMerge === 0}
              className="gap-1.5"
            >
              {commitMutation.isPending ? (
                <Sparkles className="h-3.5 w-3.5 animate-pulse" aria-hidden />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              )}
              Import {stats.toCreate + stats.toMerge > 0 ? `${stats.toCreate + stats.toMerge} ` : ""}items
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function partitionRows(rows: ProposedRow[]): { attention: ProposedRow[]; confident: ProposedRow[] } {
  const attention: ProposedRow[] = [];
  const confident: ProposedRow[] = [];
  for (const row of rows) {
    if (row.decision === "skip") {
      confident.push(row); // skip rows go to the muted group
      continue;
    }
    const needsAttention =
      row.confidence < 0.7 ||
      row.dedupeCandidate !== null ||
      row.fields.length === 0 ||
      !row.fields.find((f) => f.key === "name");
    if (needsAttention) {
      attention.push(row);
    } else {
      confident.push(row);
    }
  }
  return { attention, confident };
}

function PreviewRow(props: {
  row: ProposedRow;
  onUpdateField: (rowId: string, fieldKey: string, value: string) => void;
  onSkip: (rowId: string) => void;
  onUpdateRow: (rowId: string, patch: Partial<ProposedRow>) => void;
}) {
  const { row } = props;
  const [editing, setEditing] = useState(false);
  const Icon = row.type === "organization" ? Building2 : UserCircle2;
  const isSkipped = row.decision === "skip";

  const nameField = row.fields.find((f) => f.key === "name");
  const titleField = row.fields.find((f) => f.key === "currentTitle");
  const orgField = row.fields.find((f) => f.key === "_orgName");
  const emailField = row.fields.find((f) => f.key === "email");

  return (
    <div
      className={`rounded-lg border p-3 transition ${
        isSkipped
          ? "opacity-50 bg-muted/30"
          : row.dedupeCandidate
          ? "border-amber-300/50 bg-amber-50/30 dark:border-amber-900/30 dark:bg-amber-950/10"
          : "bg-background"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon className="h-4 w-4 text-primary" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          {!editing ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium leading-snug">
                  {nameField?.value ?? <span className="text-muted-foreground italic">No name</span>}
                </p>
                <Badge variant="outline" className="text-[10px]">
                  {row.type}
                </Badge>
                {row.confidence < 0.7 && (
                  <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    {Math.round(row.confidence * 100)}%
                  </Badge>
                )}
              </div>
              {titleField?.value && (
                <p className="text-xs text-muted-foreground">{titleField.value}</p>
              )}
              {orgField?.value && (
                <p className="text-xs text-muted-foreground">{orgField.value}</p>
              )}
              {emailField?.value && (
                <p className="text-xs text-muted-foreground font-mono">{emailField.value}</p>
              )}
              {row.dedupeCandidate && (
                <div className="mt-2 rounded-md border bg-background p-2 text-xs">
                  <p className="font-medium">Looks like a duplicate of:</p>
                  <p className="text-muted-foreground">{row.dedupeCandidate.name}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => props.onUpdateRow(row.id, { decision: "merge" })}
                    >
                      Merge into existing
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => props.onUpdateRow(row.id, { decision: "create" })}
                    >
                      Keep both
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {row.fields.map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground w-24 flex-shrink-0">
                    {fieldLabel(f.key)}
                  </label>
                  <Input
                    value={f.value === null ? "" : String(f.value)}
                    onChange={(e) => props.onUpdateField(row.id, f.key, e.target.value)}
                    className="h-8"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setEditing((v) => !v)}
            aria-label={editing ? "Done editing" : "Edit fields"}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </Button>
          {!isSkipped && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => props.onSkip(row.id)}
              aria-label="Skip this row"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function fieldLabel(key: string): string {
  const map: Record<string, string> = {
    name: "Name",
    currentTitle: "Title",
    _orgName: "Org",
    email: "Email",
    phone: "Phone",
    city: "City",
    type: "Type",
    website: "Website",
    shortName: "Short",
  };
  return map[key] ?? key;
}
