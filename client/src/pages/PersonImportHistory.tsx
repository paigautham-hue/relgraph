import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock3, FileWarning, History, Loader2, Search, ShieldCheck } from "lucide-react";

function statusTone(status?: string) {
  if (status === "imported") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
  if (status === "validated") return "border-sky-500/20 bg-sky-500/10 text-sky-700";
  return "border-amber-500/20 bg-amber-500/10 text-amber-700";
}

function verdictTone(verdict?: string) {
  if (verdict === "pass") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-700";
  if (verdict === "needs_review") return "border-amber-500/20 bg-amber-500/10 text-amber-700";
  return "border-rose-500/20 bg-rose-500/10 text-rose-700";
}

function formatLabel(value?: string | null) {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PersonImportHistory() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const canReviewImports = useMemo(
    () => ["contributor", "manager", "admin", "super_admin"].includes(user?.role ?? "viewer"),
    [user?.role],
  );

  const historyQuery = trpc.persons.listImportHistory.useQuery(
    {
      page,
      pageSize: 12,
      search: search || undefined,
      status: status === "all" ? undefined : (status as "validated" | "blocked" | "imported"),
      source: source === "all" ? undefined : (source as "csv" | "xlsx" | "xls"),
    },
    {
      enabled: canReviewImports,
      refetchOnWindowFocus: false,
    },
  );

  const selectedRunQuery = trpc.persons.getImportHistoryEntry.useQuery(
    { id: selectedRunId ?? "00000000-0000-0000-0000-000000000000" },
    {
      enabled: Boolean(selectedRunId),
      refetchOnWindowFocus: false,
    },
  );

  const runs = historyQuery.data?.data ?? [];
  const total = historyQuery.data?.total ?? 0;
  const totalPages = historyQuery.data?.totalPages ?? 1;

  if (!canReviewImports) {
    return (
      <div className="space-y-6">
        <PageHeader title="Import History" subtitle="Validation and import runs are visible to contributors and above." />
        <div className="rounded-3xl border bg-card p-8 text-sm text-muted-foreground">
          You do not currently have permission to review contact import history.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import History"
        subtitle={`${total} recorded validation and import runs`}
      >
        <div className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-sm text-muted-foreground">
          <History className="h-4 w-4" />
          Contact import audit trail
        </div>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_2.05fr]">
        <div className="rounded-3xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--relgraph-primary)]" />
            <div>
              <p className="text-sm font-semibold text-foreground">Operational visibility</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Review which files were validated, which ones were blocked by duplicates or structural issues, and which imports were completed.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-history-search">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="import-history-search"
                  value={search}
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Search by file or summary"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={status}
                  onValueChange={(value) => {
                    setPage(1);
                    setStatus(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="validated">Validated</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="imported">Imported</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Source</Label>
                <Select
                  value={source}
                  onValueChange={(value) => {
                    setPage(1);
                    setSource(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All sources" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sources</SelectItem>
                    <SelectItem value="csv">CSV</SelectItem>
                    <SelectItem value="xlsx">XLSX</SelectItem>
                    <SelectItem value="xls">XLS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border bg-card p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Recorded runs</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Each row captures a validation attempt or completed import, including AI verdict, duplicate count, and issue volume.
              </p>
            </div>
            {historyQuery.isFetching ? (
              <div className="inline-flex items-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Refreshing
              </div>
            ) : null}
          </div>

          <div className="overflow-hidden rounded-2xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verdict</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyQuery.isLoading ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-12 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : runs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <div className="flex flex-col items-center gap-3 py-12 text-center">
                        <Clock3 className="h-8 w-8 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-foreground">No import runs found</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Try a different filter or validate a new contact file from the People page.
                          </p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{run.fileName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{run.templateVersion}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusTone(run.status)}>
                          {formatLabel(run.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={verdictTone(run.aiVerdict)}>
                          {formatLabel(run.aiVerdict)}
                        </Badge>
                      </TableCell>
                      <TableCell>{run.validRowCount}/{run.rowCount}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {run.issueCount} issues · {run.duplicateCount} duplicates
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {new Date(run.createdAt).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button type="button" variant="outline" onClick={() => setSelectedRunId(run.id)}>
                          View details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {Math.max(totalPages, 1)}
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                Previous
              </Button>
              <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedRunId)} onOpenChange={(open) => !open && setSelectedRunId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Import run details</DialogTitle>
            <DialogDescription>
              Review the import summary, AI verdict, and row-level issues for this run.
            </DialogDescription>
          </DialogHeader>

          {!selectedRunId || selectedRunQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          ) : selectedRunQuery.data ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Status</p>
                  <div className="mt-2">
                    <Badge variant="outline" className={statusTone(selectedRunQuery.data.status)}>
                      {formatLabel(selectedRunQuery.data.status)}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">AI verdict</p>
                  <div className="mt-2">
                    <Badge variant="outline" className={verdictTone(selectedRunQuery.data.aiVerdict)}>
                      {formatLabel(selectedRunQuery.data.aiVerdict)}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Rows</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {selectedRunQuery.data.validRowCount}/{selectedRunQuery.data.rowCount}
                  </p>
                </div>
                <div className="rounded-2xl bg-muted/40 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Issues</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{selectedRunQuery.data.issueCount}</p>
                </div>
              </div>

              <div className="rounded-2xl border bg-background/60 p-4">
                <p className="text-sm font-semibold text-foreground">Summary</p>
                <p className="mt-2 text-sm text-muted-foreground">{selectedRunQuery.data.summary || "No summary recorded."}</p>
              </div>

              <div className="rounded-2xl border">
                <div className="flex items-center gap-2 border-b px-4 py-3">
                  <FileWarning className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">Error report</p>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">Row</TableHead>
                        <TableHead className="w-[120px]">Severity</TableHead>
                        <TableHead className="w-[180px]">Field</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedRunQuery.data.errorReport ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <div className="py-8 text-sm text-emerald-700">
                              No row-level issues were recorded for this run.
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        (selectedRunQuery.data.errorReport ?? []).map((issue, index) => (
                          <TableRow key={`${issue.rowNumber}-${issue.field}-${index}`}>
                            <TableCell>{issue.rowNumber}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={issue.severity === "error" ? "border-rose-500/20 text-rose-700" : "border-amber-500/20 text-amber-700"}
                              >
                                {issue.severity}
                              </Badge>
                            </TableCell>
                            <TableCell>{issue.field}</TableCell>
                            <TableCell className="text-muted-foreground">{issue.message}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
              The selected import run could not be loaded.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
