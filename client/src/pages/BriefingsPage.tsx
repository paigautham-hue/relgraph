import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Loader2,
  Plus,
  Search,
  User,
  ChevronRight,
  Calendar,
  Clock,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Simple markdown renderer (no external dependency)
// ---------------------------------------------------------------------------

function renderMarkdown(md: string) {
  const lines = md.split("\n");
  const elements: React.ReactNode[] = [];
  let inList = false;
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc pl-6 space-y-1 my-2">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed">
              {formatInline(item)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  const formatInline = (text: string): React.ReactNode => {
    // Bold
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <strong key={i} className="font-semibold">
          {part}
        </strong>
      ) : (
        part
      )
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headings
    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={i} className="text-base font-semibold mt-5 mb-2 first:mt-0">
          {line.slice(3)}
        </h2>
      );
      continue;
    }
    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={i} className="text-sm font-semibold mt-4 mb-1.5">
          {line.slice(4)}
        </h3>
      );
      continue;
    }

    // List items
    if (line.match(/^[-*]\s/)) {
      inList = true;
      listItems.push(line.replace(/^[-*]\s/, ""));
      continue;
    }

    // Numbered list items
    if (line.match(/^\d+\.\s/)) {
      flushList();
      elements.push(
        <p key={i} className="text-sm leading-relaxed pl-4 my-0.5">
          {formatInline(line)}
        </p>
      );
      continue;
    }

    // Horizontal rule
    if (line.match(/^---+$/)) {
      flushList();
      elements.push(<Separator key={i} className="my-4" />);
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={i} className="text-sm leading-relaxed my-1.5">
        {formatInline(line)}
      </p>
    );
  }
  flushList();

  return elements;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BriefingsPage() {
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedBriefing, setSelectedBriefing] = useState<any>(null);

  // Briefings list
  const briefingsQuery = trpc.briefings.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // Person autocomplete for generation
  const personsQuery = trpc.persons.list.useQuery(
    { page: 1, pageSize: 15, search: searchTerm },
    {
      enabled: searchTerm.length >= 2,
      refetchOnWindowFocus: false,
    }
  );

  const personResults = useMemo(() => {
    const data = personsQuery.data;
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if ("data" in data && Array.isArray((data as any).data))
      return (data as any).data;
    return [];
  }, [personsQuery.data]);

  // Generate briefing mutation
  const generateMutation = trpc.briefings.generate.useMutation({
    onSuccess: (data) => {
      setGenerateDialogOpen(false);
      setSearchTerm("");
      briefingsQuery.refetch();
      // Show the generated briefing
      setSelectedBriefing({
        content: data.content,
        personName: "Generated",
        createdAt: new Date().toISOString(),
      });
    },
  });

  const handleGenerate = (personId: string) => {
    generateMutation.mutate({ personId });
  };

  const briefings = briefingsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Briefings" subtitle="AI-generated pre-meeting intelligence">
        <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Generate Briefing
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Generate Pre-Meeting Briefing
              </DialogTitle>
              <DialogDescription>
                Search for a person to generate a comprehensive AI briefing with
                relationship history, intel, and strategic recommendations.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search for a person..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowDropdown(true);
                  }}
                  className="pl-9"
                  disabled={generateMutation.isPending}
                />
              </div>

              {/* Autocomplete results */}
              {showDropdown && searchTerm.length >= 2 && (
                <div className="mt-2 rounded-md border max-h-64 overflow-y-auto">
                  {personsQuery.isLoading ? (
                    <div className="p-3 space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ) : personResults.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No people found
                    </div>
                  ) : (
                    personResults.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => handleGenerate(p.id)}
                        disabled={generateMutation.isPending}
                        className="flex items-center justify-between w-full px-3 py-3 text-left hover:bg-accent transition-colors border-b last:border-b-0 disabled:opacity-50"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted shrink-0">
                            <User className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {p.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {p.currentTitle ?? p.title ?? ""}{" "}
                              {p.orgName ? `at ${p.orgName}` : ""}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Loading state during generation */}
              {generateMutation.isPending && (
                <div className="mt-4 flex flex-col items-center gap-3 py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <div className="text-center">
                    <p className="text-sm font-medium">Generating briefing...</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Analyzing relationships, interactions, and intel
                    </p>
                  </div>
                </div>
              )}

              {/* Error state */}
              {generateMutation.isError && (
                <div className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {generateMutation.error?.message ?? "Failed to generate briefing"}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Briefings list */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Recent Briefings
          </h3>

          {briefingsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="py-3">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-48" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : briefings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No briefings generated yet
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Click "Generate Briefing" to create your first one
                </p>
              </CardContent>
            </Card>
          ) : (
            <ScrollArea className="max-h-[calc(100vh-250px)]">
              <div className="space-y-2">
                {briefings.map((b: any) => {
                  const isSelected = selectedBriefing?.id === b.id;
                  const preview = b.content
                    ? b.content.replace(/[#*_\[\]]/g, "").slice(0, 120) + "..."
                    : "";
                  const sourcesUsed = b.sourcesUsed as any;

                  return (
                    <Card
                      key={b.id}
                      className={`cursor-pointer transition-all hover:shadow-sm ${
                        isSelected ? "ring-2 ring-primary" : ""
                      }`}
                      onClick={() => setSelectedBriefing(b)}
                    >
                      <CardContent className="py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {b.personName ?? "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {b.createdAt
                                ? new Date(b.createdAt).toLocaleDateString(
                                    undefined,
                                    {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    }
                                  )
                                : ""}
                            </p>
                          </div>
                          {b.generatedByName && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] shrink-0"
                            >
                              {b.generatedByName}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {preview}
                        </p>
                        {sourcesUsed && (
                          <div className="flex items-center gap-2 mt-2">
                            {sourcesUsed.intel > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {sourcesUsed.intel} intel
                              </span>
                            )}
                            {sourcesUsed.reflections > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {sourcesUsed.reflections} reflections
                              </span>
                            )}
                            {sourcesUsed.interactions > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                {sourcesUsed.interactions} interactions
                              </span>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Briefing content viewer */}
        <div className="lg:col-span-3">
          {selectedBriefing ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Briefing: {selectedBriefing.personName ?? "Contact"}
                  </CardTitle>
                  {selectedBriefing.createdAt && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(selectedBriefing.createdAt).toLocaleDateString(
                        undefined,
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </span>
                  )}
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <ScrollArea className="max-h-[calc(100vh-320px)]">
                  <div className="pr-4">
                    {selectedBriefing.content
                      ? renderMarkdown(selectedBriefing.content)
                      : (
                        <p className="text-sm text-muted-foreground">
                          No content available
                        </p>
                      )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-20 text-center">
                <FileText className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-base font-medium text-muted-foreground">
                  Select a briefing to view
                </p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Choose from the list or generate a new one
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
