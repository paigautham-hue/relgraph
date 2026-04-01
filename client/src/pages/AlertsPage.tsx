import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Flame,
  Info,
  Lightbulb,
  RefreshCcw,
  TrendingDown,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";

// ---------------------------------------------------------------------------
// Alert type helpers
// ---------------------------------------------------------------------------

const ALERT_TYPE_CONFIG: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  movement_detected: {
    icon: RefreshCcw,
    color: "text-blue-500 bg-blue-50 border-blue-200",
    label: "Movement",
  },
  relationship_decay: {
    icon: TrendingDown,
    color: "text-amber-500 bg-amber-50 border-amber-200",
    label: "Decay",
  },
  opportunity: {
    icon: Lightbulb,
    color: "text-emerald-500 bg-emerald-50 border-emerald-200",
    label: "Opportunity",
  },
  new_person_added: {
    icon: UserPlus,
    color: "text-violet-500 bg-violet-50 border-violet-200",
    label: "New Person",
  },
  coverage_gap: {
    icon: Users,
    color: "text-rose-500 bg-rose-50 border-rose-200",
    label: "Coverage Gap",
  },
};

const SEVERITY_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  info: { icon: Info, color: "text-blue-500" },
  warning: { icon: AlertTriangle, color: "text-amber-500" },
  critical: { icon: Flame, color: "text-red-500" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [showDismissed, setShowDismissed] = useState(false);

  const alertsQuery = trpc.alerts.list.useQuery(
    {
      type: activeTab !== "all" ? activeTab : undefined,
      isDismissed: showDismissed ? undefined : false,
    },
    { refetchOnWindowFocus: false }
  );

  const dismissMutation = trpc.alerts.dismiss.useMutation({
    onSuccess: () => alertsQuery.refetch(),
  });
  const markActionMutation = trpc.alerts.markAction.useMutation({
    onSuccess: () => alertsQuery.refetch(),
  });

  const alerts = alertsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Alerts" subtitle="Stay on top of relationship intelligence events">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDismissed(!showDismissed)}
          className="gap-1.5"
        >
          {showDismissed ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          {showDismissed ? "Hide Dismissed" : "Show Dismissed"}
        </Button>
      </PageHeader>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="movement_detected">Movement</TabsTrigger>
          <TabsTrigger value="relationship_decay">Decay</TabsTrigger>
          <TabsTrigger value="opportunity">Opportunity</TabsTrigger>
          <TabsTrigger value="coverage_gap">Coverage</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {alertsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-72" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-base font-medium text-muted-foreground">
                  No alerts
                </p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  {showDismissed
                    ? "No alerts match your current filters"
                    : "All caught up! No active alerts to review"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="max-h-[calc(100vh-280px)]">
              <div className="space-y-3">
                {alerts.map((alert: any) => {
                  const typeConfig =
                    ALERT_TYPE_CONFIG[alert.type] ?? ALERT_TYPE_CONFIG.coverage_gap;
                  const severityConfig =
                    SEVERITY_CONFIG[alert.severity] ?? SEVERITY_CONFIG.info;
                  const TypeIcon = typeConfig.icon;
                  const SeverityIcon = severityConfig.icon;

                  return (
                    <Card
                      key={alert.id}
                      className={`transition-all ${
                        alert.isDismissed ? "opacity-60" : ""
                      }`}
                    >
                      <CardContent className="py-4">
                        <div className="flex items-start gap-3">
                          {/* Type icon */}
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-lg border shrink-0 ${typeConfig.color}`}
                          >
                            <TypeIcon className="h-4.5 w-4.5" />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium">
                                    {alert.title}
                                  </p>
                                  <SeverityIcon
                                    className={`h-3.5 w-3.5 shrink-0 ${severityConfig.color}`}
                                  />
                                </div>
                                <p className="text-sm text-muted-foreground mt-0.5">
                                  {alert.description}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-[10px] shrink-0">
                                {typeConfig.label}
                              </Badge>
                            </div>

                            {/* Suggested action */}
                            {alert.suggestedAction && (
                              <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                                <span className="font-medium">
                                  Suggested action:
                                </span>{" "}
                                {alert.suggestedAction}
                              </div>
                            )}

                            {/* Action taken note */}
                            {alert.actionTaken && alert.actionNote && (
                              <div className="mt-2 rounded-md bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                {alert.actionNote}
                              </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-2 mt-3">
                              {alert.personId && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => {
                                    window.location.href = `/persons/${alert.personId}`;
                                  }}
                                >
                                  View Person
                                  <ChevronRight className="h-3 w-3" />
                                </Button>
                              )}

                              {!alert.actionTaken && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  disabled={markActionMutation.isPending}
                                  onClick={() =>
                                    markActionMutation.mutate({
                                      id: alert.id,
                                      actionNote: "Reviewed and addressed",
                                    })
                                  }
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Mark Action Taken
                                </Button>
                              )}

                              {!alert.isDismissed && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs gap-1 text-muted-foreground"
                                  disabled={dismissMutation.isPending}
                                  onClick={() =>
                                    dismissMutation.mutate({ id: alert.id })
                                  }
                                >
                                  <X className="h-3 w-3" />
                                  Dismiss
                                </Button>
                              )}

                              <span className="ml-auto text-[10px] text-muted-foreground">
                                {alert.createdAt
                                  ? new Date(alert.createdAt).toLocaleDateString(
                                      undefined,
                                      {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      }
                                    )
                                  : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
