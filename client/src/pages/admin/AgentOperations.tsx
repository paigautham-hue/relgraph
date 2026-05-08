/**
 * Agent Operations — admin page for managing the 10 background agents.
 *
 * One job per surface (Rule 3): "configure and observe agents." Two stacked
 * sections: schedules (top) and recent runs (bottom). Edits use inline,
 * optimistic UI with toast confirmations. Errors explain what + why + next.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Clock,
  DollarSign,
  Play,
  RefreshCw,
  Skull,
  Sparkles,
  Zap,
} from "lucide-react";

type ScheduleRow = {
  id: string;
  agentId: string;
  agentName: string;
  agentDisplayName: string;
  agentDescription: string | null;
  isUserScoped: boolean;
  isEventDriven: boolean;
  preferredModel: string | null;
  cronExpression: string;
  cronDescription: string;
  isEnabled: boolean;
  isDryRun: boolean;
  monthlyTokenCapUsd: number | null;
  monthlyTokensUsedUsd: number;
  monthlyWindowStart: string | Date;
  lastRunAt: string | Date | null;
  nextRunAt: string | Date | null;
};

function formatRelative(value: string | Date | null): string {
  if (!value) return "never";
  const d = new Date(value);
  const diffMs = d.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const past = diffMs < 0;
  const minutes = Math.round(absMs / 60_000);
  if (minutes < 1) return past ? "just now" : "any moment";
  if (minutes < 60) return past ? `${minutes}m ago` : `in ${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return past ? `${days}d ago` : `in ${days}d`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatAbsolute(value: string | Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }) + " IST";
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function statusBadge(status: string): { label: string; tone: string; icon: typeof CheckCircle2 } {
  switch (status) {
    case "completed":
      return { label: "Completed", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300", icon: CheckCircle2 };
    case "running":
      return { label: "Running", tone: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300", icon: Activity };
    case "failed":
      return { label: "Failed", tone: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", icon: AlertCircle };
    case "skipped":
      return { label: "Skipped", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: ChevronDown };
    case "budget_exhausted":
      return { label: "Budget hit", tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300", icon: Skull };
    case "dry_run":
      return { label: "Dry run", tone: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300", icon: Sparkles };
    case "queued":
      return { label: "Queued", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: Clock };
    default:
      return { label: status, tone: "bg-muted text-muted-foreground", icon: ChevronDown };
  }
}

export default function AgentOperations() {
  const utils = trpc.useUtils();
  const schedulesQuery = trpc.agents.listSchedules.useQuery();
  const runsQuery = trpc.agents.listRuns.useQuery({ page: 1, pageSize: 25, sortOrder: "desc" });

  // Optimistic update: when an admin toggles enable/dryRun or saves cron/cap,
  // mutate the cached list immediately so the UI feels instant. Roll back on
  // failure (toast.error). This satisfies Rule 3 #6 (Optimistic UI).
  const updateMutation = trpc.agents.updateSchedule.useMutation({
    onMutate: async (input) => {
      await utils.agents.listSchedules.cancel();
      const prev = utils.agents.listSchedules.getData();
      if (prev) {
        utils.agents.listSchedules.setData(undefined, (old) =>
          old?.map((row) =>
            row.id === input.id
              ? {
                  ...row,
                  ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
                  ...(input.isDryRun !== undefined ? { isDryRun: input.isDryRun } : {}),
                  ...(input.cronExpression !== undefined ? { cronExpression: input.cronExpression } : {}),
                  ...(input.monthlyTokenCapUsd !== undefined
                    ? { monthlyTokenCapUsd: input.monthlyTokenCapUsd ?? null }
                    : {}),
                }
              : row,
          ),
        );
      }
      return { prev };
    },
    onSuccess: () => {
      toast.success("Schedule updated");
      utils.agents.listSchedules.invalidate();
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) {
        utils.agents.listSchedules.setData(undefined, ctx.prev);
      }
      toast.error(err.message || "Could not save the schedule. Try again or check the cron format.");
    },
  });
  const runNowMutation = trpc.agents.runNow.useMutation({
    onSuccess: () => {
      toast.success("Run dispatched. Refresh in a moment to see status.");
      setTimeout(() => utils.agents.listRuns.invalidate(), 1500);
    },
    onError: err => {
      toast.error(err.message || "Could not start the run. Verify the agent has an active schedule.");
    },
  });
  const resetMutation = trpc.agents.resetMonthlyUsage.useMutation({
    onSuccess: () => {
      toast.success("Monthly usage reset to $0");
      utils.agents.listSchedules.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        title="Agent Operations"
        subtitle="Configure and observe the 10 background agents that ingest data, detect changes, and brief users."
      />

      <SchedulesSection
        loading={schedulesQuery.isLoading}
        rows={schedulesQuery.data ?? []}
        onUpdate={(input) => updateMutation.mutate(input)}
        onRunNow={(agentId, isDryRun) => runNowMutation.mutate({ agentId, isDryRun })}
        onResetUsage={(id) => resetMutation.mutate({ id })}
        isMutating={updateMutation.isPending || runNowMutation.isPending || resetMutation.isPending}
      />

      <RunsSection loading={runsQuery.isLoading} runs={runsQuery.data?.data ?? []} onRefresh={() => runsQuery.refetch()} />
    </div>
  );
}

// ─── Schedules section ───────────────────────────────────────────────────────

function SchedulesSection(props: {
  loading: boolean;
  rows: ScheduleRow[];
  onUpdate: (input: {
    id: string;
    cronExpression?: string;
    isEnabled?: boolean;
    isDryRun?: boolean;
    monthlyTokenCapUsd?: number | null;
  }) => void;
  onRunNow: (agentId: string, isDryRun: boolean) => void;
  onResetUsage: (id: string) => void;
  isMutating: boolean;
}) {
  if (props.loading) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Schedules</h2>
        <div className="grid gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (props.rows.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">Schedules</h2>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Bot className="h-10 w-10 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">No agent schedules yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                The registry sync runs at server boot. Check the boot logs — if you see
                <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">[boot] Agent registry sync</code>
                followed by <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">N created</code>,
                schedules should appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Schedules</h2>
        <p className="text-sm text-muted-foreground">{props.rows.length} agents</p>
      </div>
      <div className="grid gap-3">
        {props.rows.map((row) => (
          <ScheduleCard
            key={row.id}
            row={row}
            onUpdate={props.onUpdate}
            onRunNow={props.onRunNow}
            onResetUsage={props.onResetUsage}
            isMutating={props.isMutating}
          />
        ))}
      </div>
    </section>
  );
}

function ScheduleCard(props: {
  row: ScheduleRow;
  onUpdate: (input: {
    id: string;
    cronExpression?: string;
    isEnabled?: boolean;
    isDryRun?: boolean;
    monthlyTokenCapUsd?: number | null;
  }) => void;
  onRunNow: (agentId: string, isDryRun: boolean) => void;
  onResetUsage: (id: string) => void;
  isMutating: boolean;
}) {
  const { row } = props;
  const [expanded, setExpanded] = useState(false);
  const [cronDraft, setCronDraft] = useState(row.cronExpression);
  const [capDraft, setCapDraft] = useState<string>(row.monthlyTokenCapUsd?.toString() ?? "");
  const [confirmReset, setConfirmReset] = useState(false);

  const usagePct = row.monthlyTokenCapUsd && row.monthlyTokenCapUsd > 0
    ? Math.min(100, Math.round((row.monthlyTokensUsedUsd / row.monthlyTokenCapUsd) * 100))
    : 0;
  const usageWarn = usagePct >= 80;
  const usageHit = usagePct >= 100;

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base font-semibold">{row.agentDisplayName}</CardTitle>
              {row.isEventDriven && (
                <Badge variant="secondary" className="gap-1">
                  <Zap className="h-3 w-3" aria-hidden />
                  Event-driven
                </Badge>
              )}
              {row.isUserScoped && (
                <Badge variant="secondary">Per-user</Badge>
              )}
              {row.isDryRun && (
                <Badge variant="outline" className="gap-1 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Dry run
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1 line-clamp-2">{row.agentDescription}</CardDescription>
          </div>
          <Switch
            checked={row.isEnabled}
            onCheckedChange={(v) => props.onUpdate({ id: row.id, isEnabled: v })}
            disabled={props.isMutating}
            aria-label={`${row.isEnabled ? "Disable" : "Enable"} ${row.agentDisplayName}`}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
          <Stat icon={Clock} label="Cadence" value={row.isEventDriven ? "On event" : row.cronDescription} />
          <Stat icon={Activity} label="Last run" value={formatRelative(row.lastRunAt)} title={formatAbsolute(row.lastRunAt)} />
          <Stat icon={Clock} label="Next run" value={row.isEventDriven ? "—" : formatRelative(row.nextRunAt)} title={row.isEventDriven ? "Event-driven" : formatAbsolute(row.nextRunAt)} />
          <Stat
            icon={DollarSign}
            label="Monthly usage"
            value={
              row.monthlyTokenCapUsd
                ? `${formatCost(row.monthlyTokensUsedUsd)} / ${formatCost(row.monthlyTokenCapUsd)}`
                : formatCost(row.monthlyTokensUsedUsd)
            }
            valueClassName={usageHit ? "text-amber-700 dark:text-amber-300 font-medium" : usageWarn ? "text-amber-600 dark:text-amber-400" : ""}
          />
        </div>

        {row.monthlyTokenCapUsd && row.monthlyTokenCapUsd > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all ${usageHit ? "bg-amber-500" : usageWarn ? "bg-amber-400" : "bg-primary"}`}
              style={{ width: `${usagePct}%` }}
              role="progressbar"
              aria-valuenow={usagePct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Monthly token usage: ${usagePct}%`}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={`schedule-details-${row.id}`}
            className="-ml-2 h-9 gap-1 px-2"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
            {expanded ? "Hide details" : "Show details"}
          </Button>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => props.onRunNow(row.agentId, true)}
                  disabled={props.isMutating}
                  className="h-9 gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Dry run
                </Button>
              </TooltipTrigger>
              <TooltipContent>Run once with no DB writes or LLM calls</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => props.onRunNow(row.agentId, false)}
                  disabled={props.isMutating || row.isEventDriven}
                  className="h-9 gap-1.5"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden />
                  Run now
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {row.isEventDriven
                  ? "Event-driven agents run on triggers, not manual invocation"
                  : "Trigger one immediate run"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {expanded && (
          <div id={`schedule-details-${row.id}`} className="space-y-4 rounded-xl border bg-muted/30 p-4 mt-2">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`cron-${row.id}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Cron expression (IST)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`cron-${row.id}`}
                    value={cronDraft}
                    onChange={(e) => setCronDraft(e.target.value)}
                    placeholder="minute hour dom month dow"
                    className="h-10 font-mono text-sm"
                    disabled={row.isEventDriven}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => props.onUpdate({ id: row.id, cronExpression: cronDraft })}
                    disabled={props.isMutating || cronDraft === row.cronExpression || row.isEventDriven}
                    className="h-10"
                  >
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {row.isEventDriven
                    ? "This agent runs on event triggers; cron is ignored."
                    : `Default: ${row.cronExpression}. Times are IST (UTC+5:30).`}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`cap-${row.id}`} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Monthly cap (USD)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`cap-${row.id}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="1"
                    value={capDraft}
                    onChange={(e) => setCapDraft(e.target.value)}
                    placeholder="No cap"
                    className="h-10"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const parsed = capDraft.trim() === "" ? null : Number(capDraft);
                      if (parsed !== null && (isNaN(parsed) || parsed < 0)) {
                        toast.error("Enter a non-negative number, or leave blank for no cap.");
                        return;
                      }
                      props.onUpdate({ id: row.id, monthlyTokenCapUsd: parsed });
                    }}
                    disabled={props.isMutating}
                    className="h-10"
                  >
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Auto-pauses the agent when reached. Resets on the monthly window roll-over.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
              <div className="min-w-0 flex-1">
                <Label htmlFor={`dryrun-${row.id}`} className="text-sm font-medium cursor-pointer">
                  Always dry-run
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Each scheduled run fetches and computes but skips DB writes and LLM calls.
                </p>
              </div>
              <Switch
                id={`dryrun-${row.id}`}
                checked={row.isDryRun}
                onCheckedChange={(v) => props.onUpdate({ id: row.id, isDryRun: v })}
                disabled={props.isMutating}
              />
            </div>

            {row.monthlyTokensUsedUsd > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3">
                <div>
                  <p className="text-sm font-medium">Reset monthly usage</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Window started {formatAbsolute(row.monthlyWindowStart)}. Current: {formatCost(row.monthlyTokensUsedUsd)}.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)} className="h-9 gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Reset
                </Button>
              </div>
            )}

            {row.preferredModel && (
              <p className="text-xs text-muted-foreground">
                Preferred model: <code className="rounded bg-muted px-1.5 py-0.5">{row.preferredModel}</code>
              </p>
            )}
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset monthly usage to $0?</AlertDialogTitle>
            <AlertDialogDescription>
              The current window started {formatAbsolute(row.monthlyWindowStart)}. After reset, the agent
              can spend up to its full cap (${row.monthlyTokenCapUsd ?? "no limit"}) again before the next
              auto-rollover. This is logged in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                props.onResetUsage(row.id);
                setConfirmReset(false);
              }}
            >
              Reset usage
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Stat(props: { icon: typeof Clock; label: string; value: string; title?: string; valueClassName?: string }) {
  const Icon = props.icon;
  return (
    <div title={props.title}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" aria-hidden />
        <span>{props.label}</span>
      </div>
      <div className={`mt-0.5 truncate font-medium ${props.valueClassName ?? ""}`}>{props.value}</div>
    </div>
  );
}

// ─── Runs section ────────────────────────────────────────────────────────────

type RunRow = {
  id: string;
  agentName: string;
  agentDisplayName: string;
  status: string;
  triggeredBy: string;
  triggeredByUserName: string | null;
  isDryRun: boolean;
  startedAt: string | Date | null;
  finishedAt: string | Date | null;
  durationMs: number | null;
  itemsProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  costUsd: number;
  modelUsed: string | null;
  errorMessage: string | null;
  createdAt: string | Date;
};

function RunsSection(props: { loading: boolean; runs: RunRow[]; onRefresh: () => void }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Recent runs</h2>
        <Button variant="ghost" size="sm" onClick={props.onRefresh} className="h-9 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Refresh
        </Button>
      </div>

      {props.loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : props.runs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Activity className="h-10 w-10 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">No runs yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Trigger one manually with <span className="font-medium">Run now</span> on any
                schedule above, or wait for a scheduled run to fire.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Trigger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.runs.map((run) => {
                const sb = statusBadge(run.status);
                const Icon = sb.icon;
                return (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">
                      <div>{run.agentDisplayName}</div>
                      {run.isDryRun && (
                        <div className="text-xs text-violet-600 dark:text-violet-400">dry run</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={`gap-1 font-normal ${sb.tone}`}>
                        <Icon className="h-3 w-3" aria-hidden />
                        {sb.label}
                      </Badge>
                      {run.errorMessage && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-1.5 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 cursor-help">
                              why?
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            <p className="font-medium text-xs mb-1">Error</p>
                            <p className="text-xs">{run.errorMessage}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell title={formatAbsolute(run.startedAt)}>
                      {formatRelative(run.startedAt)}
                    </TableCell>
                    <TableCell>{formatDuration(run.durationMs)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {run.itemsCreated > 0 && <span className="text-emerald-700 dark:text-emerald-400">+{run.itemsCreated} </span>}
                      {run.itemsUpdated > 0 && <span className="text-blue-700 dark:text-blue-400">~{run.itemsUpdated} </span>}
                      {run.itemsSkipped > 0 && <span className="text-muted-foreground">⊘{run.itemsSkipped} </span>}
                      {run.itemsProcessed === 0 && run.itemsCreated === 0 && "—"}
                    </TableCell>
                    <TableCell>{formatCost(run.costUsd)}</TableCell>
                    <TableCell className="text-sm">
                      {run.triggeredBy === "manual" ? (
                        <span>{run.triggeredByUserName ?? "Manual"}</span>
                      ) : (
                        <span className="text-muted-foreground">{run.triggeredBy}</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </div>
      )}
    </section>
  );
}
