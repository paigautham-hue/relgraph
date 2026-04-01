import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Search, Route, User, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";

function strengthColor(score: number): string {
  if (score <= 20) return "text-slate-400 border-slate-300 bg-slate-50";
  if (score <= 40) return "text-blue-500 border-blue-300 bg-blue-50";
  if (score <= 60) return "text-emerald-500 border-emerald-300 bg-emerald-50";
  if (score <= 80) return "text-amber-500 border-amber-300 bg-amber-50";
  return "text-orange-500 border-orange-300 bg-orange-50";
}

function strengthLabel(score: number): string {
  if (score <= 20) return "dormant";
  if (score <= 40) return "acquaintance";
  if (score <= 60) return "active";
  if (score <= 80) return "strong";
  return "champion";
}

export default function PathFinder() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Person autocomplete
  const personsQuery = trpc.persons.list.useQuery(
    { page: 1, pageSize: 20, search: searchTerm },
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

  // Path query
  const pathQuery = trpc.search.findPath.useQuery(
    { targetPersonId: selectedPerson?.id ?? "", maxHops: 4 },
    {
      enabled: !!selectedPerson,
      refetchOnWindowFocus: false,
    }
  );

  const handleSelectPerson = (person: any) => {
    setSelectedPerson({ id: person.id, name: person.name });
    setSearchTerm(person.name);
    setShowDropdown(false);
  };

  const handleClear = () => {
    setSelectedPerson(null);
    setSearchTerm("");
    setShowDropdown(false);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Path Finder"
        subtitle="Discover the warmest connection paths to any contact"
      />

      {/* Search */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search for a person..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowDropdown(true);
                  if (selectedPerson) setSelectedPerson(null);
                }}
                onFocus={() => {
                  if (searchTerm.length >= 2 && !selectedPerson)
                    setShowDropdown(true);
                }}
                className="pl-9"
              />

              {/* Autocomplete dropdown */}
              {showDropdown && searchTerm.length >= 2 && !selectedPerson && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover shadow-lg">
                  {personsQuery.isLoading ? (
                    <div className="p-3 space-y-2">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : personResults.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">
                      No people found
                    </div>
                  ) : (
                    <ScrollArea className="max-h-60">
                      {personResults.map((p: any) => (
                        <button
                          key={p.id}
                          onClick={() => handleSelectPerson(p)}
                          className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-accent transition-colors"
                        >
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted shrink-0">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
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
                        </button>
                      ))}
                    </ScrollArea>
                  )}
                </div>
              )}
            </div>

            {selectedPerson && (
              <Badge variant="secondary" className="gap-1.5 py-1.5 pr-1">
                <User className="h-3 w-3" />
                {selectedPerson.name}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 ml-1 rounded-full hover:bg-destructive/10"
                  onClick={handleClear}
                >
                  <span className="text-xs">&times;</span>
                </Button>
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {selectedPerson && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-medium">
              Paths to {selectedPerson.name}
            </h2>
          </div>

          {pathQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="py-4">
                    <Skeleton className="h-12 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : pathQuery.data && pathQuery.data.length > 0 ? (
            <div className="space-y-3">
              {pathQuery.data.map((pathResult: any, pathIdx: number) => (
                <Card key={pathIdx} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge
                        variant="outline"
                        className={strengthColor(pathResult.minStrength)}
                      >
                        Warmest bottleneck: {pathResult.minStrength} (
                        {strengthLabel(pathResult.minStrength)})
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {pathResult.path.length - 1} hop
                        {pathResult.path.length - 1 !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {/* Path chain */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1">
                      {pathResult.path.map(
                        (
                          node: { id: string; name: string },
                          nodeIdx: number
                        ) => (
                          <div
                            key={node.id}
                            className="flex items-center gap-1 shrink-0"
                          >
                            {/* Node */}
                            <button
                              onClick={() => {
                                window.location.href = `/persons/${node.id}`;
                              }}
                              className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 hover:bg-accent transition-colors"
                            >
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                                <User className="h-3 w-3 text-primary" />
                              </div>
                              <span className="text-sm font-medium whitespace-nowrap">
                                {node.name}
                              </span>
                            </button>

                            {/* Arrow between nodes */}
                            {nodeIdx < pathResult.path.length - 1 && (
                              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mx-0.5" />
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Route className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  No connection paths found
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Try searching for someone else or add more relationships to
                  the graph
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Empty state when no person selected */}
      {!selectedPerson && (
        <Card>
          <CardContent className="py-16 text-center">
            <Route className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-base font-medium text-muted-foreground">
              Find the warmest path to anyone
            </p>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm mx-auto">
              Search for a person above to discover connection paths ranked by
              their strongest link
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
