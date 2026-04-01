import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { AvatarInitials } from "@/components/common/AvatarInitials";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ScrollText,
} from "lucide-react";

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

const ACTION_COLORS: Record<string, string> = {
  create:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  update:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  login:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  export:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function DiffView({ changes }: { changes: any }) {
  if (!changes || typeof changes !== "object") return null;

  const entries = Object.entries(changes);
  if (entries.length === 0) return null;

  return (
    <div className="mt-2 rounded-md bg-muted p-3 text-xs font-mono space-y-1.5">
      {entries.map(([key, value]: [string, any]) => {
        if (value && typeof value === "object" && ("old" in value || "new" in value)) {
          return (
            <div key={key} className="space-y-0.5">
              <span className="text-muted-foreground font-sans font-medium">
                {key}:
              </span>
              {value.old != null && (
                <div className="text-red-600 dark:text-red-400 pl-3">
                  - {JSON.stringify(value.old)}
                </div>
              )}
              {value.new != null && (
                <div className="text-green-600 dark:text-green-400 pl-3">
                  + {JSON.stringify(value.new)}
                </div>
              )}
            </div>
          );
        }
        return (
          <div key={key}>
            <span className="text-muted-foreground font-sans font-medium">
              {key}:
            </span>{" "}
            {JSON.stringify(value)}
          </div>
        );
      })}
    </div>
  );
}

export default function AuditLog() {
  const [page, setPage] = useState(1);
  const [actionType, setActionType] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const pageSize = 25;

  const auditQuery = trpc.audit.list.useQuery(
    {
      page,
      pageSize,
      actionType: actionType || undefined,
      entityType: entityType || undefined,
    },
    { refetchOnWindowFocus: false }
  );

  const entries = (auditQuery.data as any)?.items ?? [];
  const totalPages = (auditQuery.data as any)?.totalPages ?? 1;
  const total = (auditQuery.data as any)?.total ?? 0;
  const loading = auditQuery.isLoading;

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        subtitle="Track all actions performed on the platform"
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select
          value={actionType}
          onValueChange={(v) => {
            setActionType(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            <SelectItem value="create">Create</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
            <SelectItem value="login">Login</SelectItem>
            <SelectItem value="export">Export</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={entityType}
          onValueChange={(v) => {
            setEntityType(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            <SelectItem value="person">Person</SelectItem>
            <SelectItem value="organization">Organization</SelectItem>
            <SelectItem value="relationship">Relationship</SelectItem>
            <SelectItem value="interaction">Interaction</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="domain">Domain</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-auto">
          {total} entries
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Date</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead className="hidden md:table-cell">Entity ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-4" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-7 w-7 rounded-full" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  </TableRow>
                ))
              : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <ScrollText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                        <p className="text-sm text-muted-foreground">
                          No audit entries found
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              : entries.map((entry: any) => {
                  const isExpanded = expandedRows.has(entry.id);
                  const hasChanges =
                    entry.changes &&
                    typeof entry.changes === "object" &&
                    Object.keys(entry.changes).length > 0;

                  return (
                    <Collapsible
                      key={entry.id}
                      open={isExpanded}
                      onOpenChange={() => hasChanges && toggleRow(entry.id)}
                      asChild
                    >
                      <>
                        <CollapsibleTrigger asChild>
                          <TableRow
                            className={
                              hasChanges
                                ? "cursor-pointer hover:bg-muted/50"
                                : ""
                            }
                          >
                            <TableCell>
                              {hasChanges && (
                                <ChevronDown
                                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                                    isExpanded ? "rotate-180" : ""
                                  }`}
                                />
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {formatDate(entry.createdAt ?? entry.timestamp)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {entry.user?.name ? (
                                  <AvatarInitials
                                    name={entry.user.name}
                                    size="sm"
                                  />
                                ) : null}
                                <span className="text-sm">
                                  {entry.user?.name ?? entry.userId ?? "-"}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  ACTION_COLORS[
                                    entry.actionType ?? entry.action ?? ""
                                  ] ?? "bg-muted text-muted-foreground"
                                }
                              >
                                {entry.actionType ?? entry.action ?? "-"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm capitalize">
                              {entry.entityType ?? "-"}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs font-mono text-muted-foreground">
                              {entry.entityId
                                ? entry.entityId.substring(0, 12) + "..."
                                : "-"}
                            </TableCell>
                          </TableRow>
                        </CollapsibleTrigger>
                        {hasChanges && (
                          <CollapsibleContent asChild>
                            <tr>
                              <td colSpan={6} className="px-6 pb-4">
                                <DiffView changes={entry.changes} />
                              </td>
                            </tr>
                          </CollapsibleContent>
                        )}
                      </>
                    </Collapsible>
                  );
                })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
