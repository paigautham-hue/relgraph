import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputMethodBadge } from "@/components/common/InputMethodBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, ExternalLink, User } from "lucide-react";

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
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

interface FieldHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  fieldName: string;
}

export function FieldHistoryDialog({
  open,
  onOpenChange,
  personId,
  fieldName,
}: FieldHistoryDialogProps) {
  const historyQuery = trpc.intel.fieldHistory.useQuery(
    { personId, fieldName },
    { enabled: open && !!personId && !!fieldName },
  );

  const history = historyQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-muted-foreground" />
            History: {fieldName}
          </DialogTitle>
        </DialogHeader>

        {historyQuery.isLoading ? (
          <div className="space-y-4 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-3 w-3 rounded-full shrink-0 mt-1.5" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No history found for this field.
          </p>
        ) : (
          <div className="relative ml-3 border-l-2 border-border pl-5 space-y-6 py-2">
            {history.map((entry, index) => (
              <div key={entry.id} className="relative">
                {/* Timeline dot */}
                <div
                  className="absolute -left-[calc(1.25rem+5px)] top-1 h-2.5 w-2.5 rounded-full border-2 bg-background"
                  style={{
                    borderColor:
                      index === 0
                        ? "var(--relgraph-primary)"
                        : "var(--border)",
                  }}
                />

                <div className="space-y-1.5">
                  {/* Value */}
                  <p
                    className={
                      index === 0
                        ? "text-sm font-medium"
                        : "text-sm text-muted-foreground"
                    }
                  >
                    {entry.fieldValue}
                  </p>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {entry.contributorName ?? "Unknown"}
                    </span>
                    <span className="text-border">|</span>
                    <span>{formatDate(entry.createdAt as any)}</span>
                    {entry.inputMethod && (
                      <>
                        <span className="text-border">|</span>
                        <InputMethodBadge method={entry.inputMethod} />
                      </>
                    )}
                  </div>

                  {/* Source URL */}
                  {entry.sourceUrl && (
                    <a
                      href={entry.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-[var(--relgraph-primary)] hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Source
                    </a>
                  )}

                  {/* Confidence */}
                  {entry.aiConfidence != null && (
                    <p className="text-xs text-muted-foreground">
                      AI confidence: {Math.round(entry.aiConfidence * 100)}%
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
