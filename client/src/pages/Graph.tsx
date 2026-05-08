/**
 * Graph — single navigable space for People / Organizations / Paths /
 * Network. Filter chips at the top route to existing pages without
 * forcing a sidebar shuffle.
 *
 * Per Rule 3 #1 (one job per surface): "who do I need?" The chips are
 * filters, not separate pages. PathFinder, NetworkMap, PersonList,
 * OrganizationList all remain mounted at their original routes for
 * deep-linking, but Graph is the canonical entry point now.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import PersonList from "./PersonList";
import OrganizationList from "./OrganizationList";
import NetworkMap from "./NetworkMap";
import PathFinder from "./PathFinder";
import { Building2, Network, Target, Users } from "lucide-react";

type Lens = "people" | "orgs" | "network" | "paths";

const LENSES: Array<{ key: Lens; label: string; icon: typeof Users; description: string }> = [
  { key: "people", label: "People", icon: Users, description: "Browse and search the contact graph" },
  { key: "orgs", label: "Organizations", icon: Building2, description: "Banks, regulators, ministries, DFIs" },
  { key: "network", label: "Network", icon: Network, description: "Force-directed map of connections" },
  { key: "paths", label: "Paths", icon: Target, description: "Compute the route between two people" },
];

export default function GraphPage() {
  const [, setLocation] = useLocation();
  const [active, setActive] = useState<Lens>("people");

  const ActivePage =
    active === "people" ? PersonList :
    active === "orgs" ? OrganizationList :
    active === "network" ? NetworkMap :
    PathFinder;

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Graph</h1>
        <p className="text-sm text-muted-foreground">
          One navigable space for everyone and everything in your network.
        </p>
      </div>

      <nav
        aria-label="Graph view"
        className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-1.5"
      >
        {LENSES.map((l) => {
          const Icon = l.icon;
          const isActive = active === l.key;
          return (
            <Button
              key={l.key}
              type="button"
              variant={isActive ? "default" : "ghost"}
              size="sm"
              onClick={() => setActive(l.key)}
              className={`h-9 gap-1.5 ${isActive ? "" : "text-muted-foreground hover:text-foreground"}`}
              aria-pressed={isActive}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {l.label}
            </Button>
          );
        })}
      </nav>

      <div className="rounded-xl border bg-background">
        <div className="p-4 md:p-6">
          {/* Each existing page renders its own internal layout. We mount the
              active one. They retain their existing routes (/persons, etc.)
              for deep linking — Graph is the unified entry. */}
          <ActivePage />
        </div>
      </div>
    </div>
  );
}
