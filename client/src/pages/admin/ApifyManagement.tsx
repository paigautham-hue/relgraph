import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Bot, Database, Loader2, PlayCircle, Plus, Radar, ShieldCheck } from "lucide-react";

type SourceCapability = "discovery" | "enrichment" | "monitoring";
type SourceTargetType = "search" | "person" | "organization";

const capabilityOptions: SourceCapability[] = ["discovery", "enrichment", "monitoring"];
const targetTypeOptions: SourceTargetType[] = ["search", "person", "organization"];

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ApifyManagement() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [formState, setFormState] = useState({
    name: "",
    description: "",
    capability: "discovery" as SourceCapability,
    targetType: "search" as SourceTargetType,
    actorId: "",
    actorTaskId: "",
    runFrequencyCron: "",
    defaultInputText: "{}",
    fieldMappingsText: "{}",
    watchFieldsText: "[]",
  });

  const canManage = useMemo(
    () => user?.role === "admin" || user?.role === "super_admin",
    [user?.role],
  );

  const sourceConfigsQuery = trpc.apify.listSourceConfigs.useQuery(
    { page: 1, pageSize: 50 },
    { enabled: canManage, refetchOnWindowFocus: false },
  );

  const runsQuery = trpc.apify.listRuns.useQuery(
    { page: 1, pageSize: 20 },
    { enabled: canManage, refetchOnWindowFocus: false },
  );

  const bankTargetsQuery = trpc.apify.getIndianBankTargets.useQuery(undefined, {
    enabled: canManage,
    refetchOnWindowFocus: false,
  });

  const domainsQuery = trpc.domains.list.useQuery(undefined, {
    enabled: canManage,
    refetchOnWindowFocus: false,
  });

  const bankPreviewQuery = trpc.apify.previewIndianBankSeed.useQuery(
    { domainId: selectedDomainId },
    {
      enabled: canManage && Boolean(selectedDomainId),
      refetchOnWindowFocus: false,
    },
  );

  const createSourceMutation = trpc.apify.createSourceConfig.useMutation({
    onSuccess: async () => {
      toast.success("Apify source configuration created.");
      setDialogOpen(false);
      setFormState({
        name: "",
        description: "",
        capability: "discovery",
        targetType: "search",
        actorId: "",
        actorTaskId: "",
        runFrequencyCron: "",
        defaultInputText: "{}",
        fieldMappingsText: "{}",
        watchFieldsText: "[]",
      });
      await Promise.all([
        utils.apify.listSourceConfigs.invalidate(),
        utils.apify.listRuns.invalidate(),
      ]);
    },
    onError: (error) => {
      toast.error(error.message || "The source configuration could not be created.");
    },
  });

  const runSourceMutation = trpc.apify.runSource.useMutation({
    onSuccess: async () => {
      toast.success("Apify source run started.");
      await Promise.all([
        utils.apify.listRuns.invalidate(),
        utils.apify.listSourceConfigs.invalidate(),
      ]);
    },
    onError: (error) => {
      toast.error(error.message || "The source could not be run.");
    },
  });

  const syncMonitoringMutation = trpc.apify.syncMonitoring.useMutation({
    onSuccess: async (result) => {
      toast.success(`Monitoring sync finished. ${result.alertsCreated} alert(s) created.`);
      await Promise.all([
        utils.apify.listRuns.invalidate(),
        utils.alerts.list.invalidate(),
      ]);
    },
    onError: (error) => {
      toast.error(error.message || "Monitoring sync failed.");
    },
  });

  const seedBanksMutation = trpc.apify.seedIndianBankOrganizations.useMutation({
    onSuccess: async (result) => {
      toast.success(`Seeded ${result.createdOrganizations.length} bank organization(s).`);
      await Promise.all([
        utils.apify.getIndianBankTargets.invalidate(),
        utils.apify.previewIndianBankSeed.invalidate(),
        utils.organizations.list.invalidate(),
        utils.apify.listSourceConfigs.invalidate(),
      ]);
    },
    onError: (error) => {
      toast.error(error.message || "The Indian bank seed could not be applied.");
    },
  });

  const handleCreateSource = async () => {
    try {
      const defaultInput = JSON.parse(formState.defaultInputText || "{}");
      const fieldMappings = JSON.parse(formState.fieldMappingsText || "{}");
      const watchFields = JSON.parse(formState.watchFieldsText || "[]");

      await createSourceMutation.mutateAsync({
        name: formState.name,
        description: formState.description || undefined,
        capability: formState.capability,
        targetType: formState.targetType,
        actorId: formState.actorId || undefined,
        actorTaskId: formState.actorTaskId || undefined,
        runFrequencyCron: formState.runFrequencyCron || undefined,
        defaultInput,
        fieldMappings,
        watchFields,
        isActive: true,
      });
    } catch {
      toast.error("Default input, field mappings, and watch fields must be valid JSON.");
    }
  };

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Apify Operations"
          subtitle="Only administrators can manage scraping sources, runs, and bank seed workflows."
        />
        <div className="rounded-3xl border bg-card p-8 text-sm text-muted-foreground">
          Your current role does not allow Apify administration.
        </div>
      </div>
    );
  }

  const sources = sourceConfigsQuery.data?.data ?? [];
  const runs = runsQuery.data?.data ?? [];
  const bankTargets = bankTargetsQuery.data ?? [];
  const domains = (domainsQuery.data as Array<{ id: string; name: string }>) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Apify Operations"
        subtitle="Manage source configurations, trigger discovery and monitoring runs, and seed Indian bank organizations into RelGraph."
      >
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]">
              <Plus className="mr-2 h-4 w-4" />
              Add source
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Apify source</DialogTitle>
              <DialogDescription>
                Add a reusable discovery, enrichment, or monitoring source backed by an Apify actor or task.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="apify-name">Name</Label>
                <Input
                  id="apify-name"
                  value={formState.name}
                  onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Indian bank leadership monitor"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apify-frequency">Run frequency cron</Label>
                <Input
                  id="apify-frequency"
                  value={formState.runFrequencyCron}
                  onChange={(event) => setFormState((current) => ({ ...current, runFrequencyCron: event.target.value }))}
                  placeholder="0 0 * * 1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apify-capability">Capability</Label>
                <select
                  id="apify-capability"
                  className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={formState.capability}
                  onChange={(event) => setFormState((current) => ({ ...current, capability: event.target.value as SourceCapability }))}
                >
                  {capabilityOptions.map((option) => (
                    <option key={option} value={option}>{formatLabel(option)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="apify-target-type">Target type</Label>
                <select
                  id="apify-target-type"
                  className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={formState.targetType}
                  onChange={(event) => setFormState((current) => ({ ...current, targetType: event.target.value as SourceTargetType }))}
                >
                  {targetTypeOptions.map((option) => (
                    <option key={option} value={option}>{formatLabel(option)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="apify-actor-id">Actor ID</Label>
                <Input
                  id="apify-actor-id"
                  value={formState.actorId}
                  onChange={(event) => setFormState((current) => ({ ...current, actorId: event.target.value }))}
                  placeholder="apify/google-search-scraper"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apify-task-id">Actor task ID</Label>
                <Input
                  id="apify-task-id"
                  value={formState.actorTaskId}
                  onChange={(event) => setFormState((current) => ({ ...current, actorTaskId: event.target.value }))}
                  placeholder="Optional saved Apify task"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apify-description">Description</Label>
              <Textarea
                id="apify-description"
                rows={2}
                value={formState.description}
                onChange={(event) => setFormState((current) => ({ ...current, description: event.target.value }))}
                placeholder="Tracks official leadership pages and extracts role changes for review."
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="apify-default-input">Default input JSON</Label>
                <Textarea
                  id="apify-default-input"
                  rows={6}
                  value={formState.defaultInputText}
                  onChange={(event) => setFormState((current) => ({ ...current, defaultInputText: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apify-field-mappings">Field mappings JSON</Label>
                <Textarea
                  id="apify-field-mappings"
                  rows={6}
                  value={formState.fieldMappingsText}
                  onChange={(event) => setFormState((current) => ({ ...current, fieldMappingsText: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apify-watch-fields">Watch fields JSON</Label>
                <Textarea
                  id="apify-watch-fields"
                  rows={6}
                  value={formState.watchFieldsText}
                  onChange={(event) => setFormState((current) => ({ ...current, watchFieldsText: event.target.value }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={createSourceMutation.isPending || !formState.name.trim()}
                className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]"
                onClick={handleCreateSource}
              >
                {createSourceMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create source
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4 rounded-3xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--relgraph-primary)]" />
            <div>
              <p className="text-sm font-semibold text-foreground">Operational model</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Use discovery sources to collect prospects, enrichment sources to add sourced detail to existing records, and monitoring sources to create review alerts when leadership changes are detected.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Configured sources</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{sources.length}</p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Recorded runs</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{runs.length}</p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Indian bank targets</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{bankTargets.length}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 text-[var(--relgraph-primary)]" />
            <div>
              <p className="text-sm font-semibold text-foreground">Indian bank seed workflow</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Preview the public and private bank target set, choose a RelGraph domain, and seed organizations plus default monitoring sources for later review.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="seed-domain">Target domain</Label>
            <select
              id="seed-domain"
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedDomainId}
              onChange={(event) => setSelectedDomainId(event.target.value)}
            >
              <option value="">Select a domain</option>
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>{domain.name}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              disabled={!selectedDomainId || seedBanksMutation.isPending}
              className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]"
              onClick={() => seedBanksMutation.mutate({ domainId: selectedDomainId })}
            >
              {seedBanksMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Seed organizations and monitoring configs
            </Button>
            <Button type="button" variant="outline" asChild>
              <a href="/admin/bank-dataset">Review full bank dataset</a>
            </Button>
          </div>
          {bankPreviewQuery.data ? (
            <div className="rounded-2xl border bg-background/70 p-4 text-sm text-muted-foreground">
              <p>
                Previewing <span className="font-medium text-foreground">{bankPreviewQuery.data.banks.length}</span> bank targets for domain <span className="font-medium text-foreground">{bankPreviewQuery.data.domain.name}</span>.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border bg-card p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Apify source configurations</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Review saved actors and tasks, then run discovery or monitoring jobs directly from the workspace.
              </p>
            </div>
            <Badge variant="secondary">Admin managed</Badge>
          </div>

          {sourceConfigsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : sources.length === 0 ? (
            <div className="rounded-2xl border bg-background/60 p-8 text-center text-sm text-muted-foreground">
              No Apify source configurations have been added yet.
            </div>
          ) : (
            <div className="rounded-2xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Capability</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((source: any) => (
                    <TableRow key={source.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{source.name}</p>
                          <p className="text-xs text-muted-foreground">{source.actorTaskId || source.actorId || "Manual payload source"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{formatLabel(source.capability)}</Badge>
                      </TableCell>
                      <TableCell>{formatLabel(source.targetType)}</TableCell>
                      <TableCell>
                        {source.isActive ? <Badge>Active</Badge> : <Badge variant="secondary">Paused</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={runSourceMutation.isPending}
                            onClick={() => runSourceMutation.mutate({ sourceConfigId: source.id })}
                          >
                            <PlayCircle className="mr-2 h-4 w-4" />
                            Run
                          </Button>
                          {source.capability === "monitoring" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={syncMonitoringMutation.isPending}
                              onClick={() => syncMonitoringMutation.mutate({ sourceConfigId: source.id, createAlerts: true })}
                            >
                              <Radar className="mr-2 h-4 w-4" />
                              Sync
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="rounded-3xl border bg-card p-5">
          <div className="mb-4 flex items-start gap-3">
            <Bot className="mt-0.5 h-5 w-5 text-[var(--relgraph-primary)]" />
            <div>
              <p className="text-sm font-semibold text-foreground">Recent run activity</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Track the latest run statuses and monitor whether change-detection is producing reviewable output.
              </p>
            </div>
          </div>

          {runsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-2xl border bg-background/60 p-8 text-center text-sm text-muted-foreground">
              No Apify runs have been recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {runs.map((run: any) => (
                <div key={run.id} className="rounded-2xl border bg-background/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{formatLabel(run.capability)} · {formatLabel(run.targetType)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Run ID: {run.id}</p>
                    </div>
                    <Badge variant={run.status === "succeeded" ? "default" : run.status === "failed" ? "destructive" : "secondary"}>
                      {formatLabel(run.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    <p>Detected changes: <span className="font-medium text-foreground">{Array.isArray(run.detectedChanges) ? run.detectedChanges.length : 0}</span></p>
                    <p>Started: <span className="font-medium text-foreground">{run.startedAt ? new Date(run.startedAt).toLocaleString() : "-"}</span></p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Indian bank target registry</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This registry is the working seed list for public and private sector bank organization setup and future leadership collection workflows.
            </p>
          </div>
          <Badge variant="secondary">Source-ready target set</Badge>
        </div>

        {bankTargetsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : bankTargets.length === 0 ? (
          <div className="rounded-2xl border bg-background/60 p-8 text-center text-sm text-muted-foreground">
            The bank registry is not available yet.
          </div>
        ) : (
          <div className="rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bank</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Seed state</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankTargets.map((bank: any) => (
                  <TableRow key={bank.name}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{bank.name}</p>
                        <p className="text-xs text-muted-foreground">{bank.suggestedDomainId ? "Domain mapped" : "Select a domain before seeding"}</p>
                      </div>
                    </TableCell>
                    <TableCell>{formatLabel(bank.type || "other")}</TableCell>
                    <TableCell>
                      {bank.website ? (
                        <a href={bank.website} target="_blank" rel="noreferrer" className="text-[var(--relgraph-primary)] hover:underline">
                          {bank.website}
                        </a>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {bank.organizationExists ? <Badge>Present</Badge> : <Badge variant="secondary">Not seeded</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
