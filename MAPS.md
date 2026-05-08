# RelGraph MAPS — Single Source of Truth

**Last updated:** 2026-05-08 (Week 3 — Today + Graph + universal command box shipped)
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
| `/` | Today.tsx — command box + card feed | ✅ shipped week 3 |
| `/today` | Today.tsx (alias) | ✅ |
| `/graph` | Graph.tsx — unified people/orgs/network/paths via filter chips | ✅ shipped week 3 |
| `/dashboard` | Dashboard.tsx (legacy stats; reachable via sidebar) | ✅ grandfathered |
| `/settings/*` | preferences, watches, team admin, agent ops | 📋 |
| `/login` | Login.tsx | ✅ |

**Week 3 sidebar nav** (top-down): Today → Graph → Dashboard → People → Organizations → Path Finder → Alerts → Briefings. Today is the new home. Graph is the canonical "browse" surface; legacy /persons, /organizations, /network, /paths still mounted for deep linking.

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
| `0005_strategic_spine.sql` | Opportunities, opportunity_links, watches, ownership, provenance, power_moves, digest_cards |
| `0006_agent_registry.sql` | Agent registry, schedules, runs + idempotent seed of 10 canonical agents |

**Migration application:** Drizzle journal (`drizzle/meta/_journal.json`) tracks 0000 and 0001. Migrations 0002+ are recovery / additive scripts applied via `pnpm db:push` (which diffs schema and applies changes) or manually via raw SQL during incident response. `_journal.json` is intentionally not advanced past 0001 — migration files in this repo are descriptive-of-state rather than strictly sequenced.

### Strategic spine tables (✅ shipped week 1)

Migrations: `drizzle/0005_strategic_spine.sql`, `drizzle/0006_agent_registry.sql`.

| Table | Status | Purpose | Key columns |
|---|---|---|---|
| `opportunities` | ✅ | First-class business initiatives with 7-stage state machine | id, name, description, stage, domainId, ownerId, visibilityScope, momentumScore, targetCloseDate, lastStageChangeAt, lastActivityAt, isArchived, createdBy |
| `opportunity_links` | ✅ | Polymorphic links: opportunity → person/organization/interaction | opportunityId, targetType, targetId, role, note |
| `watches` | ✅ | User → person/org/sector/role subscription | userId, targetType, targetId, targetLabel, isActive, notifyDigest, notifyPush |
| `ownership` | ✅ | Person → owning user (UNIQUE on personId — one owner per person) | personId, ownerUserId, tier, assignedBy, notes |
| `provenance` | ✅ | Polymorphic per-fact: source, captured-by, confidence, expires-at | entityType, entityId, fieldName, sourceType, sourceUrl, contentHash, capturedBy, confidence, verifiedBy, expiresAt |
| `power_moves` | ✅ | Detected role/board changes from change-detection agent | type, headline, summary, occurredAt, primaryPersonId, primaryOrgId, fromOrgId, toOrgId, fromTitle, toTitle, sourceType, agentRunId, confidence |
| `digest_cards` | ✅ | Cards for Today action feed | userId, type, title, body, rank, relatedPersonId, relatedOrgId, relatedOpportunityId, relatedPowerMoveId, isDismissed, isActioned, expiresAt |
| `agent_registry` | ✅ | Catalog of 10 canonical background agents | name (unique), displayName, defaultCadenceCron, isUserScoped, isEventDriven, defaultTokenCapUsd, preferredModel |
| `agent_schedules` | ✅ | Per-agent cron + token cap (admin-configurable) | agentId, cronExpression, isEnabled, isDryRun, monthlyTokenCapUsd, monthlyTokensUsedUsd, sourceAllowlist, lastRunAt, nextRunAt |
| `agent_runs` | ✅ | Execution history with status, items processed, tokens, cost | agentId, scheduleId, scopeUserId, status, triggeredBy, isDryRun, durationMs, itemsProcessed, itemsCreated, itemsUpdated, itemsSkipped, tokensUsed, costUsd, modelUsed, errorMessage |

**Total tables:** 32 (was 22).

### Enums (`shared/enums.ts`)

**Pre-existing:** USER_ROLES, ORG_TYPES, TENURE_SOURCES, RELATIONSHIP_TYPES, STRENGTH_LABELS, EXTERNAL_CONNECTION_TYPES, INTERACTION_TYPES, PARTICIPANT_ROLES, INPUT_METHODS, REFLECTION_CATEGORIES, CONFIDENCE_LEVELS, VISIBILITY_LEVELS, PERSON_CATEGORIES, EXTERNAL_CONNECTION_SOURCES, ORG_HIERARCHY_TYPES, AUDIT_ACTION_TYPES, AUDIT_ENTITY_TYPES, ALERT_TYPES, ALERT_SEVERITIES, CHAT_ROLES, bankLeadershipRole, bankLeadershipSourceType, bankLeadershipValidationStatus.

**Strategic spine (✅ shipped week 1):**
- `OPPORTUNITY_STAGES` — `identify | map | approach | engage | close | maintain | lost`
- `OPPORTUNITY_STAGE_TRANSITIONS` — explicit valid-transition map (state machine)
- `OPPORTUNITY_LINK_TARGET_TYPES` — `person | organization | interaction`
- `WATCH_TARGET_TYPES` — `person | organization | sector | role`
- `OWNERSHIP_TIERS` — `tier_1 | tier_2 | tier_3 | tier_4`
- `PROVENANCE_SOURCE_TYPES` — 20 source types (RBI, PIB, MCA21, voice_capture, etc.)
- `PROVENANCE_ENTITY_TYPES` — 10 polymorphic entity targets
- `AGENT_NAMES` — 10 canonical agents
- `AGENT_RUN_STATUSES` — `queued | running | completed | failed | skipped | budget_exhausted | dry_run`
- `POWER_MOVE_TYPES` — `role_change | board_appointment | board_exit | committee_appointment | company_formation | regulatory_action | major_filing | public_statement | other`
- `DIGEST_CARD_TYPES` — 10 card types for the Today feed
- `VISIBILITY_SCOPES` — `private | team | org`
- `AUDIT_ENTITY_TYPES` (extended) — added `opportunity`, `opportunity_link`, `watch`, `ownership`, `provenance`, `power_move`, `digest_card`, `agent_schedule`, `agent_run` so that mutations on new entities can be audit-logged. `audit_log.entity_type` MySQL enum modified via `ALTER TABLE` in `0005_strategic_spine.sql`.

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
| `agents` | listRegistry, listSchedules, updateSchedule, listRuns, runNow, resetMonthlyUsage (admin) | week 2: 250 lines — drives the Agent Operations admin UI |
| `today` | feed, dismissCard, actCard, command, classify (protected) | **week 3: 175 lines** — drives Today action feed and universal command box. `command` runs intent router → dispatcher in one round-trip; `classify` is the cheap preview-only call. |

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
| AgentOperations.tsx | **(week 2)** Agent schedules + recent runs admin page. Optimistic UI on toggles; designed loading/empty states; AlertDialog for monthly-usage reset. 700 lines. |

**Week 3 additions:**

| File | Purpose |
|---|---|
| client/src/pages/Today.tsx | Homepage — command box + ranked digest-card feed + 3 starter prompts in empty state. ~140 lines. |
| client/src/pages/Graph.tsx | Unified browse surface: People / Organizations / Network / Paths behind filter chips. Wraps existing pages without duplicating code. ~70 lines. |
| client/src/components/today/CommandBox.tsx | Universal command surface. Live classification preview with 600ms debounce, Cmd/Ctrl+Enter submit, result card with type-specific renderers (briefing → person list, intel → power-move list, owner → contact list, gap → uncovered orgs, watch_added → confirmation, logged → interaction id, pending → "ships next phase"). ~340 lines. |
| client/src/components/today/DigestCard.tsx | One component, 10 card types via meta map (icon + tone + label). Optimistic dismiss with slide+fade, primary tap-to-action. Light/dark designed. ~210 lines. |

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

### Agent registry

Defined in `server/services/agent-registry.service.ts:AGENT_DEFINITIONS`. Synced to DB on boot via `syncAgentRegistry()` (idempotent — safe to run on every server start). Per-schedule customisations (cron, enabled, token cap) set via Agent Operations UI are preserved.

**Cost guardrails baked into seed:**
- All ingestion agents start `is_enabled = false` and `is_dry_run = true`. Admin must explicitly enable after reviewing cost projections.
- Change-detection starts disabled (depends on ingestion).
- User-facing agents (digest, brief, dedup, path_recompute, trust_auditor, enrichment) start enabled.

| Agent name | Default cadence | Start state | Token cap (USD/mo) | Model | Status |
|---|---|---|---|---|---|
| `ingestion_rbi_pib` | `0 */6 * * *` (every 6h) | Off, dry-run | 50 | haiku | ✅ runner, 📋 dispatcher (week 2.3) |
| `ingestion_mca21_gazette` | `0 2 * * *` (02:00 IST) | Off, dry-run | 30 | haiku | ✅ runner, 📋 dispatcher (week 2.3) |
| `ingestion_bse_nse` | `0 20 * * *` (20:00 IST) | Off, dry-run | 40 | haiku | ✅ runner, 📋 dispatcher (week 2.3) |
| `change_detection` | `0 4 * * *` (04:00 IST) | Off | 20 | sonnet | ✅ runner, 📋 dispatcher (week 2.5) |
| `dedup` | event-driven | On | 10 | haiku | ✅ runner, 📋 dispatcher (week 2.4) |
| `enrichment` | `0 3 * * 0` (Sun 03:00) | Off | 15 | haiku | ✅ runner, 📋 dispatcher (week 2+) |
| `path_recompute` | event-driven | On | 5 | none | ✅ runner, 📋 dispatcher (week 6) |
| `brief` | `0 5 * * *` per user | On | 25 | sonnet | ✅ runner, 📋 dispatcher (week 6) |
| `trust_auditor` | `0 4 * * 0` (Sun 04:00) | On | 5 | haiku | ✅ runner, 📋 dispatcher (week 6) |
| `digest` | `0 6 * * *` per user | On | 20 | sonnet | ✅ runner, 📋 dispatcher (week 6) |

**Agent runner (✅ shipped week 2):**
- `server/services/agent-runner.service.ts` — singleton tick every 60 s started in `server/index.ts`. Atomic claim via UPDATE-with-WHERE on `next_run_at`; safe across multi-replica deploys. Per-run timeout: 5 min (Promise.race). Token-cap soft-pause sets status `budget_exhausted`. Manual `triggerRunNow()` for the admin UI's "Run now" button.
- `server/services/cron-utils.ts` — in-house 5-field parser + IST-aware `computeNextRunAt(cron, from)` that returns absolute UTC. Supports `*`, ints, ranges (`a-b`), lists (`a,b,c`), step values (`*/n`). Plain-English `describeCronIST()` for admin UI hints.
- All dispatchers are no-ops in week 2 — registered via `registerAgentDispatcher(name, fn)` from each agent's implementation file in weeks 2.3-2.5 / week 6.

**Institutional skeleton (✅ shipped week 2.6):**
- `server/db/institutional-skeleton.ts` — curated dataset of 54 organizations: 12 PSU banks (post-2020 consolidation), 20 major private banks, 5 financial regulators (RBI/SEBI/IRDAI/PFRDA/IFSCA), 5 government bodies (MoF, DFS, DEA, DIPAM, MCA), 7 DFIs (LIC, NABARD, SIDBI, NHB, EXIM, NaBFID, IREDA), 5 market infrastructure entities (NSE, BSE, MCX, NSDL, CDSL).
- `server/services/institutional-skeleton-seed.service.ts` — idempotent seeder: creates "Indian Financial System" domain if absent; upserts orgs by name within domain. Preserves any manually added orgs.
- `server/db/seed.ts` — entrypoint, run via `pnpm db:seed`. Reports drift counts.

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
| DB-DIALECT | `.env.example` says Postgres, live is MySQL | Fix env example in week 1; documented in CLAUDE.md |
| LEGACY-USERS | Live users table uses int IDs / camelCase columns; new tables FK users via `int` per migration convention; schema.ts declares `uuid` (compat shim) | Don't refactor until magic-link replaces password flow |
| EMAIL-API | No email API wired; magic-link blocked | Defer magic-link until ready |
| CLOUDFLARE-AUTH-WALL | Manus deployments behind Cloudflare turnstile occasionally block authenticated browser tests | Documented in `browser-validation-notes.md` |
| POLY-ORPHAN | `opportunity_links.target_id` and `watches.target_id` are polymorphic (no FK); rows orphan if target person/org is deleted | Trust-auditor agent (week 6) cleans up dangling rows |
| AGENT-CRON-EVENT | Event-driven agents (`dedup`, `path_recompute`) carry placeholder cron `* * * * *`; the runner MUST skip cron-based scheduling for any agent where `is_event_driven=true` | Implement in agent-runner service (week 2) |
| AGENT-CRON-TZ | All default cron expressions are written in IST (e.g., `0 4 * * *` = 04:00 IST). Manus servers may run UTC; the runner must apply IST offset when computing next_run_at | Implement in agent-runner service (week 2) |
| WATCH-DEDUP | No UNIQUE constraint on `watches(user_id, target_type, target_id)` — sectors/roles have NULL target_id which MySQL UNIQUE doesn't dedupe | App-level dedup in week 2 watches router |
| OWNERSHIP-CASCADE | `ownership.owner_user_id` ON DELETE CASCADE deletes ownership rows when user deleted, leaving people unowned. Mitigated because users are deactivated (`is_active=false`) not hard-deleted | Document; revisit if hard-delete becomes a flow |
| AGENT-SCHEDULE-RACE | Concurrent boots could create duplicate default schedules (agent_id isn't unique) | Admin can delete duplicates; runtime sync uses ON DUPLICATE KEY UPDATE for registry to prevent duplicates there |

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

- 2026-05-08 — feat(week3): universal command box + Today + Graph IA collapse. **Backend:** `server/services/intent-router.service.ts` classifies utterances into 9 tools (8 intents + unknown) via Claude Haiku 4.5 (~$0.0001/call); defensive JSON parse handles code-fence wrapping. `server/services/command-dispatcher.service.ts` dispatches each tool with graceful error/pending fallbacks (never throws to caller). 8 tools: findPath, briefPerson, logInteraction (extracts capitalized-word person candidates), searchIntel (org → recent power-moves), updateOpportunity (returns `pending` until week 5), addToWatchlist (auto-classifies type as person/organization/sector/role with honest copy), whoOwns (joins ownership + persons + users), coverageGap (sector → uncovered orgs with type mapping). New `server/routers/today.router.ts` (175 lines) exposes feed/dismissCard/actCard/command/classify with audit logging. **Frontend:** `Today.tsx` is the new `/` route — greeting + command box + ranked digest feed with 3 starter prompts in empty state. `Graph.tsx` collapses People/Organizations/Network/Paths into one surface with filter chips (existing pages stay mounted at original routes). `CommandBox.tsx` (340 lines) Apple-grade: live classification preview with 600ms debounce, Cmd/Ctrl+Enter submit, type-specific result renderers, voice mic placeholder for week 4. `DigestCard.tsx` (210 lines) 10 card types via meta map, optimistic dismiss with slide+fade. Sidebar restructured: Today → Graph → Dashboard → People → Organizations → Path Finder → Alerts → Briefings. **Tests:** 13 new vitest cases for intent catalog, empty-input short-circuit (no API call), every dispatcher tool's error path. **Bug-check (Rule 1, with Rule 3 6th lens):** 6 passes, 2 fixes, 3 consecutive clean. Fixes — F1.3: textarea max-h-200px to cap growth on long log entries; F3.1: addToWatchlist heuristic classification (capitalized phrases → "role", lowercase short phrases → "sector") so summary copy stays honest. Verification gates green. (commit pending)
- 2026-05-08 — feat(week2): ship Week 2 partial — agent runner + institutional skeleton seed + Agent Operations admin UI. **Files:** `server/services/agent-runner.service.ts` (runner with atomic claim, 60s tick, 5-min timeout, manual trigger), `server/services/cron-utils.ts` (in-house IST-aware parser + next-run computer), `server/db/institutional-skeleton.ts` (54 curated Indian financial institutions), `server/services/institutional-skeleton-seed.service.ts` (idempotent seeder), `server/db/seed.ts` (rewritten entrypoint), `server/routers/agents.router.ts` (6 admin procedures), `client/src/pages/admin/AgentOperations.tsx` (Apple-grade UI per Rule 3 — optimistic toggles, designed loading/empty/error states, AlertDialog for destructive actions, AAA-contrast badges in light/dark, 375px responsive). **Wired:** `server/index.ts` boots `syncAgentRegistry()` then starts runner; `server/routers.ts` registers `agents` namespace; `client/src/App.tsx` adds `/admin/agents` route; `DashboardLayout.tsx` adds nav link. **21 new tests** (cron parser correctness, IST next-run accuracy across DST-free year, skeleton dataset shape, agent-definition coverage). **Bug-check (Rule 1):** 10 passes, 4 fixes, 3 consecutive clean. Fixes — F1: drop wasted SQL placeholder in listSchedules + cast json columns at boundary; F3: optimistic UI on enable/dryRun toggle (Rule 3 #6); F6: overflow-x on runs table for 375px; F7: manual runs touch lastRunAt for UI consistency. **Defers to follow-on session:** 2.1 Apify configs for live ingestion, 2.3-2.5 real ingestion/dedup/change-detection dispatchers (need Apify token + cost-controlled live testing), 2.9 dispatcher integration tests. (commit `652c967`)
- 2026-05-08 — chore(rules): add **Rule 3 — Apple-grade UX** to `CLAUDE.md`. Senior-executive product means zero tolerance for clutter or jank; every UI surface must feel Apple-designed. Codifies HIG triad (clarity / deference / depth), 16 enforceable principles (one job per surface, zero-state-as-teaching, optimistic UI, designed loading states, error-says-what-why-next, undo over confirm, 44pt targets, motion has meaning, accessibility non-negotiable, voice-first, 80% clean over 100% cluttered, etc.), an 8-point UX self-review checklist (light/dark, keyboard-only, slow 3G, 375px, aria-labels, error paths, ear-test, "they cared" test) added as a 6th lens to Rule 1's bug-check for any `client/` change, and a list of refused anti-patterns (multi-line buttons, "Submit" labels, generic "Are you sure?", spinner-only loading, terminology drift). Existing pages grandfathered until touched. Saved as feedback memory for cross-session persistence. Bug-check: 4 passes, 3 fixes (typo, grandfathering clause, design-token reference), 3 consecutive clean. (commit `02e3250`)
- 2026-05-08 — chore(rules): codify two new workflow rules in `CLAUDE.md`: **Rule 1** — three consecutive clean bug-check passes required before any task is "done" (rotate lens each pass: correctness → schema → edge cases → security → consistency); **Rule 2** — read MAPS.md before starting + update MAPS.md in the same commit as any code change. Saved as feedback memories for cross-session persistence. (commit `b365425`)
- 2026-05-08 — fix(schema): bug-check pass on Week 1 strategic spine. **8 findings fixed across 12 passes** (3 consecutive clean to terminate):
  1. **Pass 1 (correctness):** Added missing `power_moves.agent_run_id` FK to `agent_runs.id` (forward-ref in schema.ts via `() => agentRuns.id`, ALTER TABLE in 0006 SQL); added inverse Drizzle relations on `usersRelations`, `personsRelations`, `domainsRelations`, `organizationsRelations` so `db.query.x.findFirst({ with: { ... } })` traverses to all 10 new tables.
  2. **Pass 3 (edge cases):** Made `syncAgentRegistry()` concurrency-safe via `INSERT ... ON DUPLICATE KEY UPDATE` (was vulnerable to race on multi-replica boot).
  3. **Pass 4 (security/RBAC):** Extended `AUDIT_ENTITY_TYPES` enum + ALTER TABLE on `audit_log.entity_type` to include the 9 new entity types (`opportunity`, `opportunity_link`, `watch`, `ownership`, `provenance`, `power_move`, `digest_card`, `agent_schedule`, `agent_run`) — without this, future routers couldn't audit-log mutations on new entities. Removed redundant `STRATEGIC_AUDIT_ENTITY_TYPES` const.
  4. **Pass 5 (consistency):** Removed stale MAPS reference to deleted `STRATEGIC_AUDIT_ENTITY_TYPES`.
  5. **Pass 6 (docs):** Added audit-log exemption rationale to `syncAgentRegistry()`. Added 6 new tracked-issue rows to MAPS section 14 (POLY-ORPHAN, AGENT-CRON-EVENT, AGENT-CRON-TZ, WATCH-DEDUP, OWNERSHIP-CASCADE, AGENT-SCHEDULE-RACE).
  6. **Pass 9 (planning):** Added 2.0 (wire `syncAgentRegistry()` into boot) to Week 2 checklist.
  Passes 10/11/12 clean — gates green: `pnpm check`, `pnpm build`, 39 test cases pass (3 unrelated pre-existing failures: DATABASE_URL env, APIFY_API_TOKEN env, scaffold.test layout dir). (commit `b365425`)
- 2026-05-08 — feat(schema): Week 1 strategic spine ships. Add 10 new tables (opportunities, opportunity_links, watches, ownership, provenance, power_moves, digest_cards, agent_registry, agent_schedules, agent_runs) + 12 new enum sets + 18 new Zod validation schemas + 11 new TypeScript types. Drizzle migrations 0005, 0006 with idempotent seed of 10 canonical agents (ingestion agents start disabled+dry-run as cost guardrail). New `agent-registry.service.ts` provides boot-time registry sync. 21 new vitest cases covering schema exports, stage transitions, validation rules, agent guardrails — all passing. `pnpm check` and `pnpm build` green. (commit `d4047ca`)
- 2026-05-08 — docs(plan): create IMPLEMENTATION_PLAN.md and MAPS.md with full audit of existing 22 tables, 20 routers, 19 pages, voice + Apify state. Establish MAPS-update rule in CLAUDE.md. (commit `318116c`)
