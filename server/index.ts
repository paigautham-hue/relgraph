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
import { startAgentRunner } from "./services/agent-runner.service";

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
