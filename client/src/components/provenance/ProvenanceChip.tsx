/**
 * ProvenanceChip — discreet badge showing where a fact came from.
 *
 * Usage: drop next to any fact (a person's title, a tenure date, a relationship
 * edge). Tap reveals a popover with sources, captured-by, captured-at,
 * confidence, verified-by, expires-at — Rule 3 #2 made literal.
 *
 * The chip itself is small (a single icon + count). The detail surface only
 * appears on tap, so it doesn't compete with the data it annotates.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, AlertTriangle, ExternalLink, FileText, Mic, FileEdit, Globe } from "lucide-react";

type EntityType =
  | "person"
  | "organization"
  | "tenure"
  | "relationship"
  | "interaction"
  | "reflection"
  | "note"
  | "intel_field"
  | "opportunity"
  | "power_move";

interface ProvenanceChipProps {
  entityType: EntityType;
  entityId: string;
  /** Optional compact mode: shows only the icon, no count. */
  compact?: boolean;
  /** Override label when no provenance exists yet (defaults to "Source"). */
  emptyLabel?: string;
}

const SOURCE_TYPE_META: Record<string, { label: string; icon: typeof FileText }> = {
  voice_capture: { label: "Voice", icon: Mic },
  text_capture: { label: "Command box", icon: FileEdit },
  manual_form: { label: "Manual entry", icon: FileEdit },
  apify_scrape: { label: "Public scrape", icon: Globe },
  rbi_release: { label: "RBI release", icon: Globe },
  pib_release: { label: "PIB release", icon: Globe },
  mca21_filing: { label: "MCA21 filing", icon: Globe },
  sebi_order: { label: "SEBI order", icon: Globe },
  bse_filing: { label: "BSE filing", icon: Globe },
  nse_filing: { label: "NSE filing", icon: Globe },
  gazette_notification: { label: "Gazette", icon: Globe },
  annual_report: { label: "Annual report", icon: FileText },
  press_release: { label: "Press release", icon: Globe },
  email_forward: { label: "Email", icon: FileText },
  csv_import: { label: "Import", icon: FileText },
  ai_extraction: { label: "AI extracted", icon: ShieldCheck },
  team_member: { label: "Team", icon: FileEdit },
  system: { label: "System", icon: ShieldCheck },
  unknown: { label: "Unknown", icon: AlertTriangle },
};

function relativeTime(value: string | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  const days = Math.round((Date.now() - d.getTime()) / 86400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

function confidenceBadgeTone(c: number | null): string {
  if (c == null) return "bg-muted text-muted-foreground";
  if (c >= 0.85) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  if (c >= 0.6) return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  return "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
}

export function ProvenanceChip({ entityType, entityId, compact = false, emptyLabel = "Source" }: ProvenanceChipProps) {
  const [open, setOpen] = useState(false);

  const query = trpc.provenance.listForEntity.useQuery(
    { entityType, entityId },
    { enabled: open, staleTime: 30_000 },
  );

  const rows = query.data ?? [];
  const verifiedCount = rows.filter((r) => r.verifiedAt).length;
  const hasStale = rows.some((r) => r.isStale);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
            verifiedCount > 0 ? "border-emerald-200 dark:border-emerald-900/30" : "border-muted"
          }`}
          aria-label={`Provenance — ${rows.length || "see"} sources`}
        >
          {hasStale ? (
            <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden />
          ) : verifiedCount > 0 ? (
            <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : (
            <FileText className="h-3 w-3 text-muted-foreground" aria-hidden />
          )}
          {!compact && (
            <span className="text-muted-foreground">
              {query.isFetching ? "…" : query.data ? `${rows.length || emptyLabel}` : emptyLabel}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" sideOffset={6}>
        <div className="border-b px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Provenance</p>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {query.isLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground">No provenance recorded yet for this fact.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Future writes via the command box, voice, or ingestion agents will populate this trail.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((row) => {
                const meta = SOURCE_TYPE_META[row.sourceType] ?? SOURCE_TYPE_META.unknown;
                const Icon = meta.icon;
                return (
                  <div key={row.id} className="space-y-1.5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
                        <span className="text-sm font-medium">{meta.label}</span>
                      </div>
                      {row.confidence != null && (
                        <Badge className={`font-mono text-[10px] ${confidenceBadgeTone(row.confidence)}`}>
                          {Math.round(row.confidence * 100)}%
                        </Badge>
                      )}
                    </div>
                    {row.sourceLabel && (
                      <p className="text-xs text-foreground line-clamp-2">{row.sourceLabel}</p>
                    )}
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {row.capturedByName ? (
                          <>By {row.capturedByName}</>
                        ) : (
                          <>System-recorded</>
                        )}
                        {" · "}
                        {relativeTime(row.capturedAt)}
                      </span>
                      {row.verifiedByName && (
                        <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                          <ShieldCheck className="h-3 w-3" aria-hidden />
                          Verified
                        </span>
                      )}
                    </div>
                    {row.isStale && (
                      <div className="flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        Stale — past expiry; consider re-verifying
                      </div>
                    )}
                    {row.sourceUrl && (
                      <a
                        href={row.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden />
                        View source
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
