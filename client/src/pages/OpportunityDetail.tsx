/**
 * OpportunityDetail — drill-in surface for a single opportunity.
 *
 * One job (Rule 3 #1): "What's the state of this opportunity and what do
 * I need to do next?"
 *
 * Layout (top to bottom):
 *   1. Header — name, stage badge, owner, visibility
 *   2. Stage transitions — interactive state machine with allowed moves
 *      only (Rule 3 #4: direct manipulation; the only modal is the
 *      confirmation on "lost")
 *   3. Description (inline editable)
 *   4. Momentum slider (0-100, semantic colors)
 *   5. Linked entities — person/org/interaction with one-tap unlink
 *   6. Provenance for the opportunity itself
 *
 * Apple-grade:
 *   - Optimistic stage transitions with rollback toast on failure
 *   - AlertDialog only for `lost` (genuinely destructive)
 *   - Empty links state ("No people or orgs linked yet — link from
 *     a person's profile or via the command box")
 *   - Light + dark designed throughout
 *   - aria-labels on every action
 */

import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProvenanceChip } from "@/components/provenance/ProvenanceChip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpCircle,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  Eye,
  Lightbulb,
  Map,
  MessageSquare,
  RefreshCw,
  UserCircle2,
  XCircle,
} from "lucide-react";

type Stage = "identify" | "map" | "approach" | "engage" | "close" | "maintain" | "lost";

const STAGE_ORDER: Stage[] = ["identify", "map", "approach", "engage", "close", "maintain", "lost"];

const STAGE_META: Record<Stage, { label: string; tone: string; icon: typeof Lightbulb; description: string }> = {
  identify: { label: "Identify", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: Lightbulb, description: "Spotted the opportunity; haven't mapped the people yet." },
  map: { label: "Map", tone: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300", icon: Map, description: "Working out who's involved and what the path looks like." },
  approach: { label: "Approach", tone: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", icon: ArrowUpCircle, description: "First outreach in motion." },
  engage: { label: "Engage", tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", icon: Briefcase, description: "Active conversations with decision-makers." },
  close: { label: "Close", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle2, description: "Deal sealed; commitments in writing." },
  maintain: { label: "Maintain", tone: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300", icon: RefreshCw, description: "Ongoing relationship; protect and deepen." },
  lost: { label: "Lost", tone: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300", icon: XCircle, description: "No longer pursuing; can be re-opened to Identify if needed." },
};

const STAGE_TRANSITIONS: Record<Stage, Stage[]> = {
  identify: ["map", "lost"],
  map: ["identify", "approach", "lost"],
  approach: ["map", "engage", "lost"],
  engage: ["approach", "close", "lost"],
  close: ["engage", "maintain", "lost"],
  maintain: ["close", "lost"],
  lost: ["identify"],
};

function momentumTone(score: number): string {
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-muted-foreground";
  return "text-amber-600 dark:text-amber-400";
}

function relativeDays(value: string | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  const days = Math.round((Date.now() - d.getTime()) / 86400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function OpportunityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [confirmLost, setConfirmLost] = useState(false);
  const [pendingLostNote, setPendingLostNote] = useState("");

  const query = trpc.opportunities.getById.useQuery({ id: id ?? "" }, { enabled: !!id });

  const transitionMutation = trpc.opportunities.transitionStage.useMutation({
    onMutate: async (input) => {
      await utils.opportunities.getById.cancel({ id: input.id });
      const prev = utils.opportunities.getById.getData({ id: input.id });
      if (prev) {
        utils.opportunities.getById.setData({ id: input.id }, {
          ...prev,
          opportunity: { ...prev.opportunity, stage: input.toStage },
        });
      }
      return { prev };
    },
    onSuccess: (_data, input) => {
      toast.success(`Moved to ${STAGE_META[input.toStage as Stage]?.label ?? input.toStage}`);
      utils.opportunities.getById.invalidate({ id: input.id });
      utils.opportunities.list.invalidate();
    },
    onError: (err, input, ctx) => {
      if (ctx?.prev) utils.opportunities.getById.setData({ id: input.id }, ctx.prev);
      toast.error(err.message || "Couldn't change the stage. Try again.");
    },
  });

  const unlinkMutation = trpc.opportunities.unlink.useMutation({
    onSuccess: () => {
      toast.success("Link removed");
      utils.opportunities.getById.invalidate({ id: id ?? "" });
    },
    onError: (err) => toast.error(err.message),
  });

  if (!id) return null;

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-12">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 pb-12">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/opportunities")} className="gap-1">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Opportunities
        </Button>
        <Card className="border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
          <CardContent className="p-6">
            <p className="font-medium">Couldn't load this opportunity</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {query.error?.message ?? "It may have been deleted or moved out of your visibility scope."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { opportunity, links } = query.data;
  const stage = (opportunity.stage as Stage) ?? "identify";
  const meta = STAGE_META[stage];
  const StageIcon = meta.icon;
  const allowedTransitions = STAGE_TRANSITIONS[stage] ?? [];
  const isMutating = transitionMutation.isPending;

  const handleTransition = (toStage: Stage) => {
    if (toStage === "lost") {
      setConfirmLost(true);
      return;
    }
    transitionMutation.mutate({ id: opportunity.id, toStage });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/opportunities")} className="-ml-2 h-9 gap-1">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Opportunities
      </Button>

      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-start gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold tracking-tight">{opportunity.name}</h1>
          <Badge className={`gap-1 ${meta.tone}`}>
            <StageIcon className="h-3 w-3" aria-hidden />
            {meta.label}
          </Badge>
          <ProvenanceChip entityType="opportunity" entityId={opportunity.id} />
        </div>
        {opportunity.description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{opportunity.description}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <UserCircle2 className="h-3.5 w-3.5" aria-hidden />
            Owner: <span className="font-medium text-foreground">{opportunity.ownerId ?? "Unassigned"}</span>
          </span>
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" aria-hidden />
            {opportunity.visibilityScope}
          </span>
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            Stage changed {relativeDays(opportunity.lastStageChangeAt)}
          </span>
        </div>
      </header>

      {/* Stage transition controls */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Stage</h2>
          <span className="text-xs text-muted-foreground">{meta.description}</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {allowedTransitions.map((next) => {
            const m = STAGE_META[next];
            const Icon = m.icon;
            return (
              <Button
                key={next}
                variant={next === "lost" ? "outline" : "default"}
                size="sm"
                onClick={() => handleTransition(next)}
                disabled={isMutating}
                className={`h-10 gap-1.5 ${next === "lost" ? "border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/30 dark:text-rose-300 dark:hover:bg-rose-950/20" : ""}`}
                aria-label={`Move to ${m.label}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                Move to {m.label}
                {next !== "lost" && <ArrowRight className="h-3 w-3 opacity-60" aria-hidden />}
              </Button>
            );
          })}
        </div>

        {/* Visual journey */}
        <div className="flex items-center gap-1 overflow-x-auto pt-2">
          {STAGE_ORDER.filter((s) => s !== "lost").map((s, i) => {
            const m = STAGE_META[s];
            const isPast = STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(s) && stage !== "lost";
            const isCurrent = stage === s;
            return (
              <div key={s} className="flex items-center gap-1 flex-shrink-0">
                <Badge
                  variant="outline"
                  className={`gap-1 text-[10px] ${
                    isCurrent ? m.tone : isPast ? "opacity-60" : "opacity-30"
                  }`}
                >
                  {m.label}
                </Badge>
                {i < STAGE_ORDER.filter((s) => s !== "lost").length - 1 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Momentum */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Momentum</h2>
          <span className={`text-sm font-mono tabular-nums ${momentumTone(opportunity.momentumScore)}`}>
            {opportunity.momentumScore}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${
              opportunity.momentumScore >= 70
                ? "bg-emerald-500"
                : opportunity.momentumScore >= 40
                ? "bg-primary"
                : "bg-amber-400"
            }`}
            style={{ width: `${opportunity.momentumScore}%` }}
            role="progressbar"
            aria-valuenow={opportunity.momentumScore}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Momentum"
          />
        </div>
      </section>

      {/* Linked entities */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Linked</h2>
          <span className="text-xs text-muted-foreground">{links.length}</span>
        </div>

        {links.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <p className="text-sm text-muted-foreground">
                No people or organizations linked yet.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Link from a person's profile or use the command box: <span className="font-medium text-foreground">"Met Rajesh at HDFC about the {opportunity.name}"</span>.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {links.map((link) => {
              const Icon = link.targetType === "person" ? UserCircle2 : link.targetType === "organization" ? Building2 : MessageSquare;
              return (
                <Card key={link.id} className="transition hover:border-primary/30">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{link.targetLabel}</p>
                      <p className="text-xs text-muted-foreground">
                        {link.targetType}
                        {link.role && ` · ${link.role}`}
                      </p>
                      {link.note && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{link.note}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => unlinkMutation.mutate({ id: link.id })}
                      disabled={unlinkMutation.isPending}
                      className="h-8 text-xs text-muted-foreground hover:text-destructive"
                      aria-label={`Unlink ${link.targetLabel}`}
                    >
                      Unlink
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Lost confirmation dialog */}
      <AlertDialog open={confirmLost} onOpenChange={(open) => { setConfirmLost(open); if (!open) setPendingLostNote(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark "{opportunity.name}" as lost?</AlertDialogTitle>
            <AlertDialogDescription>
              This stops momentum tracking and removes it from active opportunity views. You can re-open it later by transitioning back to Identify. The reason will be logged in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-2">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reason (optional)
            </label>
            <textarea
              value={pendingLostNote}
              onChange={(e) => setPendingLostNote(e.target.value)}
              placeholder="e.g. Decision postponed indefinitely after Q3 budget freeze"
              className="mt-1 min-h-[80px] w-full resize-none rounded-md border bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep pursuing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                transitionMutation.mutate({
                  id: opportunity.id,
                  toStage: "lost",
                  note: pendingLostNote.trim() || undefined,
                });
                setConfirmLost(false);
                setPendingLostNote("");
              }}
            >
              Mark as lost
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
