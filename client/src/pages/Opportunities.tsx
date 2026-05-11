/**
 * Opportunities page — list of business initiatives with stage filter chips.
 *
 * Per Rule 3 #1, one job: "what initiatives am I moving and where are they
 * stuck?" The list is grouped by stage (visual kanban-lite) with momentum
 * indicators. Click a card to drill into the opportunity (full detail page
 * is a future polish — this surface focuses on the at-a-glance status).
 *
 * Empty state guides the user to create their first opportunity via the
 * command box ("Got the LOI from SBI for the lending partnership").
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/PageHeader";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Briefcase,
  CheckCircle2,
  Eye,
  Lightbulb,
  Map,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";

type Stage = "identify" | "map" | "approach" | "engage" | "close" | "maintain" | "lost";

const STAGE_META: Record<Stage, { label: string; tone: string; icon: typeof Lightbulb }> = {
  identify: { label: "Identify", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: Lightbulb },
  map: { label: "Map", tone: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300", icon: Map },
  approach: { label: "Approach", tone: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", icon: ArrowUpCircle },
  engage: { label: "Engage", tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", icon: Briefcase },
  close: { label: "Close", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle2 },
  maintain: { label: "Maintain", tone: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300", icon: RefreshCw },
  lost: { label: "Lost", tone: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300", icon: XCircle },
};

const STAGE_ORDER: Stage[] = ["identify", "map", "approach", "engage", "close", "maintain", "lost"];

function relativeDays(value: string | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  const days = Math.round((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return `${Math.round(days / 30)}mo ago`;
}

function momentumTone(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-muted-foreground";
  return "text-amber-600 dark:text-amber-400";
}

export default function OpportunitiesPage() {
  const [, setLocation] = useLocation();
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  const [includeArchived, setIncludeArchived] = useState(false);

  const listQuery = trpc.opportunities.list.useQuery({
    page: 1,
    pageSize: 100,
    sortOrder: "desc",
    isArchived: includeArchived ? undefined : false,
    stage: stageFilter === "all" ? undefined : stageFilter,
  });

  const opps = listQuery.data?.data ?? [];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Opportunities"
        subtitle="Business initiatives moving through the pipeline. Use the command box on Today to update stages."
      />

      <nav aria-label="Stage filter" className="flex flex-wrap gap-2">
        <Button
          variant={stageFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setStageFilter("all")}
          className="h-9"
        >
          All ({opps.length})
        </Button>
        {STAGE_ORDER.map((s) => {
          const count = opps.filter((o) => o.stage === s).length;
          const meta = STAGE_META[s];
          const Icon = meta.icon;
          return (
            <Button
              key={s}
              variant={stageFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStageFilter(s)}
              className="h-9 gap-1.5"
              aria-pressed={stageFilter === s}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {meta.label}
              {count > 0 && <span className="text-xs opacity-70">{count}</span>}
            </Button>
          );
        })}
      </nav>

      {listQuery.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : opps.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {opps.map((o) => (
            <OpportunityCard key={o.id} opp={o as any} />
          ))}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ opp }: { opp: {
  id: string;
  name: string;
  description: string | null;
  stage: string;
  ownerName: string | null;
  visibilityScope: string;
  momentumScore: number;
  targetCloseDate: string | null;
  lastStageChangeAt: string | Date;
  lastActivityAt: string | Date;
  isArchived: boolean;
} }) {
  const [, setLocation] = useLocation();
  const stage = (opp.stage as Stage) ?? "identify";
  const meta = STAGE_META[stage] ?? STAGE_META.identify;
  const Icon = meta.icon;
  const isStaleStage = (() => {
    const days = Math.round((Date.now() - new Date(opp.lastStageChangeAt).getTime()) / 86400000);
    return days > 30 && stage !== "maintain" && stage !== "lost";
  })();

  return (
    <Card
      onClick={() => setLocation(`/opportunities/${opp.id}`)}
      className={`cursor-pointer transition hover:border-primary/30 hover:shadow-sm ${opp.isArchived ? "opacity-60" : ""}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLocation(`/opportunities/${opp.id}`); } }}
      aria-label={`Open ${opp.name}`}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold leading-snug">{opp.name}</h3>
          <Badge className={`flex-shrink-0 gap-1 font-normal ${meta.tone}`}>
            <Icon className="h-3 w-3" aria-hidden />
            {meta.label}
          </Badge>
        </div>

        {opp.description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{opp.description}</p>
        )}

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Owner: <span className="font-medium text-foreground">{opp.ownerName ?? "Unassigned"}</span>
          </span>
          <span title={`Stage changed ${relativeDays(opp.lastStageChangeAt)}`}>
            {relativeDays(opp.lastActivityAt)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${
                  opp.momentumScore >= 70
                    ? "bg-emerald-500"
                    : opp.momentumScore >= 40
                    ? "bg-primary"
                    : "bg-amber-400"
                }`}
                style={{ width: `${opp.momentumScore}%` }}
                role="progressbar"
                aria-valuenow={opp.momentumScore}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Momentum"
              />
            </div>
          </div>
          <span className={`text-xs font-mono tabular-nums ${momentumTone(opp.momentumScore)}`}>
            {opp.momentumScore}
          </span>
        </div>

        {isStaleStage && (
          <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <Sparkles className="h-3 w-3" aria-hidden />
            Stuck at {meta.label} for over a month — try the command box: "We got the LOI from {opp.name}".
          </div>
        )}

        {opp.visibilityScope !== "team" && (
          <Badge variant="outline" className="text-xs gap-1">
            <Eye className="h-3 w-3" aria-hidden />
            {opp.visibilityScope === "private" ? "Private" : "Org-wide"}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Briefcase className="h-5 w-5 text-primary" aria-hidden />
        </div>
        <div className="max-w-md">
          <p className="font-medium">No opportunities yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the command box on Today: <span className="font-medium text-foreground">"Got the LOI from SBI for the lending partnership"</span>.
            RelGraph will create the opportunity and move it through stages as you log updates.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
