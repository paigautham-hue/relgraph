import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./routers/auth.router";
import { personsRouter } from "./routers/persons.router";
import { organizationsRouter } from "./routers/organizations.router";
import { tenuresRouter } from "./routers/tenures.router";
import { relationshipsRouter } from "./routers/relationships.router";
import { interactionsRouter } from "./routers/interactions.router";
import { reflectionsRouter } from "./routers/reflections.router";
import { intelRouter } from "./routers/intel.router";
import { notesRouter } from "./routers/notes.router";
import { domainsRouter } from "./routers/domains.router";
import { adminRouter } from "./routers/admin.router";
import { auditRouter } from "./routers/audit.router";
import { dashboardRouter } from "./routers/dashboard.router";
import { voiceRouter } from "./routers/voice.router";
import { searchRouter } from "./routers/search.router";
import { chatRouter } from "./routers/chat.router";
import { briefingsRouter } from "./routers/briefings.router";
import { alertsRouter } from "./routers/alerts.router";
import { apifyRouter } from "./routers/apify.router";
import { agentsRouter } from "./routers/agents.router";
import { todayRouter } from "./routers/today.router";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  persons: personsRouter,
  organizations: organizationsRouter,
  tenures: tenuresRouter,
  relationships: relationshipsRouter,
  interactions: interactionsRouter,
  reflections: reflectionsRouter,
  intel: intelRouter,
  notes: notesRouter,
  domains: domainsRouter,
  admin: adminRouter,
  audit: auditRouter,
  dashboard: dashboardRouter,
  voice: voiceRouter,
  search: searchRouter,
  chat: chatRouter,
  briefings: briefingsRouter,
  alerts: alertsRouter,
  apify: apifyRouter,
  agents: agentsRouter,
  today: todayRouter,
});

export type AppRouter = typeof appRouter;
