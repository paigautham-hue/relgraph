import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  AlertTriangle,
  Building2,
  CheckCircle2,
  Database,
  ExternalLink,
  Loader2,
  ShieldCheck,
  UserPlus,
  XCircle,
} from "lucide-react";

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString();
}

export default function IndianBankDataset() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [reviewStatusFilter, setReviewStatusFilter] = useState("pending_review");
  const [recordSearch, setRecordSearch] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);

  const canManage = useMemo(
    () => user?.role === "admin" || user?.role === "super_admin",
    [user?.role],
  );

  const bankTargetsQuery = trpc.apify.getIndianBankTargets.useQuery(undefined, {
    enabled: canManage,
    refetchOnWindowFocus: false,
  });

  const domainsQuery = trpc.domains.list.useQuery(undefined, {
    enabled: canManage,
    refetchOnWindowFocus: false,
  });

  const previewQuery = trpc.apify.previewIndianBankSeed.useQuery(
    { domainId: selectedDomainId },
    {
      enabled: canManage && Boolean(selectedDomainId),
      refetchOnWindowFocus: false,
    },
  );

  const leadershipRecordsQuery = trpc.apify.listBankLeadershipRecords.useQuery(
    {
      page: 1,
      pageSize: 50,
      validationStatus: reviewStatusFilter === "all" ? undefined : (reviewStatusFilter as any),
      search: recordSearch.trim() || undefined,
    },
    {
      enabled: canManage,
      refetchOnWindowFocus: false,
    },
  );

  const seedMutation = trpc.apify.seedIndianBankOrganizations.useMutation({
    onSuccess: async (result) => {
      toast.success(`Seeded ${result.createdOrganizations.length} bank organization(s).`);
      await Promise.all([
        utils.apify.getIndianBankTargets.invalidate(),
        utils.apify.previewIndianBankSeed.invalidate(),
        utils.apify.listBankLeadershipRecords.invalidate(),
        utils.organizations.list.invalidate(),
      ]);
    },
    onError: (error) => {
      toast.error(error.message || "The bank dataset seed could not be completed.");
    },
  });

  const updateRecordMutation = trpc.apify.updateBankLeadershipRecord.useMutation({
    onSuccess: async () => {
      toast.success("Leadership validation status updated.");
      await utils.apify.listBankLeadershipRecords.invalidate();
      setActiveRecordId(null);
    },
    onError: (error) => {
      toast.error(error.message || "The leadership validation update failed.");
      setActiveRecordId(null);
    },
  });

  const importRecordMutation = trpc.apify.importBankLeadershipRecord.useMutation({
    onSuccess: async (result) => {
      toast.success(`Imported ${result.person?.name ?? "leadership record"} into RelGraph.`);
      await Promise.all([
        utils.apify.listBankLeadershipRecords.invalidate(),
        utils.organizations.list.invalidate(),
      ]);
      setActiveRecordId(null);
    },
    onError: (error) => {
      toast.error(error.message || "The leadership record import failed.");
      setActiveRecordId(null);
    },
  });

  const bankTargets = bankTargetsQuery.data ?? [];
  const domains = (domainsQuery.data as Array<{ id: string; name: string }>) ?? [];
  const leadershipRecords = (leadershipRecordsQuery.data?.data as Array<any>) ?? [];

  const reviewStats = useMemo(() => {
    return leadershipRecords.reduce(
      (acc, record) => {
        acc.total += 1;
        if (record.validationStatus === "pending_review") acc.pending += 1;
        if (record.validationStatus === "official_source_confirmed") acc.confirmed += 1;
        if (record.validationStatus === "conflict_detected") acc.conflicts += 1;
        if (record.isImported) acc.imported += 1;
        return acc;
      },
      { total: 0, pending: 0, confirmed: 0, conflicts: 0, imported: 0 },
    );
  }, [leadershipRecords]);

  function getDraftNote(record: any) {
    return noteDrafts[record.id] ?? record.validationNotes ?? "";
  }

  function saveNoteDraft(recordId: string, value: string) {
    setNoteDrafts((current) => ({
      ...current,
      [recordId]: value,
    }));
  }

  function handleReviewAction(recordId: string, validationStatus: string) {
    setActiveRecordId(recordId);
    updateRecordMutation.mutate({
      id: recordId,
      validationStatus: validationStatus as any,
      validationNotes: noteDrafts[recordId] ?? null,
    });
  }

  function handleImport(record: any) {
    setActiveRecordId(record.id);
    importRecordMutation.mutate({
      id: record.id,
      domainId: selectedDomainId || undefined,
      createOrganizationIfMissing: Boolean(selectedDomainId),
      markAsCurrent: true,
    });
  }

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Indian Bank Dataset"
          subtitle="Only administrators can seed and manage the bank target registry."
        />
        <div className="rounded-3xl border bg-card p-8 text-sm text-muted-foreground">
          Your current role does not allow bank dataset administration.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Indian Bank Dataset"
        subtitle="Establish the bank registry, review leadership candidates captured through Apify runs, and import only the records that have credible public-source support."
      >
        <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-sm text-muted-foreground">
          <Database className="h-4 w-4" />
          Dataset operations
        </div>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4 rounded-3xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--relgraph-primary)]" />
            <div>
              <p className="text-sm font-semibold text-foreground">Registry scope</p>
              <p className="mt-1 text-sm text-muted-foreground">
                This workflow establishes the base organization set for Indian banking coverage, then promotes only reviewed leadership candidates into tracked RelGraph people and tenure records.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Bank targets</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{bankTargets.length}</p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Public sector</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {bankTargets.filter((bank: any) => bank.type === "public_sector").length}
              </p>
            </div>
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Private sector</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {bankTargets.filter((bank: any) => bank.type === "private_sector").length}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 rounded-3xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 text-[var(--relgraph-primary)]" />
            <div>
              <p className="text-sm font-semibold text-foreground">Seed organizations</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose the target domain that should own the initial bank organization records and the downstream leadership imports.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bank-domain">Target domain</Label>
            <select
              id="bank-domain"
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={selectedDomainId}
              onChange={(event) => setSelectedDomainId(event.target.value)}
            >
              <option value="">Select a domain</option>
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            type="button"
            className="w-full bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]"
            disabled={!selectedDomainId || seedMutation.isPending}
            onClick={() => seedMutation.mutate({ domainId: selectedDomainId })}
          >
            {seedMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Seed bank organizations
          </Button>

          {previewQuery.data ? (
            <div className="rounded-2xl border bg-background/70 p-4 text-sm text-muted-foreground">
              <p>
                The current preview maps <span className="font-medium text-foreground">{previewQuery.data.banks.length}</span> banks into the domain <span className="font-medium text-foreground">{previewQuery.data.domain.name}</span>.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border bg-background/70 p-4 text-sm text-muted-foreground">
              Select a domain to preview the organization seed set and enable record import fallback for missing bank organizations.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Working bank registry</p>
            <p className="mt-1 text-sm text-muted-foreground">
              This table shows the target organization list that underpins discovery, enrichment, and leadership monitoring workflows.
            </p>
          </div>
          <Badge variant="secondary">Review before seed</Badge>
        </div>

        {bankTargetsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : bankTargets.length === 0 ? (
          <div className="rounded-2xl border bg-background/60 p-8 text-center text-sm text-muted-foreground">
            The bank target registry is not available yet.
          </div>
        ) : (
          <div className="rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bank</TableHead>
                  <TableHead>Segment</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankTargets.map((bank: any) => (
                  <TableRow key={bank.name}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{bank.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {bank.headquarters || "Headquarters not yet captured"}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{formatLabel(bank.type || "other")}</TableCell>
                    <TableCell>
                      {bank.website ? (
                        <a
                          href={bank.website}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--relgraph-primary)] hover:underline"
                        >
                          {bank.website}
                        </a>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      {bank.organizationExists ? (
                        <Badge>Seeded</Badge>
                      ) : (
                        <Badge variant="secondary">Pending seed</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="rounded-3xl border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Leadership validation queue</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Review Apify-discovered bank leadership candidates, capture source-validation notes, and import only records that meet your evidence threshold.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-muted/40 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Candidates</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{reviewStats.total}</p>
            </div>
            <div className="rounded-2xl bg-muted/40 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{reviewStats.pending}</p>
            </div>
            <div className="rounded-2xl bg-muted/40 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Confirmed</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{reviewStats.confirmed}</p>
            </div>
            <div className="rounded-2xl bg-muted/40 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Imported</p>
              <p className="mt-2 text-xl font-semibold text-foreground">{reviewStats.imported}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="record-status-filter">Validation status</Label>
            <select
              id="record-status-filter"
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={reviewStatusFilter}
              onChange={(event) => setReviewStatusFilter(event.target.value)}
            >
              <option value="all">All records</option>
              <option value="pending_review">Pending review</option>
              <option value="official_source_confirmed">Official source confirmed</option>
              <option value="secondary_source_only">Secondary source only</option>
              <option value="conflict_detected">Conflict detected</option>
              <option value="rejected">Rejected</option>
              <option value="imported">Imported</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="record-search">Search records</Label>
            <input
              id="record-search"
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={recordSearch}
              onChange={(event) => setRecordSearch(event.target.value)}
              placeholder="Search by name, title, bank, or source"
            />
          </div>
        </div>

        {leadershipRecordsQuery.isLoading ? (
          <div className="mt-5 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : leadershipRecords.length === 0 ? (
          <div className="mt-5 rounded-2xl border bg-background/60 p-8 text-center text-sm text-muted-foreground">
            No bank leadership candidates match the current filters yet. Run or review Apify leadership sources to populate this queue.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {leadershipRecords.map((record: any) => {
              const isBusy = activeRecordId === record.id && (updateRecordMutation.isPending || importRecordMutation.isPending);
              const noteValue = getDraftNote(record);
              return (
                <div key={record.id} className="rounded-2xl border bg-background/50 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-foreground">{record.personName}</p>
                        <Badge variant="secondary">{formatLabel(record.roleType)}</Badge>
                        <Badge>{formatLabel(record.validationStatus)}</Badge>
                        {record.isImported ? <Badge variant="outline">Imported</Badge> : null}
                      </div>

                      <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide">Bank</p>
                          <p className="mt-1 font-medium text-foreground">{record.bankName}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide">Observed title</p>
                          <p className="mt-1 font-medium text-foreground">{record.title}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide">Confidence</p>
                          <p className="mt-1 font-medium text-foreground">
                            {formatLabel(record.confidenceLevel)}
                            {typeof record.confidenceScore === "number" ? ` (${Math.round(record.confidenceScore * 100)}%)` : ""}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide">Source type</p>
                          <p className="mt-1 font-medium text-foreground">{formatLabel(record.sourceType)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide">Observed</p>
                          <p className="mt-1 font-medium text-foreground">{formatDate(record.sourceObservedAt)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide">Published date</p>
                          <p className="mt-1 font-medium text-foreground">{formatDate(record.sourcePublishedDate)}</p>
                        </div>
                      </div>

                      {record.sourceExcerpt ? (
                        <div className="rounded-2xl border bg-card/70 p-3 text-sm text-muted-foreground">
                          <p className="font-medium text-foreground">Source excerpt</p>
                          <p className="mt-1">{record.sourceExcerpt}</p>
                        </div>
                      ) : null}

                      <div className="rounded-2xl border bg-card/70 p-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2 text-foreground">
                          <ExternalLink className="h-4 w-4" />
                          <span className="font-medium">Evidence and source</span>
                        </div>
                        <div className="mt-2 space-y-2">
                          {record.sourceUrl ? (
                            <a
                              href={record.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 text-[var(--relgraph-primary)] hover:underline"
                            >
                              Open captured source
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          {Array.isArray(record.validationEvidence) && record.validationEvidence.length > 0 ? (
                            <ul className="space-y-1">
                              {record.validationEvidence.map((entry: any, index: number) => (
                                <li key={`${record.id}-evidence-${index}`}>
                                  <span className="font-medium text-foreground">{entry.label}</span>
                                  {entry.note ? ` — ${entry.note}` : ""}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p>No structured evidence has been saved yet.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="w-full space-y-3 xl:max-w-md">
                      <div className="rounded-2xl border bg-card/70 p-3">
                        <Label htmlFor={`notes-${record.id}`}>Validation notes</Label>
                        <textarea
                          id={`notes-${record.id}`}
                          className="mt-2 min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={noteValue}
                          onChange={(event) => saveNoteDraft(record.id, event.target.value)}
                          placeholder="Capture the official source, filing date, evidence quality, or any conflicts before import."
                        />
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleReviewAction(record.id, "official_source_confirmed")}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          {isBusy && updateRecordMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                          Confirm
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => handleReviewAction(record.id, "secondary_source_only")}
                        >
                          <AlertTriangle className="mr-2 h-4 w-4" />
                          Mark secondary
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => handleReviewAction(record.id, "conflict_detected")}
                        >
                          <AlertTriangle className="mr-2 h-4 w-4" />
                          Flag conflict
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={isBusy}
                          onClick={() => handleReviewAction(record.id, "rejected")}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Reject
                        </Button>
                      </div>

                      <Button
                        type="button"
                        className="w-full bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary-dark)]"
                        disabled={isBusy || record.validationStatus === "rejected"}
                        onClick={() => handleImport(record)}
                      >
                        {isBusy && importRecordMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                        Import into RelGraph
                      </Button>

                      {!selectedDomainId && !record.organizationId ? (
                        <p className="text-xs text-amber-600">
                          Select a target domain above if this record needs a new organization created during import.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
