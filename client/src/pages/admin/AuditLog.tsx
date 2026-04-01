import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { AvatarInitials } from "@/components/common/AvatarInitials";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  ShieldCheck,
} from "lucide-react";

type AuditRow = {
  id: string;
  userId: string | null;
  actionType: string;
  entityType: string;
  entityId: string | null;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  ipAddress: string | null;
  createdAt: string | Date | null;
  userName: string | null;
  userEmail: string | null;
};

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(value);
  }
}

function parseJson(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function prettifyLabel(value?: string | null) {
  if (!value) return "General";
  return value
    .replace(/^auth\./, "")
    .replaceAll("_", " ")
    .replaceAll(".", " • ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function actionBadgeClass(actionType: string, fieldName?: string | null) {
  if ((fieldName ?? "").startsWith("auth.")) {
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
  }

  const styles: Record<string, string> = {
    create: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    update: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    delete: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    export: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    view: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  };

  return styles[actionType] ?? "bg-muted text-muted-foreground";
}

function DetailBlock({ title, value }: { title: string; value: unknown }) {
  if (value == null || value === "") return null;

  return (
    <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-foreground">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [actionType, setActionType] = useState<string>("all");
  const [entityType, setEntityType] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const pageSize = 25;

  const auditQuery = trpc.audit.list.useQuery(
    {
      page,
      pageSize,
      actionType: actionType === "all" ? undefined : actionType,
      entityType: entityType === "all" ? undefined : entityType,
    },
    { refetchOnWindowFocus: false },
  );

  const entries = useMemo(() => ((auditQuery.data as any)?.data ?? []) as AuditRow[], [auditQuery.data]);
  const totalPages = (auditQuery.data as any)?.totalPages ?? 1;
  const total = (auditQuery.data as any)?.total ?? 0;
  const loading = auditQuery.isLoading;

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        subtitle="Review onboarding, login, and operational changes captured across the platform."
      />

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-[var(--relgraph-primary)]" />
                System activity
              </CardTitle>
              <CardDescription>
                Authentication events now appear alongside user and admin changes so access requests, password setup, and sign-ins can be reviewed in one place.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-xs">
              {loading ? "Loading" : `${total} entries`}
            </Badge>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-900">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <ShieldCheck className="h-4 w-4" />
              Authentication audit trail
            </div>
            <p>
              Look for rows labeled <strong>Access Request</strong>, <strong>Password Setup</strong>, <strong>Registration Complete</strong>, and <strong>Login</strong> to review the new onboarding flow end to end.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select
              value={actionType}
              onValueChange={(value) => {
                setActionType(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                <SelectItem value="create">Create</SelectItem>
                <SelectItem value="update">Update</SelectItem>
                <SelectItem value="delete">Delete</SelectItem>
                <SelectItem value="view">View</SelectItem>
                <SelectItem value="export">Export</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={entityType}
              onValueChange={(value) => {
                setEntityType(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entities</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="person">Person</SelectItem>
                <SelectItem value="organization">Organization</SelectItem>
                <SelectItem value="interaction">Interaction</SelectItem>
                <SelectItem value="domain">Domain</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden lg:table-cell">Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><div className="flex items-center gap-2"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-4 w-28" /></div></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                    </TableRow>
                  ))
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <ScrollText className="mb-3 h-10 w-10 text-muted-foreground/40" />
                        <p className="text-sm font-medium">No audit entries found</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Activity will appear here once users sign in, request access, or admins update records.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => {
                    const parsedOldValue = parseJson(entry.oldValue);
                    const parsedNewValue = parseJson(entry.newValue);
                    const isExpanded = expandedRows.has(entry.id);
                    const hasDetails = Boolean(
                      entry.fieldName ||
                        entry.entityId ||
                        entry.ipAddress ||
                        parsedOldValue ||
                        parsedNewValue,
                    );

                    return (
                      <Collapsible
                        key={entry.id}
                        open={isExpanded}
                        onOpenChange={() => hasDetails && toggleRow(entry.id)}
                        asChild
                      >
                        <>
                          <CollapsibleTrigger asChild>
                            <TableRow className={hasDetails ? "cursor-pointer hover:bg-muted/40" : ""}>
                              <TableCell>
                                {hasDetails ? (
                                  <ChevronDown
                                    className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                  />
                                ) : null}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                {formatDate(entry.createdAt)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <AvatarInitials name={entry.userName || entry.userEmail || "S"} size="sm" />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{entry.userName || "System"}</p>
                                    <p className="truncate text-xs text-muted-foreground">{entry.userEmail || entry.userId || "-"}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                {prettifyLabel(entry.fieldName)}
                              </TableCell>
                              <TableCell>
                                <Badge className={actionBadgeClass(entry.actionType, entry.fieldName)}>
                                  {entry.actionType}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-sm text-muted-foreground capitalize">
                                {entry.entityType}
                              </TableCell>
                            </TableRow>
                          </CollapsibleTrigger>
                          {hasDetails ? (
                            <CollapsibleContent asChild>
                              <tr>
                                <td colSpan={6} className="px-6 pb-4">
                                  <div className="grid gap-3 rounded-xl bg-muted/20 p-4 md:grid-cols-2">
                                    <DetailBlock title="Event field" value={entry.fieldName} />
                                    <DetailBlock title="Entity ID" value={entry.entityId} />
                                    <DetailBlock title="IP address" value={entry.ipAddress} />
                                    <DetailBlock title="Previous value" value={parsedOldValue} />
                                    <DetailBlock title="New value" value={parsedNewValue} />
                                  </div>
                                </td>
                              </tr>
                            </CollapsibleContent>
                          ) : null}
                        </>
                      </Collapsible>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 ? (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
