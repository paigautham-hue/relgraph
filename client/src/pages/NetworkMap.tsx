import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Network, ZoomIn, ZoomOut, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  label: string;
  title?: string | null;
  orgName?: string | null;
  orgId?: string | null;
  domainName?: string | null;
  domainColor?: string | null;
  type: "person" | "org";
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  personCount?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  strength: number;
  label: string;
}

// ---------------------------------------------------------------------------
// Force simulation (simple spring-based)
// ---------------------------------------------------------------------------

function runForceStep(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
) {
  const alpha = 0.3;
  const repulsionStrength = 6000;
  const attractionStrength = 0.005;
  const damping = 0.7;
  const centerGravity = 0.01;

  // Repulsion between all nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const force = (repulsionStrength / (dist * dist)) * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  // Attraction along edges
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const a = nodeMap.get(edge.source);
    const b = nodeMap.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const force = dist * attractionStrength * (edge.strength / 50) * alpha;
    const fx = (dx / dist || 0) * force;
    const fy = (dy / dist || 0) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  // Center gravity
  const cx = width / 2;
  const cy = height / 2;
  for (const n of nodes) {
    n.vx += (cx - n.x) * centerGravity * alpha;
    n.vy += (cy - n.y) * centerGravity * alpha;
  }

  // Apply velocity & damping
  for (const n of nodes) {
    n.vx *= damping;
    n.vy *= damping;
    n.x += n.vx;
    n.y += n.vy;
    // Clamp to bounds
    const pad = n.radius + 10;
    n.x = Math.max(pad, Math.min(width - pad, n.x));
    n.y = Math.max(pad, Math.min(height - pad, n.y));
  }
}

// ---------------------------------------------------------------------------
// Strength color
// ---------------------------------------------------------------------------

function strengthColor(score: number): string {
  if (score <= 20) return "var(--strength-dormant, #94a3b8)";
  if (score <= 40) return "var(--strength-acquaintance, #60a5fa)";
  if (score <= 60) return "var(--strength-active, #34d399)";
  if (score <= 80) return "var(--strength-strong, #fbbf24)";
  return "var(--strength-champion, #f97316)";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NetworkMap() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  const [dimensions, setDimensions] = useState({ width: 900, height: 600 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, px: 0, py: 0 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [strengthRange, setStrengthRange] = useState([0, 100]);
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [, forceRender] = useState(0);

  // Data queries
  const personsQuery = trpc.persons.list.useQuery(
    { page: 1, pageSize: 500 },
    { refetchOnWindowFocus: false }
  );
  const relsQuery = trpc.relationships.list.useQuery(
    { page: 1, pageSize: 1000 },
    { refetchOnWindowFocus: false }
  );
  const domainsQuery = trpc.domains.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const loading = personsQuery.isLoading || relsQuery.isLoading;

  // Build graph data
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);

  const domainList = useMemo(() => {
    const data = domainsQuery.data;
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if ("data" in data && Array.isArray((data as any).data)) return (data as any).data;
    return [];
  }, [domainsQuery.data]);

  useEffect(() => {
    const personData = personsQuery.data;
    const relData = relsQuery.data;
    if (!personData || !relData) return;

    const personList = Array.isArray(personData)
      ? personData
      : "data" in personData
        ? (personData as any).data
        : [];
    const relList = Array.isArray(relData)
      ? relData
      : "data" in relData
        ? (relData as any).data
        : [];

    // Reuse existing positions if nodes already exist
    const existingPositions = new Map(nodesRef.current.map((n) => [n.id, { x: n.x, y: n.y }]));

    const nodes: GraphNode[] = personList.map((p: any) => {
      const existing = existingPositions.get(p.id);
      return {
        id: p.id,
        label: p.name,
        title: p.currentTitle ?? p.title,
        orgName: p.orgName,
        orgId: p.currentOrgId ?? p.orgId,
        domainName: p.domainName,
        domainColor: null,
        type: "person" as const,
        x: existing?.x ?? dimensions.width * 0.2 + Math.random() * dimensions.width * 0.6,
        y: existing?.y ?? dimensions.height * 0.2 + Math.random() * dimensions.height * 0.6,
        vx: 0,
        vy: 0,
        radius: 8,
      };
    });

    const edges: GraphEdge[] = relList.map((r: any) => ({
      source: r.sourcePersonId,
      target: r.targetPersonId,
      strength: r.strengthScore ?? 50,
      label: r.strengthLabel ?? "active",
    }));

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [personsQuery.data, relsQuery.data, dimensions.width, dimensions.height]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width: Math.max(400, width), height: Math.max(300, height) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Force simulation loop
  useEffect(() => {
    let running = true;
    let ticks = 0;
    const maxTicks = 300;

    function step() {
      if (!running) return;
      if (nodesRef.current.length > 0 && ticks < maxTicks) {
        runForceStep(nodesRef.current, edgesRef.current, dimensions.width, dimensions.height);
        ticks++;
        forceRender((v) => v + 1);
      }
      animRef.current = requestAnimationFrame(step);
    }
    animRef.current = requestAnimationFrame(step);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [dimensions.width, dimensions.height, personsQuery.data, relsQuery.data]);

  // Filtered data
  const filteredNodes = useMemo(() => {
    return nodesRef.current.filter((n) => {
      if (domainFilter !== "all" && n.domainName !== domainFilter) return false;
      return true;
    });
  }, [domainFilter, nodesRef.current.length, forceRender]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const filteredEdges = useMemo(() => {
    return edgesRef.current.filter((e) => {
      if (!filteredNodeIds.has(e.source) || !filteredNodeIds.has(e.target)) return false;
      if (e.strength < strengthRange[0] || e.strength > strengthRange[1]) return false;
      return true;
    });
  }, [filteredNodeIds, strengthRange, edgesRef.current.length]);

  const nodeMap = useMemo(
    () => new Map(nodesRef.current.map((n) => [n.id, n])),
    [nodesRef.current.length, forceRender]
  );

  // Event handlers
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (dragNode) return;
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY, px: pan.x, py: pan.y });
    },
    [dragNode, pan.x, pan.y]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragNode) {
        const svgEl = svgRef.current;
        if (!svgEl) return;
        const rect = svgEl.getBoundingClientRect();
        const x = (e.clientX - rect.left - pan.x) / zoom;
        const y = (e.clientY - rect.top - pan.y) / zoom;
        const node = nodesRef.current.find((n) => n.id === dragNode);
        if (node) {
          node.x = x;
          node.y = y;
          node.vx = 0;
          node.vy = 0;
          forceRender((v) => v + 1);
        }
        return;
      }
      if (!isPanning) return;
      setPan({
        x: panStart.px + (e.clientX - panStart.x),
        y: panStart.py + (e.clientY - panStart.y),
      });
    },
    [isPanning, panStart, dragNode, zoom, pan.x, pan.y]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setDragNode(null);
  }, []);

  const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDragNode(nodeId);
  }, []);

  const handleNodeClick = useCallback(
    (e: React.MouseEvent, node: GraphNode) => {
      e.stopPropagation();
      if (!dragNode) {
        setSelectedNode((prev) => (prev?.id === node.id ? null : node));
      }
    },
    [dragNode]
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Domain color map
  const domainColors = useMemo(() => {
    const palette = [
      "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
      "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
    ];
    const map = new Map<string, string>();
    const names = Array.from(new Set(nodesRef.current.map((n) => n.domainName).filter(Boolean)));
    names.forEach((name, i) => {
      map.set(name!, palette[i % palette.length]);
    });
    return map;
  }, [nodesRef.current.length]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Network Map" subtitle="Visualize your relationship network" />
        <Skeleton className="h-[600px] w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Network Map" subtitle="Visualize your relationship network">
        <div className="flex items-center gap-2">
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Domains" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {domainList.map((d: any) => (
                <SelectItem key={d.id} value={d.name}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      {/* Strength range filter */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Strength: {strengthRange[0]} - {strengthRange[1]}
            </span>
            <Slider
              min={0}
              max={100}
              step={5}
              value={strengthRange}
              onValueChange={setStrengthRange}
              className="flex-1 max-w-xs"
            />
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(3, z * 1.2))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={resetView}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Graph Canvas */}
      <Card className="overflow-hidden">
        <div
          ref={containerRef}
          className="relative h-[600px] bg-muted/30 cursor-grab active:cursor-grabbing select-none"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {filteredNodes.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Network className="h-12 w-12 opacity-40" />
              <p className="text-sm">No network data to display</p>
              <p className="text-xs opacity-60">Add people and relationships to see the graph</p>
            </div>
          ) : (
            <svg
              ref={svgRef}
              width={dimensions.width}
              height={dimensions.height}
              className="w-full h-full"
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            >
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                {/* Edges */}
                {filteredEdges.map((edge, i) => {
                  const s = nodeMap.get(edge.source);
                  const t = nodeMap.get(edge.target);
                  if (!s || !t) return null;
                  const thickness = Math.max(1, (edge.strength / 100) * 4);
                  return (
                    <line
                      key={`edge-${i}`}
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke={strengthColor(edge.strength)}
                      strokeWidth={thickness}
                      strokeOpacity={0.5}
                    />
                  );
                })}

                {/* Nodes */}
                {filteredNodes.map((node) => {
                  const color = domainColors.get(node.domainName ?? "") ?? "#6366f1";
                  const isSelected = selectedNode?.id === node.id;
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${node.x}, ${node.y})`}
                      onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                      onClick={(e) => handleNodeClick(e, node)}
                      className="cursor-pointer"
                    >
                      {/* Selection ring */}
                      {isSelected && (
                        <circle
                          r={node.radius + 4}
                          fill="none"
                          stroke="var(--primary)"
                          strokeWidth={2}
                          strokeDasharray="3 2"
                        />
                      )}
                      {/* Node circle */}
                      <circle
                        r={node.radius}
                        fill={color}
                        stroke="var(--background)"
                        strokeWidth={2}
                        opacity={0.9}
                      />
                      {/* Label */}
                      <text
                        y={node.radius + 12}
                        textAnchor="middle"
                        className="fill-foreground text-[10px] font-medium pointer-events-none"
                        style={{ paintOrder: "stroke", stroke: "var(--background)", strokeWidth: 3 }}
                      >
                        {node.label.length > 16
                          ? node.label.slice(0, 14) + "..."
                          : node.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          )}

          {/* Legend */}
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
            {Array.from(domainColors.entries()).map(([name, color]) => (
              <div
                key={name}
                className="flex items-center gap-1.5 rounded-full bg-background/80 backdrop-blur-sm px-2 py-1 text-xs border"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                {name}
              </div>
            ))}
          </div>

          {/* Selected node detail panel */}
          {selectedNode && (
            <div className="absolute top-3 right-3 w-64 rounded-lg border bg-card p-4 shadow-lg">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="font-medium truncate">{selectedNode.label}</p>
                  {selectedNode.title && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {selectedNode.title}
                    </p>
                  )}
                  {selectedNode.orgName && (
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedNode.orgName}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => setSelectedNode(null)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              {selectedNode.domainName && (
                <Badge variant="secondary" className="mt-2 text-[10px]">
                  {selectedNode.domainName}
                </Badge>
              )}
              {/* Connections for selected node */}
              <div className="mt-3 border-t pt-2">
                <p className="text-xs font-medium mb-1.5">Connections</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {filteredEdges
                    .filter(
                      (e) =>
                        e.source === selectedNode.id ||
                        e.target === selectedNode.id
                    )
                    .sort((a, b) => b.strength - a.strength)
                    .slice(0, 10)
                    .map((edge, i) => {
                      const otherId =
                        edge.source === selectedNode.id
                          ? edge.target
                          : edge.source;
                      const other = nodeMap.get(otherId);
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="truncate">
                            {other?.label ?? "Unknown"}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] shrink-0 ml-2"
                            style={{
                              borderColor: strengthColor(edge.strength),
                              color: strengthColor(edge.strength),
                            }}
                          >
                            {edge.strength}
                          </Badge>
                        </div>
                      );
                    })}
                </div>
              </div>
              <Button
                variant="link"
                size="sm"
                className="mt-2 h-auto p-0 text-xs"
                onClick={() => {
                  window.location.href = `/persons/${selectedNode.id}`;
                }}
              >
                View full profile
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Stats bar */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{filteredNodes.length} people</span>
        <span className="text-border">|</span>
        <span>{filteredEdges.length} relationships</span>
        <span className="text-border">|</span>
        <span>Zoom: {Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
}
