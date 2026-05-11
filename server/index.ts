import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./_core/oauth";
import { createContext } from "./_core/context";
import { appRouter } from "./routers";
import { serveStatic, setupVite } from "./_core/vite";
import { syncAgentRegistry } from "./services/agent-registry.service";
import { startAgentRunner, registerAgentDispatcher } from "./services/agent-runner.service";
import { digestDispatcher } from "./services/agents/digest-dispatcher";
import { trustAuditorDispatcher } from "./services/agents/trust-auditor-dispatcher";
import {
  rbiPibIngestionDispatcher,
  mca21GazetteIngestionDispatcher,
  bseNseIngestionDispatcher,
} from "./services/agents/ingestion-dispatcher";
import { dedupDispatcher } from "./services/agents/dedup-dispatcher";
import { changeDetectionDispatcher } from "./services/agents/change-detection-dispatcher";
import { pathRecomputeDispatcher } from "./services/agents/path-recompute-dispatcher";
import { enrichmentDispatcher } from "./services/agents/enrichment-dispatcher";
import { briefDispatcher } from "./services/agents/brief-dispatcher";
import { syncApifySourceSeeds } from "./services/apify-source-seeds";

async function startServer() {
  const app = express();
  const server = createServer(app);
  const port = Number(process.env.PORT || 5000);

  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  registerOAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, name: "RelGraph", environment: process.env.NODE_ENV || "development" });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    await setupVite(app, server);
  }

  // Boot-time agent registry sync. Idempotent — verifies the canonical 10
  // agents exist with correct definitions and that each has a default schedule.
  // Failures here log but don't block server boot (the Agent Operations admin
  // UI will surface registry drift). See server/services/agent-registry.service.ts
  // and IMPLEMENTATION_PLAN.md week 2.0.
  try {
    const result = await syncAgentRegistry();
    if (result.created || result.updated || result.schedulesCreated) {
      console.log(
        `[boot] Agent registry sync: ${result.created} created, ${result.updated} updated, ${result.schedulesCreated} schedules created`,
      );
    }
  } catch (err) {
    console.error("[boot] Agent registry sync failed (continuing boot):", err);
  }

  // Boot-time sync of Apify source configs for the 7 Indian institutional
  // feeds. Idempotent — admin customisations of cron/defaultInput/watchFields
  // are preserved on re-sync. Sources start is_active=false; admin enables
  // each from Apify Ops after reviewing target URLs and estimated cost.
  try {
    const apifyResult = await syncApifySourceSeeds();
    if (apifyResult.created || apifyResult.updated) {
      console.log(
        `[boot] Apify source seeds: ${apifyResult.created} created, ${apifyResult.updated} updated, ${apifyResult.skipped} unchanged`,
      );
    }
  } catch (err) {
    console.error("[boot] Apify source seeds sync failed (continuing boot):", err);
  }

  // Register all real dispatchers. Each agent's run lifecycle is recorded
  // in agent_runs and surfaced in Agent Operations admin UI.
  registerAgentDispatcher("digest", digestDispatcher);
  registerAgentDispatcher("trust_auditor", trustAuditorDispatcher);
  // Ingestion (week 2.3) — three buckets aligned to the agent_registry seeds.
  registerAgentDispatcher("ingestion_rbi_pib", rbiPibIngestionDispatcher);
  registerAgentDispatcher("ingestion_mca21_gazette", mca21GazetteIngestionDispatcher);
  registerAgentDispatcher("ingestion_bse_nse", bseNseIngestionDispatcher);
  // Dedup (week 2.4) — event-driven; runner skips cron-based scheduling but
  // the dispatcher runs when something else (ingestion) triggers it.
  registerAgentDispatcher("dedup", dedupDispatcher);
  // Change detection (week 2.5) — daily diff to emit power_moves.
  registerAgentDispatcher("change_detection", changeDetectionDispatcher);
  // Path-recompute (event-driven on graph mutations) — emits new_path cards.
  registerAgentDispatcher("path_recompute", pathRecomputeDispatcher);
  // Enrichment (weekly) — heuristic backfill of partial records.
  registerAgentDispatcher("enrichment", enrichmentDispatcher);
  // Brief (daily 05:00 IST per user) — week-in-review + today's focus.
  registerAgentDispatcher("brief", briefDispatcher);

  // Start the agent runner tick. Wakes every minute, finds due schedules,
  // dispatches them. See server/services/agent-runner.service.ts.
  startAgentRunner();

  server.listen(port, "0.0.0.0", () => {
    console.log(`RelGraph server running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start RelGraph server", error);
  process.exit(1);
});
