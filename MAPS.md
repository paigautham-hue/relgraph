# RelGraph MAPS — Single Source of Truth

**Last updated:** 2026-05-08
**Update rule:** Every PR that adds/changes/removes code MUST update the relevant section in this file in the same commit. PR is not done until MAPS reflects reality. See `CLAUDE.md` for enforcement.

This file is the authoritative map of the codebase. Read it first when picking up work. When in doubt, MAPS wins over memory; code wins over MAPS — fix MAPS if reality has drifted.

---

## Table of contents

1. [Architecture overview](#1-architecture-overview)
2. [Information architecture (UI surfaces)](#2-information-architecture-ui-surfaces)
3. [Data model — every table](#3-data-model--every-table)
4. [API surface — every tRPC router](#4-api-surface--every-trpc-router)
5. [Pages & components](#5-pages--components)
6. [Hooks, contexts, lib](#6-hooks-contexts-lib)
7. [Background agents & schedules](#7-background-agents--schedules)
8. [Voice architecture](#8-voice-architecture)
9. [External integrations](#9-external-integrations)
10. [Auth & RBAC model](#10-auth--rbac-model)
11. [Environment variables](#11-environment-variables)
12. [Build, scripts, dev loop](#12-build-scripts-dev-loop)
13. [Test coverage](#13-test-coverage)
14. [Known issues & deferred items](#14-known-issues--deferred-items)
15. [Changelog](#15-changelog)

---

## 1. Architecture overview

**Stack** (from CLAUDE.md, do not deviate):
- React 19 + TypeScript + Vite 7 + Tailwind CSS 4 (frontend)
- Wouter (routing), shadcn/ui + Radix (components), lucide-react (icons), react-hook-form + zod (forms), framer-motion (animation), recharts (charts), sonner (toasts)
- Express + tRPC v11 (backend)
- Drizzle ORM + **MySQL** (live DB; despite `.env.example` mentioning Postgres — see issue DB-DIALECT)
- pnpm only, ES modules everywhere
- Manus AI deployment (push to `main` → Manus pulls and publishes)

**Activation loop (the product spine):**
1. **Public ingestion** — Apify-driven daily pulls from Indian institutional sources (RBI, PIB, MCA21, SEBI, BSE/NSE, Gazette)
2. **Voice-first private capture** — universal mic button + AssemblyAI + Claude entity-resolver
3. **Daily action brief** — Today feed of cards, no metrics dashboard

**Three UI surfaces (target state, week 3+):**
- **Today** — action feed + universal command box
- **Graph** — unified people / orgs / opportunities navigation
- **Settings** — preferences, watches, team admin, agent operations

**Build status legend used throughout MAPS:**
- ✅ shipped and in MAPS
- 🚧 in progress in current week
- 📋 planned (see `docs/IMPLEMENTATION_PLAN.md`)
- 🗑️ deprecated, slated for removal

---

## 2. Information architecture (UI surfaces)

### Current state (pre-week-3)

| Route | Page | Status |
|---|---|---|
| `/` | Dashboard.tsx (stats charts) | ✅ existing — to be replaced by Today in week 3 |
| `/login` | Login.tsx | ✅ |
| `/people` | PersonList.tsx | ✅ — to fold into Graph in week 3 |
| `/people/:id` | PersonProfile.tsx | ✅ |
| `/organizations` | OrganizationList.tsx | ✅ — to fold into Graph |
| `/network` | NetworkMap.tsx | ✅ — to fold into Graph |
| `/path` | PathFinder.tsx | ✅ — surfaced via command box |
| `/alerts` | AlertsPage.tsx | ✅ — to fold into Today cards |
| `/briefings` | BriefingsPage.tsx | ✅ — to fold into Today cards |
| `/import-history` | PersonImportHistory.tsx | ✅ |
| `/admin/users` | UserManagement.tsx | ✅ |
| `/admin/access-requests` | AccessRequests.tsx | ✅ |
| `/admin/domains` | DomainManagement.tsx | ✅ |
| `/admin/import-settings` | ContactImportSettings.tsx | ✅ |
| `/admin/apify` | ApifyManagement.tsx | ✅ |
| `/admin/bank-dataset` | IndianBankDataset.tsx | ✅ |
| `/admin/audit` | AuditLog.tsx | ✅ |

### Target state (post-week-6)

| Route | Page | Status |
|---|---|---|
| `/` | Today.tsx — command box + card feed | 📋 |
| `/graph` | Graph.tsx — unified people/orgs/opps | 📋 |
| `/settings/*` | preferences, watches, team admin, agent ops | 📋 |
| `/login` | Login.tsx | ✅ |

---

## 3. Data model — every table

DB dialect: **MySQL** (Drizzle config: `drizzle.config.ts` → `dialect: "mysql"`).

Schema file: `server/db/schema.ts`.

### Existing tables (22)

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Auth, roles, domain access | id, email, passwordHash, role, loginMethod, openId, invitedBy, isActive, createdAt, updatedAt, lastSignedIn |
| `domains` | Workspace hierarchy + scraping config | id, name, parentDomainId, trackedRoleTypes, scraperConfig |
| `user_domain_access` | User → Domain RBAC | userId, domainId |
| `organizations` | Companies, banks, regulators | id, name, domainId, type, city, website |
| `org_hierarchy` | Org parent-child | parentOrgId, childOrgId, relationshipType |
| `persons` | People records | id, name, currentTitle, currentOrgId, category, photoUrl, isTracked, createdBy |
| `tenures` | Job history with dates (KEY for graph) | personId, orgId, title, startDate, endDate, isCurrent, source, sourceUrl |
| `relationships` | Person ↔ Person edges | sourcePersonId, targetPersonId, type, strengthScore, strengthLabel, declaredBy |
| `external_connections` | Discovered (non-declared) connections | personAId, personBId, type, discoveredBy, source |
| `interactions` | Meetings, calls, events | type, occurredAt, location, summary, depthScore, inputMethod, voiceRecordingUrl, voiceTranscript, aiExtractedSummary |
| `interaction_participants` | Attendees per interaction | interactionId, personId, role |
| `reflections` | Analysis notes about persons | personId, authorId, category, content, confidenceLevel, visibilityLevel, voiceRecordingUrl |
| `person_notes` | Freeform notes | personId, authorId, content, visibilityLevel |
| `person_intel` | Structured fields (education, etc.) | personId, fieldName, fieldValue, contributedBy, aiConfidence |
| `audit_log` | Append-only action log | userId, actionType, entityType, entityId, oldValue, newValue, ipAddress, userAgent, metadata |
| `alerts` | Warnings + opportunities | type, severity, personId/orgId, isDismissed, actionTaken |
| `briefings` | AI-generated person summaries | personId, generatedBy, content, sourcesUsed |
| `chat_conversations` | Chat sessions | userId, title |
| `chat_messages` | Per-conversation messages | conversationId, role, content, toolCalls, sourcesUsed |
| `apify_source_configs` | Apify monitoring setup | name, capability, targetType, actorId, defaultInput, watchFields, runFrequencyCron, target* |
| `apify_runs` | Apify execution history | sourceConfigId, apifyRunId, datasetId, status, inputPayload, outputPreview, normalizedOutput, detectedChanges |
| `bank_leadership_records` | Indian bank leadership tracking | organizationId, roleType, personName, sourceUrl, validationStatus, confidenceLevel, importedPersonId, importedTenureId |

### Migrations (`drizzle/`)

| File | Purpose |
|---|---|
| `0000_smooth_roulette.sql` | Initial schema |
| `0001_apify_persistence_bank_leadership.sql` | Apify + bank leadership tables |
| `0002_bank_leadership_records_recovery.sql` | Recovery fix |
| `0003_audit_log_recovery.sql` | Missing audit_log table |
| `0004_missing_core_tables_recovery.sql` | Core tables (relationships, etc.) |

### Planned new tables (week 1)

| Table | Purpose |
|---|---|
| `opportunities` | First-class business initiatives with stage state machine |
| `opportunity_links` | Polymorphic: opportunity → person | org | interaction |
| `watches` | User → (person | org | sector). Drives digest + alerts |
| `ownership` | Person → owning_user (Tier-1 must be owned) |
| `provenance` | Polymorphic per-fact: source, captured_by, captured_at, confidence, verified_by, expires_at |
| `power_moves` | Detected role/board changes from change-detection agent |
| `digest_cards` | Generated cards for daily action feed |
| `agent_registry` | Catalog of background agents |
| `agent_schedules` | Per-agent cron + token cap (admin-configurable) |
| `agent_runs` | Execution history with cost + status |

### Enums (`shared/enums.ts`)

USER_ROLES, ORG_TYPES, TENURE_SOURCES, RELATIONSHIP_TYPES, STRENGTH_LABELS, EXTERNAL_CONNECTION_TYPES, INTERACTION_TYPES, PARTICIPANT_ROLES, INPUT_METHODS, REFLECTION_CATEGORIES, CONFIDENCE_LEVELS, VISIBILITY_LEVELS, PERSON_CATEGORIES, EXTERNAL_CONNECTION_SOURCES, ORG_HIERARCHY_TYPES, AUDIT_ACTION_TYPES, AUDIT_ENTITY_TYPES, ALERT_TYPES, ALERT_SEVERITIES, CHAT_ROLES, bankLeadershipRole, bankLeadershipSourceType, bankLeadershipValidationStatus.

**Planned additions (week 1):** OPPORTUNITY_STAGES, PROVENANCE_SOURCE_TYPES, AGENT_STATUSES, AGENT_NAMES, WATCH_TARGET_TYPES, OWNERSHIP_TIERS.

---

## 4. API surface — every tRPC router

Root router: `server/routers.ts` — composes 20 sub-routers under `appRouter`.

| Router | Procedures | Notes |
|---|---|---|
| `system` | health, metadata | from `_core/systemRouter` |
| `auth` | login, requestAccess, register, setupPassword (public); me, logout, refresh, changePassword (protected) | 322 lines |
| `persons` | list, getById, create, update, delete (domain-scoped); getImportTemplate, getImportTemplateConfig, validateImport, resolveImportDuplicates, listImportHistory, getImportHistoryEntry, commitImport (contributor) | 598 lines |
| `organizations` | list, getById, create, update, delete | 190 lines |
| `tenures` | list, getById, create, update, delete | 195 lines |
| `relationships` | list, getById, create, update, delete | 227 lines |
| `interactions` | list, getById, create, update, delete | 260 lines |
| `reflections` | list, getById, create, update, delete | 229 lines |
| `intel` | list, getById, create, update, delete, fieldHistory | 229 lines |
| `notes` | list, getById, create, update, delete | 205 lines |
| `domains` | list (protected); getById, create, update (admin) | 101 lines |
| `admin` | listUsers, getContactImportTemplateConfig, updateContactImportTemplateConfig, getUser, listRegistrationAllowlist, listAccessRequests, approveAccessRequest, denyAccessRequest, bulkApproveAccessRequests, bulkDenyAccessRequests, addRegistrationAllowlistEmail, removeRegistrationAllowlistEmail, inviteUser, updateUser, deactivateUser | 567 lines |
| `audit` | list, getById (admin) | 108 lines |
| `dashboard` | stats | 62 lines |
| `voice` | transcribe, extract, status | 49 lines — uses AssemblyAI |
| `search` | search (full-text), findPath | 24 lines |
| `chat` | createConversation, listConversations, deleteConversation, getMessages, sendMessage, executeToolCall, geminiToken | 85 lines — Claude + Gemini Live |
| `briefings` | generate, list (contributor) | 26 lines |
| `alerts` | list, dismiss, markAction | 44 lines |
| `apify` | listSourceConfigs, getSourceConfig, createSourceConfig, updateSourceConfig, listRuns, getRun, runSource, applyDiscovery, applyEnrichment, syncMonitoring, listBankLeadershipRecords, getBankLeadershipRecord, updateBankLeadershipRecord, createBankLeadershipRecord, importBankLeadershipRecord, getIndianBankTargets, previewIndianBankSeed, seedIndianBankOrganizations | 146 lines |

### Planned new routers (weeks 1-6)

| Router | Procedures | Week |
|---|---|---|
| `opportunities` | list, create, update, transitionStage, link, listLinks, unlink | 5 |
| `watches` | list, create, delete | 1-6 |
| `ownership` | list, assign, transfer, listUnowned | 5 |
| `provenance` | listForEntity (queries auto-attached records) | 5 |
| `today` | feed, dismissCard, actCard | 3 |
| `agents` | listRegistry, listSchedules, updateSchedule, listRuns, runNow, setEnabled, setTokenCap | 2 |
| `intentRouter` | classify (Claude Haiku → tool+args) | 3 |

### tRPC procedure builders (`server/_core/trpc.ts`)

- `publicProcedure` — no auth
- `protectedProcedure` — any authenticated user
- `adminProcedure` — admin+ role
- `contributorProcedure` — contributor+ role
- `domainScopedProcedure` — userDomainAccess required + domain filter applied

---

## 5. Pages & components

### Pages (`client/src/pages/`)

**Top-level:**
| File | Purpose |
|---|---|
| Dashboard.tsx | Stats charts (will be replaced by Today) |
| Home.tsx | Redirect to Dashboard or Login |
| Login.tsx | Unified login/register/request-access/setup-password |
| PersonList.tsx | People table with search, pagination, Excel export/import |
| PersonProfile.tsx | Person detail with tenures, relationships, interactions, reflections, intel, notes |
| OrganizationList.tsx | Organizations table with hierarchy |
| NetworkMap.tsx | Force-directed graph |
| PathFinder.tsx | Two-person path search with strength labels |
| AlertsPage.tsx | Alerts by type/severity with dismiss + action |
| BriefingsPage.tsx | AI briefings list + generate |
| PersonImportHistory.tsx | Import run history with error reports |
| NotFound.tsx | 404 |

**Admin (`client/src/pages/admin/`):**
| File | Purpose |
|---|---|
| UserManagement.tsx | User CRUD, invite, deactivate |
| AccessRequests.tsx | Pending requests, bulk approve/deny |
| DomainManagement.tsx | Domain CRUD, role types, hierarchy |
| ContactImportSettings.tsx | Per-category template field config |
| ApifyManagement.tsx | Source configs, runs, bank seeding |
| IndianBankDataset.tsx | Bank leadership records + validation |
| AuditLog.tsx | Audit table with filters |

### Components (`client/src/components/`)

**Feature directories:**
- `chat/` — ChatPanel, message list, tool-call execution (Gemini Live + Claude)
- `input/` — QuickLogModal (Ctrl+L), VoiceRecorder (AssemblyAI)
- `intel/` — FieldHistoryDialog (audit history for intel fields)
- `reflections/` — ReflectionForm (category, confidence, visibility)
- `common/` — PageHeader, AvatarInitials, DomainBadge, InputMethodBadge, StrengthMeter

**Layout / shell:**
- DashboardLayout.tsx (~200 lines) — sidebar + nav + domain selector + user menu
- DashboardLayoutSkeleton.tsx — loading skeleton
- ErrorBoundary.tsx
- Map.tsx — Google Maps wrapper
- AIChatBox.tsx — sidebar chat
- ManusDialog.tsx — Manus runtime integration

**UI primitives (`client/src/components/ui/`):** 55 shadcn/ui components.

### Planned new components (weeks 3-5)

| Component | Purpose | Week |
|---|---|---|
| Today.tsx | New homepage with command box + card feed | 3 |
| Graph.tsx | Unified people/orgs/opps surface | 3 |
| CommandBox.tsx | Universal text+voice input with intent routing | 3 |
| PowerMoveCard, BriefingCard, FollowUpCard, StaleCard, NewPathCard, IntelCard, OpportunityStallCard, NoOwnerCard | Today feed cards | 3 |
| VoiceInputButton.tsx | Universal mic for any text input (ported from Meridian) | 4 |
| RecordingBar.tsx | Portalled fixed bar during recording (ported from Meridian) | 4 |
| VoiceBot.tsx | Floating FAB → Gemini Live conversational | 4 |
| OpportunityCard.tsx, OpportunityDetail.tsx | Opportunity views | 5 |
| ProvenanceChip.tsx | Tap-to-reveal source/captured-by/confidence | 5 |
| AgentOperations.tsx | Admin: schedule, enable, token cap, dry-run | 2 |

---

## 6. Hooks, contexts, lib

### Hooks (`client/src/hooks/`, `client/src/_core/hooks/`)

| Hook | Purpose |
|---|---|
| useAuth.ts | Auth context consumer (id, email, name, role, avatar, logout) |
| useComposition.ts | (verify usage) |
| useMobile.tsx | Breakpoint detection |
| usePersistFn.ts | Persist callback reference |

**Planned:** useVoiceRecording.ts (week 4, ported from Meridian).

### Contexts (`client/src/contexts/`)

| Context | Purpose |
|---|---|
| ThemeContext.tsx | Light/dark mode |

### Lib (`client/src/lib/`)

| File | Purpose |
|---|---|
| trpc.ts | tRPC client with auth headers, token refresh |
| api.ts | Raw axios for non-tRPC endpoints |
| utils.ts | Tailwind cn(), date fmt, strength label helpers |
| chatPrompt.ts | System prompts for Claude chat/briefings |
| geminiLiveEngine.ts | Gemini Live WebSocket session manager |

---

## 7. Background agents & schedules

### Agent registry (planned, week 1-2 build)

| Agent name | Default cadence | Job | Status |
|---|---|---|---|
| `ingestion_rbi_pib` | Every 6h | Pull RBI press releases + PIB | 📋 |
| `ingestion_mca21_gazette` | Daily 02:00 IST | Pull MCA21 corporate filings + Gazette | 📋 |
| `ingestion_bse_nse` | Daily 20:00 IST | Post-market disclosure pull | 📋 |
| `change_detection` | Daily 04:00 IST | Diff prior 24h, emit power_moves | 📋 |
| `dedup` | On write | Fuzzy-match new entities, auto-merge >0.9 | 📋 |
| `enrichment` | Weekly Sun 03:00 IST | Backfill missing fields | 📋 |
| `path_recompute` | Event-driven (graph change) | Re-run cached paths affected by moved nodes | 📋 |
| `brief` | Daily 05:00 IST per user | Pre-build tomorrow's meeting briefings | 📋 |
| `trust_auditor` | Weekly Sun 04:00 IST | Demote stale facts past expires_at | 📋 |
| `digest` | Daily 06:00 IST per user | Assemble Today action feed | 📋 |

### Cost guardrails

- Per-agent monthly token cap (admin-set, soft-pause when hit)
- Dry-run-by-default for new sources (first 7 days fetch+diff only)
- Cheap-model first: Haiku → ingestion/dedup, Sonnet → change-summarization/briefings, full reasoning only for explicit user voice queries
- Content-hash dedup: same source + content → never re-LLM

### Admin UI (planned)

`client/src/pages/admin/AgentOperations.tsx` — schedule cron, enable/disable, source allowlist, token cap, run-now, dry-run mode, last-run/cost/status.

---

## 8. Voice architecture

### Current state

- `server/services/voice.service.ts` — AssemblyAI client
- `server/routers/voice.ts` — `transcribe`, `extract`, `status` procedures
- `client/src/components/input/VoiceRecorder.tsx` — quick-log voice capture
- `client/src/components/input/QuickLogModal.tsx` — Ctrl+L modal with voice + text
- `client/src/lib/geminiLiveEngine.ts` — Gemini Live WebSocket session manager (already exists!)
- `server/routers/chat.ts:geminiToken` — returns Google API key for client WebSocket

### Target state (week 4 build, ported from Meridian)

**Layer 1 — Universal capture (`VoiceInputButton`):**
- Inline `<Mic>` next to every text input
- `MediaRecorder` → upload via `trpc.voice.uploadAudio` → AssemblyAI → text inserted
- `useVoiceRecording` hook + `RecordingBar` portalled to body (z-9999)
- ~150 lines client total

**Layer 2 — Conversational (`VoiceBot`):**
- Floating FAB → opens conversational mode
- `geminiRouter.getApiKey` (rate-limit 5/min, session lock 2-min TTL) returns key
- Client opens WebSocket to `wss://generativelanguage.googleapis.com/.../gemini-3.1-flash-live-preview` (v1beta, `?key=`)
- Tool definitions: 8 RelGraph-specific intents (findPath, briefPerson, logInteraction, searchIntel, updateOpportunity, addToWatchlist, whoOwns, coverageGap)
- Streaming TTS, function-calling for DB actions

**Layer 3 — Intent router (`server/services/intent-router.service.ts`):**
- Command-box typed queries → Claude Haiku → `{tool, args}`
- Same tool surface as VoiceBot (single source of truth)

### Voice tool definitions (planned week 4)

```ts
// server/utils/voiceActions.ts (planned)
export const voiceToolDefinitions = [
  { name: 'findPath', description: 'Find paths to a target person or role', parameters: z.object({ target: z.string() }) },
  { name: 'briefPerson', description: 'Generate dossier for a person', parameters: z.object({ name: z.string() }) },
  { name: 'logInteraction', description: 'Log a meeting/conversation from free text', parameters: z.object({ text: z.string() }) },
  { name: 'searchIntel', description: 'Recent power-moves and intel for an org', parameters: z.object({ org: z.string() }) },
  { name: 'updateOpportunity', description: 'Move opportunity to a stage with note', parameters: z.object({ name: z.string(), stage: z.string(), note: z.string().optional() }) },
  { name: 'addToWatchlist', description: 'Subscribe to a person/org', parameters: z.object({ target: z.string() }) },
  { name: 'whoOwns', description: 'Find owner of a relationship', parameters: z.object({ target: z.string() }) },
  { name: 'coverageGap', description: 'Find weak coverage in a sector', parameters: z.object({ sector: z.string() }) },
];
```

---

## 9. External integrations

| Service | Purpose | Where | Env var |
|---|---|---|---|
| AssemblyAI | Voice transcription (quick-log) | `server/services/voice.service.ts` | `ASSEMBLYAI_API_KEY` |
| Google Gemini Live | Voice chat conversational | `client/src/lib/geminiLiveEngine.ts` + `server/routers/chat.ts:geminiToken` | `GOOGLE_API_KEY` |
| Anthropic Claude | Briefings, chat agent, intent router | `server/services/briefing.service.ts`, `server/services/chat.service.ts` | `ANTHROPIC_API_KEY` |
| OpenAI | Embeddings (memory) | `server/services/embedding.service.ts` | `OPENAI_API_KEY` |
| Apify | Web scraping + monitoring | `server/services/apify.service.ts` | Apify token (config) |

**Model versions:**
- Gemini Live: `gemini-3.1-flash-live-preview` (v1beta endpoint, `?key=` auth)
- Claude: pin to `claude-haiku-4-5-20251001` for intent routing, `claude-sonnet-4-6` for briefings
- OpenAI embeddings: `text-embedding-3-small` (1536 dim)

---

## 10. Auth & RBAC model

### Authentication flow

1. **Login** (publicProcedure): email + password → MySQL users table → bcrypt → JWT (access + refresh) → cookies
2. **Registration** (gated): request access → admin approves → user `register` / `setupPassword` against approved email
3. **Super admin**: `gautham@manipalgroup.info` reserved, auto-promoted, public `setupPassword` for first time

### Roles

- `viewer` (default) — read-only
- `contributor` — can create interactions, reflections, briefings
- `manager` — team coordination
- `admin` — user mgmt, domain mgmt, audit log, contact templates
- `super_admin` — all admin + allowlist/access-request mgmt + role assignment

### Procedure builders

- `publicProcedure` — no auth
- `protectedProcedure` — any authenticated user
- `adminProcedure` — admin+
- `contributorProcedure` — contributor+
- `domainScopedProcedure` — userDomainAccess required + domain filter applied

### Domain-based access

- `user_domain_access` table grants domain access
- Persons, orgs, interactions are domain-scoped

### Audit

- `server/middleware/audit.ts:logAudit()` — append-only writes to `audit_log`
- Captures: userId, actionType, entityType, entityId, oldValue, newValue, inputMethod, ipAddress, userAgent
- Query: `audit.list` (admin)

### Cookies

- `RELGRAPH_SESSION_COOKIE` (access token)
- `RELGRAPH_REFRESH_COOKIE` (refresh token)
- httpOnly, secure, sameSite

### Files

- `server/services/auth.service.ts` — core (with MySQL legacy compat)
- `server/routers/auth.router.ts` — endpoints
- `server/_core/context.ts` — JWT extraction
- `server/_core/trpc.ts` — procedure builders
- `server/_core/cookies.ts` — cookie options

---

## 11. Environment variables

From `.env.example` (DB string says Postgres but the live DB is MySQL — see issue DB-DIALECT):

```
DATABASE_URL=postgresql://user:password@localhost:5432/relgraph    # ⚠️ live is MySQL
JWT_SECRET=
JWT_REFRESH_SECRET=
ASSEMBLYAI_API_KEY=
GOOGLE_API_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
UPLOAD_DIR=./uploads
MAX_VOICE_FILE_SIZE=25MB
```

**Planned additions (week 2):**
- `APIFY_API_TOKEN`
- `AGENT_DEFAULT_TOKEN_CAP_USD`

---

## 12. Build, scripts, dev loop

### `package.json` scripts

| Script | Command |
|---|---|
| `dev` | `tsx server/index.ts` (Express + Vite middleware mode) |
| `build` | `vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` |
| `start` | `NODE_ENV=production node dist/index.js` |
| `preview` | `vite preview --host` |
| `check` | `tsc --noEmit` |
| `format` | `prettier --write .` |
| `test` | `vitest run` |
| `db:push` | `drizzle-kit push` |
| `db:seed` | `tsx server/db/seed.ts` |
| `db:studio` | `drizzle-kit studio` |

### Key configs

- `vite.config.ts` — React + Tailwind + Manus runtime + debug collector. Aliases `@` → client/src, `@shared` → shared. Build output `dist/public`.
- `drizzle.config.ts` — `dialect: "mysql"`, schema `server/db/schema.ts`, out `drizzle/`.
- `tsconfig.json` — strict, ESNext, JSX preserve.

### Dev server pattern

`pnpm dev` runs `tsx server/index.ts` which starts Express **with Vite in middleware mode** (not `vite --host` alone). Deliberate deviation from standard Manus static frontend, because we need API routes in dev. Production build remains Manus-compatible.

---

## 13. Test coverage

Vitest. Roughly 8 test files at present:

| File | Coverage |
|---|---|
| `server/scaffold.test.ts` | Project structure validation |
| `server/auth.legacy-setup.test.ts` | First-time password setup (MySQL legacy schema) |
| `server/auth.audit.test.ts` | Audit logging on auth events |
| `server/auth.logout.test.ts` | Logout + cookie clearing |
| `server/admin.auth-enhancements.test.ts` | Admin user/allowlist CRUD |
| `server/domains.router.test.ts` | Domain create/update/access |
| `server/apify.bank-dataset.test.ts` | Bank leadership seeding/normalization |
| `server/apify.secret.test.ts` | Apify config secrets |

**Verification gates** (run before claiming any task done):
1. `pnpm check` — TypeScript
2. `pnpm test` — Vitest
3. `pnpm build` — production build

---

## 14. Known issues & deferred items

### Open from `todo.md`

- [ ] Email notification on access-request approval (deferred until email API ships)
- [ ] Apify feature design + integration (in progress, weeks 2)
- [ ] Comprehensive QA sweep across core flows
- [ ] Legacy `loginMethod` query failures in admin allowlist/access-request paths
- [ ] Audit log persistence gap (some admin actions still emit DB errors)

### Tracked issues (IDs used in code comments and PRs)

| ID | Title | Notes |
|---|---|---|
| DB-DIALECT | `.env.example` says Postgres, live is MySQL | Fix env example in week 1; document in CLAUDE.md |
| LEGACY-USERS | Live users table uses camelCase columns (`openId`, `loginMethod`, etc.); compat layer in `auth.service.ts` | Don't refactor until magic-link replaces password flow |
| EMAIL-API | No email API wired; magic-link blocked | Defer magic-link until ready |
| CLOUDFLARE-AUTH-WALL | Manus deployments behind Cloudflare turnstile occasionally block authenticated browser tests | Documented in `browser-validation-notes.md` |

### From `qa-notes/` and validation docs

- `browser-validation-notes.md` — Apify + bank-dataset routes load; audit log recovers; 31 Indian bank targets seeded, 0 pending leadership review at last check
- `debug-set-password-findings.md` — MySQL legacy schema landmines documented; regression test in `server/auth.legacy-setup.test.ts`
- `qa_browser_notes_2026-04-06.md` — auth+core flows verified after pagination fix
- `research/apify-notes.md` — Apify REST API capabilities reference

---

## 15. Changelog

Append-only. Newest at top. Every commit that changes code MUST add an entry.

Format: `YYYY-MM-DD — {feat|fix|chore|refactor|docs}({area}): one-line description (commit-sha-short)`

### 2026-05-08

- 2026-05-08 — docs(plan): create IMPLEMENTATION_PLAN.md and MAPS.md with full audit of existing 22 tables, 20 routers, 19 pages, voice + Apify state. Establish update rule in CLAUDE.md (commit pending)
