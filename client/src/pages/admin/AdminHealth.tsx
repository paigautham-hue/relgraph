/**
 * AdminHealth — operational observability for super-admins.
 *
 * One job (Rule 3 #1): "Is the system fine right now?"
 *
 * Shows the answer at a glance via a hero status pill, then breaks down
 * the contributing signals so a "not ok" state is immediately diagnosable.
 * Never exposes secret values — only presence.
 *
 * Sections:
 *   1. Overall status pill (green/amber/red)
 *   2. Runtime secrets (each as present/missing with purpose + severity)
 *   3. Database (connected + latency)
 *   4. Agent registry (X of 10) + schedules (enabled/dry-run breakdown)
 *   5. Apify sources (X of 7, Y active)
 *   6. Graph (persons + organizations counts — proves skeleton seed ran)
 *   7. Recent agent runs (status mix from last 10)
 *
 * Refreshable via a top-right button; auto-refreshes every 30s by default.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Globe,
  HeartPulse,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";

const REFRESH_MS = 30_000;

export default function AdminHealth() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const query = trpc.system.adminHealth.useQuery(undefined, {
    refetchInterval: autoRefresh ? REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });

  const data = query.data;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="System health"
        subtitle="Operational state at a glance. Refreshes every 30 seconds while this page is open."
      >
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Switch
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              aria-label="Auto-refresh every 30 seconds"
            />
            Auto-refresh
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </Button>
        </div>
      </PageHeader>

      {query.isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : !data ? (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
            <div>
              <p className="font-medium">Couldn't read health state</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {query.error?.message ?? "The health probe didn't return. Try Refresh — if it stays empty, check the server logs."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <OverallStatus ok={data.ok} generatedAt={data.generatedAt} probeMs={data.probeDurationMs ?? 0} />

          <div className="grid gap-4 md:grid-cols-2">
            <DatabaseCard db={data.db} graph={data.graph} />
            <RegistryCard registry={data.registry} schedules={data.schedules} />
            <ApifyCard apify={data.apify} />
            <SecretsCard secrets={data.secrets} />
          </div>

          <RecentRunsCard runs={data.recentRuns} />
        </>
      )}
    </div>
  );
}

// ─── Overall hero ──────────────────────────────────────────────────────────

function OverallStatus({ ok, generatedAt, probeMs }: { ok: boolean; generatedAt: string; probeMs: number }) {
  return (
    <Card className={ok ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/10" : "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10"}>
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${
            ok ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-amber-100 dark:bg-amber-900/30"
          }`}
        >
          {ok ? (
            <HeartPulse className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : (
            <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
          )}
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold">{ok ? "All systems green" : "Needs attention"}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {ok
              ? "Every critical secret is configured, the database is reachable, and the agent registry is intact."
              : "One or more critical signals are off — see the cards below for what to fix."}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Probed in {probeMs}ms</p>
          <p>{new Date(generatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Database + graph ─────────────────────────────────────────────────────

function DatabaseCard({
  db,
  graph,
}: {
  db: { ok: boolean; latencyMs: number | null; error: string | null };
  graph: { ok: boolean; persons: number; organizations: number };
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <SectionHeader icon={Database} label="Database" ok={db.ok && graph.ok} />
        <div className="grid gap-2 text-sm">
          <Stat label="Connected" value={db.ok ? "Yes" : "No"} tone={db.ok ? "ok" : "warn"} />
          {db.latencyMs !== null && (
            <Stat
              label="Probe latency"
              value={`${db.latencyMs} ms`}
              tone={db.latencyMs < 500 ? "ok" : db.latencyMs < 2000 ? "neutral" : "warn"}
            />
          )}
          <Stat label="Persons" value={graph.persons.toLocaleString()} tone="neutral" />
          <Stat label="Organizations" value={graph.organizations.toLocaleString()} tone="neutral" />
        </div>
        {!db.ok && db.error && (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            {db.error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Agent registry + schedules ────────────────────────────────────────────

function RegistryCard({
  registry,
  schedules,
}: {
  registry: { ok: boolean; total: number; enabled: number; expected: number };
  schedules: { ok: boolean; total: number; enabled: number; dryRun: number; expected: number };
}) {
  const registryOk = registry.ok && registry.total >= registry.expected;
  const schedulesOk = schedules.ok && schedules.total >= schedules.expected;
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <SectionHeader icon={Activity} label="Agents" ok={registryOk && schedulesOk} />
        <div className="grid gap-2 text-sm">
          <Stat
            label="Registry"
            value={`${registry.total} / ${registry.expected}`}
            tone={registryOk ? "ok" : "warn"}
          />
          <Stat
            label="Schedules"
            value={`${schedules.total} / ${schedules.expected}`}
            tone={schedulesOk ? "ok" : "warn"}
          />
          <Stat label="Enabled" value={schedules.enabled.toString()} tone="neutral" />
          <Stat label="Dry-run" value={schedules.dryRun.toString()} tone="neutral" />
        </div>
        {!registryOk && (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            Registry has fewer rows than expected. The boot syncAgentRegistry() call should reconcile on next deploy.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Apify ────────────────────────────────────────────────────────────────

function ApifyCard({ apify }: { apify: { ok: boolean; total: number; active: number; expected: number } }) {
  const ok = apify.ok && apify.total >= apify.expected;
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <SectionHeader icon={Globe} label="Apify ingestion" ok={ok} />
        <div className="grid gap-2 text-sm">
          <Stat label="Seeded" value={`${apify.total} / ${apify.expected}`} tone={ok ? "ok" : "warn"} />
          <Stat label="Active" value={apify.active.toString()} tone="neutral" />
        </div>
        {apify.active === 0 && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground dark:bg-slate-900/30">
            No sources active yet. Enable individual sources from Apify Ops after reviewing cost projections.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Secrets ──────────────────────────────────────────────────────────────

type SecretRow = {
  key: string;
  aliases: string[];
  purpose: string;
  severity: "critical" | "important" | "optional";
  present: boolean;
  presentVia: string | null;
};

function SecretsCard({ secrets }: { secrets: SecretRow[] }) {
  const missingCritical = secrets.filter((s) => s.severity === "critical" && !s.present);
  const missingImportant = secrets.filter((s) => s.severity === "important" && !s.present);
  const ok = missingCritical.length === 0;
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <SectionHeader
          icon={KeyRound}
          label="Runtime secrets"
          ok={ok}
          warning={!ok ? `${missingCritical.length} critical missing` : missingImportant.length ? `${missingImportant.length} important missing` : undefined}
        />
        <div className="space-y-1.5">
          {secrets.map((s) => (
            <SecretRowView key={s.key} s={s} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SecretRowView({ s }: { s: SecretRow }) {
  const severityTone = s.severity === "critical" ? "text-rose-600 dark:text-rose-400" : s.severity === "important" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground";
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {s.present ? (
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : (
            <XCircle className={`h-3.5 w-3.5 flex-shrink-0 ${severityTone}`} aria-hidden />
          )}
          <code className="text-xs font-mono">{s.key}</code>
          {s.presentVia && s.presentVia !== s.key && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[10px] text-muted-foreground cursor-help">via {s.presentVia}</span>
              </TooltipTrigger>
              <TooltipContent>This secret was satisfied by an alias: {s.presentVia}</TooltipContent>
            </Tooltip>
          )}
          <Badge variant="outline" className={`ml-auto h-5 text-[10px] ${severityTone}`}>{s.severity}</Badge>
        </div>
        <p className="ml-5 text-xs text-muted-foreground">{s.purpose}</p>
      </div>
    </div>
  );
}

// ─── Recent runs ──────────────────────────────────────────────────────────

function RecentRunsCard({
  runs,
}: {
  runs: Array<{
    id: string;
    agentId: string;
    status: string;
    startedAt: Date | string | null;
    durationMs: number | null;
    errorMessage: string | null;
  }>;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <SectionHeader icon={Sparkles} label="Recent agent runs" ok={true} />
          <span className="text-xs text-muted-foreground">{runs.length} of last 10</span>
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No agent runs yet. The runner ticks every 60 seconds and skips when no schedules are due.</p>
        ) : (
          <div className="space-y-1">
            {runs.map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RunRow({
  run,
}: {
  run: { id: string; agentId: string; status: string; startedAt: Date | string | null; durationMs: number | null; errorMessage: string | null };
}) {
  const statusTone =
    run.status === "completed" || run.status === "dry_run"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      : run.status === "running"
      ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
      : run.status === "failed" || run.status === "budget_exhausted"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Badge className={`h-5 font-mono text-[10px] ${statusTone}`}>{run.status}</Badge>
        <span className="font-mono text-[10px] text-muted-foreground truncate">{run.agentId.slice(0, 8)}</span>
        {run.errorMessage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-rose-600 underline decoration-dotted underline-offset-2 cursor-help text-[10px]">why?</span>
            </TooltipTrigger>
            <TooltipContent className="max-w-md">
              <p className="text-xs">{run.errorMessage}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        {run.durationMs !== null && <span>{run.durationMs < 1000 ? `${run.durationMs}ms` : `${(run.durationMs / 1000).toFixed(1)}s`}</span>}
        {run.startedAt && (
          <span>
            {new Date(run.startedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  ok,
  warning,
}: {
  icon: typeof Activity;
  label: string;
  ok: boolean;
  warning?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" aria-hidden />
      <h3 className="text-sm font-semibold">{label}</h3>
      {warning ? (
        <Badge variant="outline" className="ml-auto text-[10px] text-amber-700 dark:text-amber-300">
          {warning}
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className={`ml-auto text-[10px] ${ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}
        >
          {ok ? "OK" : "Issue"}
        </Badge>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "neutral" }) {
  const valueTone =
    tone === "ok" ? "text-emerald-700 dark:text-emerald-300 font-medium" : tone === "warn" ? "text-amber-700 dark:text-amber-300 font-medium" : "";
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={valueTone}>{value}</span>
    </div>
  );
}
