/**
 * Repository structure sanity check.
 *
 * Verifies the load-bearing scaffolding that CLAUDE.md's handoff standard
 * promises (pnpm install / dev / build all work, structure is intelligible
 * to another agent). Refreshed 2026-05-11 — the original starter-template
 * list checked for components/layout, components/network, components/person,
 * components/alerts, components/admin, components/shared, server/routes
 * which don't exist in the current architecture (we collapsed several of
 * those during the Today/Graph IA refactor in Week 3).
 *
 * What we check now:
 *   1. Core entry points + config (server/index.ts, vite.config.ts, etc.)
 *   2. The required top-level folders per CLAUDE.md ("client/ — frontend
 *      source", "server/ — Express backend + API routes", "shared/ — types,
 *      constants, validation").
 *   3. Each shipped strategic feature has its router + (where applicable)
 *      its page so silent deletion would fail loudly.
 *   4. Design tokens still in the stylesheet (brand teal + a sampling of
 *      domain/strength colors).
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

describe("RelGraph repository structure", () => {
  it("contains the load-bearing entry points and config", () => {
    const requiredPaths = [
      "client/src/pages",
      "client/src/components",
      "client/src/contexts",
      "client/src/hooks",
      "client/src/lib/api.ts",
      "client/src/lib/trpc.ts",
      "client/src/lib/geminiLiveEngine.ts",
      "client/src/lib/voiceBotTools.ts",
      "client/src/components/ui/button.tsx",
      "server/index.ts",
      "server/routers.ts",
      "server/middleware",
      "server/services",
      "server/db/schema.ts",
      "shared/types.ts",
      "shared/constants.ts",
      "shared/validation.ts",
      "shared/enums.ts",
      "components.json",
      "drizzle.config.ts",
      "tsconfig.node.json",
      ".env.example",
      "CLAUDE.md",
      "README.md",
      "MAPS.md",
      "docs/IMPLEMENTATION_PLAN.md",
    ];

    for (const relPath of requiredPaths) {
      expect(fs.existsSync(path.join(root, relPath)), `${relPath} should exist`).toBe(true);
    }
  });

  it("contains a router for every strategic feature", () => {
    const routers = [
      "server/routers/auth.router.ts",
      "server/routers/persons.router.ts",
      "server/routers/organizations.router.ts",
      "server/routers/tenures.router.ts",
      "server/routers/relationships.router.ts",
      "server/routers/interactions.router.ts",
      "server/routers/today.router.ts",
      "server/routers/opportunities.router.ts",
      "server/routers/ownership.router.ts",
      "server/routers/provenance.router.ts",
      "server/routers/watches.router.ts",
      "server/routers/agents.router.ts",
      "server/routers/apify.router.ts",
      "server/routers/admin.router.ts",
    ];
    for (const r of routers) {
      expect(fs.existsSync(path.join(root, r)), `${r} should exist`).toBe(true);
    }
  });

  it("contains a page for every strategic surface", () => {
    const pages = [
      "client/src/pages/Today.tsx",
      "client/src/pages/Graph.tsx",
      "client/src/pages/Opportunities.tsx",
      "client/src/pages/Watches.tsx",
      "client/src/pages/PersonProfile.tsx",
      "client/src/pages/admin/AgentOperations.tsx",
      "client/src/pages/admin/AdminHealth.tsx",
    ];
    for (const p of pages) {
      expect(fs.existsSync(path.join(root, p)), `${p} should exist`).toBe(true);
    }
  });

  it("contains every shipped agent dispatcher", () => {
    const dispatchers = [
      "server/services/agents/digest-dispatcher.ts",
      "server/services/agents/trust-auditor-dispatcher.ts",
      "server/services/agents/ingestion-dispatcher.ts",
      "server/services/agents/dedup-dispatcher.ts",
      "server/services/agents/change-detection-dispatcher.ts",
      "server/services/agents/path-recompute-dispatcher.ts",
      "server/services/agents/enrichment-dispatcher.ts",
    ];
    for (const d of dispatchers) {
      expect(fs.existsSync(path.join(root, d)), `${d} should exist`).toBe(true);
    }
  });

  it("includes the RelGraph design tokens in the stylesheet", () => {
    const css = fs.readFileSync(path.join(root, "client/src/index.css"), "utf8");
    expect(css).toContain("--relgraph-primary: #1d9e75");
    expect(css).toContain("--domain-psu-banking: #7f77dd");
    expect(css).toContain("--strength-champion: #639922");
    expect(css).toContain("--input-card: #1d9e75");
  });

  it("CLAUDE.md still asserts the three workflow rules", () => {
    const claudeMd = fs.readFileSync(path.join(root, "CLAUDE.md"), "utf8");
    expect(claudeMd).toMatch(/Rule 1.*Three-pass bug check/);
    expect(claudeMd).toMatch(/Rule 2.*MAPS\.md/);
    expect(claudeMd).toMatch(/Rule 3.*Apple-grade UX/);
  });
});
