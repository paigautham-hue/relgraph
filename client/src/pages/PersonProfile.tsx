import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { AvatarInitials } from "@/components/common/AvatarInitials";
import { DomainBadge } from "@/components/common/DomainBadge";
import { StrengthMeter } from "@/components/common/StrengthMeter";
import { InputMethodBadge } from "@/components/common/InputMethodBadge";
import { FieldHistoryDialog } from "@/components/intel/FieldHistoryDialog";
import { ReflectionForm } from "@/components/reflections/ReflectionForm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Calendar,
  Clock,
  FileText,
  Handshake,
  Info,
  Lightbulb,
  MessageSquare,
  Pencil,
  Plus,
  Shield,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

// ---------- helpers ----------
function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ---------- sub-components ----------

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      <Skeleton className="h-10 w-full max-w-lg" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

function EmptyTab({
  icon: Icon,
  message,
}: {
  icon: React.ElementType;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--relgraph-primary-light)]">
          <Icon className="h-5 w-5 text-[var(--relgraph-primary)]" />
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Tab content components ----------

function OverviewTab({
  personId,
  relationshipCount,
  interactionCount,
  intelCount,
}: {
  personId: string;
  relationshipCount: number;
  interactionCount: number;
  intelCount: number;
}) {
  const interactionsQuery = trpc.interactions.list.useQuery(
    { personId },
    { refetchOnWindowFocus: false }
  );
  const recentInteractions = ((interactionsQuery.data as any) ?? []).slice(
    0,
    5
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Relationships"
          value={relationshipCount}
          icon={Handshake}
        />
        <StatCard
          label="Interactions"
          value={interactionCount}
          icon={MessageSquare}
        />
        <StatCard label="Intel Items" value={intelCount} icon={Lightbulb} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Interactions</CardTitle>
        </CardHeader>
        <CardContent>
          {interactionsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : recentInteractions.length === 0 ? (
            <EmptyTab
              icon={MessageSquare}
              message="No interactions recorded yet"
            />
          ) : (
            <div className="space-y-3">
              {recentInteractions.map((interaction: any) => (
                <div
                  key={interaction.id}
                  className="flex items-start gap-3 rounded-lg p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {interaction.type ?? "meeting"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(interaction.date)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {interaction.summary || "No summary"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CareerTab({ personId }: { personId: string }) {
  const tenuresQuery = trpc.tenures.list.useQuery(
    { personId },
    { refetchOnWindowFocus: false }
  );
  const tenures = (tenuresQuery.data as any) ?? [];

  if (tenuresQuery.isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (tenures.length === 0) {
    return <EmptyTab icon={Briefcase} message="No career history recorded" />;
  }

  return (
    <div className="relative ml-4 border-l-2 border-border pl-6 space-y-8">
      {tenures.map((tenure: any, index: number) => (
        <div key={tenure.id ?? index} className="relative">
          {/* Timeline dot */}
          <div className="absolute -left-[calc(1.5rem+5px)] top-1 h-3 w-3 rounded-full border-2 border-[var(--relgraph-primary)] bg-background" />

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <AvatarInitials
                name={tenure.organization?.name ?? "?"}
                size="sm"
              />
              <div>
                <p className="font-medium text-sm">
                  {tenure.title ?? "Unknown Role"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {tenure.organization?.name ?? "Unknown Organization"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {formatDate(tenure.startDate)} -{" "}
                {tenure.endDate ? formatDate(tenure.endDate) : "Present"}
              </span>
            </div>
            {tenure.notes && (
              <p className="text-sm text-muted-foreground mt-1">
                {tenure.notes}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RelationshipsTab({ personId }: { personId: string }) {
  const relQuery = trpc.relationships.list.useQuery(
    { personId },
    { refetchOnWindowFocus: false }
  );
  const relationships = (relQuery.data as any) ?? [];

  if (relQuery.isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (relationships.length === 0) {
    return <EmptyTab icon={Users} message="No relationships mapped yet" />;
  }

  return (
    <div className="space-y-3">
      {relationships.map((rel: any) => {
        const otherPerson = rel.targetPerson ?? rel.sourcePerson ?? {};
        const otherName = [otherPerson.firstName, otherPerson.lastName]
          .filter(Boolean)
          .join(" ") || "Unknown";

        return (
          <Card key={rel.id}>
            <CardContent className="flex items-center gap-4 p-4">
              <AvatarInitials name={otherName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">{otherName}</p>
                <p className="text-xs text-muted-foreground">
                  {rel.type ?? "connection"} - {otherPerson.title ?? ""}
                </p>
              </div>
              <div className="w-40 shrink-0">
                <StrengthMeter score={rel.strength ?? 0} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function InteractionsTab({ personId }: { personId: string }) {
  const interactionsQuery = trpc.interactions.list.useQuery(
    { personId },
    { refetchOnWindowFocus: false }
  );
  const interactions = (interactionsQuery.data as any) ?? [];

  if (interactionsQuery.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (interactions.length === 0) {
    return (
      <EmptyTab icon={MessageSquare} message="No interactions recorded yet" />
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="hidden md:table-cell">Summary</TableHead>
            <TableHead className="hidden lg:table-cell">
              Participants
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {interactions.map((interaction: any) => (
            <TableRow key={interaction.id}>
              <TableCell>
                <Badge variant="secondary">{interaction.type ?? "-"}</Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {formatDate(interaction.date)}
              </TableCell>
              <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-xs truncate">
                {interaction.summary || "-"}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                {interaction.participants?.length
                  ? `${interaction.participants.length} people`
                  : "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string | null | undefined }) {
  if (!level) return null;
  const colors: Record<string, string> = {
    low: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    high: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  };
  return (
    <Badge
      variant="secondary"
      className={`text-[10px] px-1.5 py-0 ${colors[level] ?? ""}`}
    >
      {level}
    </Badge>
  );
}

function ReflectionsTab({ personId }: { personId: string }) {
  const [showForm, setShowForm] = useState(false);

  const reflectionsQuery = trpc.reflections.list.useQuery(
    { personId },
    { refetchOnWindowFocus: false }
  );
  const reflectionsData = reflectionsQuery.data;
  const reflections = reflectionsData?.data ?? [];

  if (reflectionsQuery.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  // Group by category
  const grouped = reflections.reduce((acc: Record<string, any[]>, r: any) => {
    const cat = r.category ?? "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {} as Record<string, any[]>);

  const categoryLabels: Record<string, string> = {
    strategic_read: "Strategic Read",
    personality: "Personality",
    network_dynamics: "Network Dynamics",
    risk_concern: "Risk / Concern",
    opportunity: "Opportunity",
    communication_style: "Communication Style",
    motivations: "Motivations",
    general: "General",
  };

  return (
    <>
      <div className="space-y-6">
        {/* Add Reflection button */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(true)}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Reflection
          </Button>
        </div>

        {reflections.length === 0 ? (
          <EmptyTab icon={Pencil} message="No reflections recorded yet" />
        ) : (
          Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {categoryLabels[category] ?? category.replace(/_/g, " ")}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {(items as any[]).map((reflection: any) => (
                  <Card key={reflection.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <ConfidenceBadge level={reflection.confidenceLevel} />
                          {reflection.inputMethod && (
                            <InputMethodBadge
                              method={reflection.inputMethod}
                              showLabel={false}
                            />
                          )}
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed">
                        {reflection.content}
                      </p>
                      {reflection.confidenceBasis && (
                        <p className="mt-1.5 text-xs text-muted-foreground italic">
                          Basis: {reflection.confidenceBasis}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        {reflection.authorName && (
                          <>
                            <AvatarInitials
                              name={reflection.authorName ?? "?"}
                              size="sm"
                            />
                            <span className="text-xs text-muted-foreground">
                              {reflection.authorName}
                            </span>
                          </>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDate(reflection.createdAt)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Reflection Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Reflection</DialogTitle>
          </DialogHeader>
          <ReflectionForm
            personId={personId}
            onSuccess={() => setShowForm(false)}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function IntelTab({ personId }: { personId: string }) {
  const [historyField, setHistoryField] = useState<string | null>(null);

  const intelQuery = trpc.intel.list.useQuery(
    { personId },
    { refetchOnWindowFocus: false }
  );
  const intelData = intelQuery.data;
  const intelItems = intelData?.data ?? [];

  if (intelQuery.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (intelItems.length === 0) {
    return <EmptyTab icon={Lightbulb} message="No intel gathered yet" />;
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {intelItems.map((intel: any) => (
          <Card key={intel.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {intel.fieldName ?? intel.field ?? "Info"}
                    </p>
                    {intel.inputMethod && (
                      <InputMethodBadge method={intel.inputMethod} showLabel={false} />
                    )}
                  </div>
                  <p className="mt-1 text-sm">{intel.fieldValue ?? intel.value ?? "-"}</p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() =>
                        setHistoryField(intel.fieldName ?? intel.field ?? null)
                      }
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>View history</TooltipContent>
                </Tooltip>
              </div>

              {/* Provenance info */}
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                {intel.personName && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default">
                        by {intel.personName}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Contributed by {intel.personName} on{" "}
                      {formatDate(intel.createdAt)}
                    </TooltipContent>
                  </Tooltip>
                )}
                {intel.sourceUrl && (
                  <>
                    <span className="text-border">|</span>
                    <a
                      href={intel.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--relgraph-primary)] hover:underline"
                    >
                      Source
                    </a>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Field History Dialog */}
      <FieldHistoryDialog
        open={!!historyField}
        onOpenChange={(open) => {
          if (!open) setHistoryField(null);
        }}
        personId={personId}
        fieldName={historyField ?? ""}
      />
    </>
  );
}

function NotesTab({ personId }: { personId: string }) {
  const notesQuery = trpc.notes.list.useQuery(
    { personId },
    { refetchOnWindowFocus: false }
  );
  const notes = (notesQuery.data as any) ?? [];

  if (notesQuery.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return <EmptyTab icon={FileText} message="No notes added yet" />;
  }

  return (
    <div className="space-y-3">
      {notes.map((note: any) => (
        <Card key={note.id}>
          <CardContent className="p-4">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {note.content}
            </p>
            <Separator className="my-3" />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                {note.author && (
                  <>
                    <AvatarInitials
                      name={note.author.name ?? "?"}
                      size="sm"
                    />
                    <span>{note.author.name}</span>
                  </>
                )}
              </div>
              <span>{formatDate(note.createdAt)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------- Main Component ----------

export default function PersonProfile() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const personId = params.id ?? "";

  const personQuery = trpc.persons.getById.useQuery(
    { id: personId },
    { enabled: !!personId, refetchOnWindowFocus: false }
  );

  const relQuery = trpc.relationships.list.useQuery(
    { personId },
    { enabled: !!personId, refetchOnWindowFocus: false }
  );
  const interactionsQuery = trpc.interactions.list.useQuery(
    { personId },
    { enabled: !!personId, refetchOnWindowFocus: false }
  );
  const intelQuery = trpc.intel.list.useQuery(
    { personId },
    { enabled: !!personId, refetchOnWindowFocus: false }
  );

  const person = personQuery.data as any;
  const loading = personQuery.isLoading;

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!person) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Info className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-medium">Person not found</h2>
        <p className="text-sm text-muted-foreground mt-1">
          This contact may have been removed or you may not have access.
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => navigate("/persons")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to People
        </Button>
      </div>
    );
  }

  const fullName = [person.firstName, person.lastName]
    .filter(Boolean)
    .join(" ");
  const relationshipCount = ((relQuery.data as any) ?? []).length;
  const interactionCount = ((interactionsQuery.data as any) ?? []).length;
  const intelCount = ((intelQuery.data as any) ?? []).length;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground -ml-2"
        onClick={() => navigate("/persons")}
      >
        <ArrowLeft className="mr-1 h-4 w-4" />
        People
      </Button>

      {/* Profile Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <AvatarInitials name={fullName} size="xl" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{fullName}</h1>
          {person.title && (
            <p className="text-muted-foreground">{person.title}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {person.organization && (
              <Badge variant="secondary" className="gap-1">
                <Building2 className="h-3 w-3" />
                {person.organization.name}
              </Badge>
            )}
            {person.domain && (
              <DomainBadge
                name={person.domain.name}
                color={person.domain.color || "#888"}
              />
            )}
            {person.tracked && (
              <Badge className="bg-[var(--relgraph-primary)] hover:bg-[var(--relgraph-primary)] gap-1">
                <Shield className="h-3 w-3" />
                Tracked
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="career">Career</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="interactions">Interactions</TabsTrigger>
          <TabsTrigger value="reflections">Reflections</TabsTrigger>
          <TabsTrigger value="intel">Intel</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            personId={personId}
            relationshipCount={relationshipCount}
            interactionCount={interactionCount}
            intelCount={intelCount}
          />
        </TabsContent>

        <TabsContent value="career">
          <CareerTab personId={personId} />
        </TabsContent>

        <TabsContent value="relationships">
          <RelationshipsTab personId={personId} />
        </TabsContent>

        <TabsContent value="interactions">
          <InteractionsTab personId={personId} />
        </TabsContent>

        <TabsContent value="reflections">
          <ReflectionsTab personId={personId} />
        </TabsContent>

        <TabsContent value="intel">
          <IntelTab personId={personId} />
        </TabsContent>

        <TabsContent value="notes">
          <NotesTab personId={personId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
