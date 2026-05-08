# RelGraph Implementation Plan — v1.0

**Last updated:** 2026-05-08
**Owner:** Claude (with Gautham approval)
**Lifecycle:** This is the canonical plan. Changes to scope or sequence must edit this file in the same PR that changes code.

---

## North Star (one sentence)

**RelGraph is the live institutional graph of Indian power, with a voice-first command line that answers: "How do I reach who I need, why now, and through whom?"**

Every decision below traces back to that sentence. If a feature doesn't make it more true, cut it.

---

## The activation loop (three legs, in build order)

A relationship-intel app dies if any leg is missing. Most CRMs have one or two:

1. **Public ingestion (the moat).** Daily auto-pull from RBI press releases, PIB, MCA21, SEBI orders, BSE/NSE filings, Gazette of India, bank annual reports, key industry-body member lists. Apify is already wired — promote it from "import tool" to "always-running watchers." Without this leg, the graph is empty and stale on Day 1.

2. **Voice-first private capture (the wedge).** One mic button, anywhere. User says: *"Met Rajesh from SBI yesterday. Said digital lending approvals depend on Meera in risk."* AssemblyAI transcribes → Claude entity-resolves → creates/updates Person, Org, Edge, Note with provenance. Without this, capture stays a chore.

3. **Daily action brief (the habit).** Each morning: power-moves, briefings for tomorrow, follow-ups due, stale Tier-1, newly-opened warm paths, opportunity-momentum stalls. Card feed, not dashboard. Without this, nobody opens the app daily.

---

## Information architecture — three surfaces

1. **Today** — action feed. Cards: power-moves, briefings, follow-ups, stale, new-paths, intel-from-teammate, opportunity-stalls. Top of feed = universal command box (text + voice). No metrics dashboard.
2. **Graph** — single navigable space for people, orgs, opportunities. Filter chips. Click any node = profile drawer with provenance, paths, attached opportunities, ownership.
3. **Settings** — preferences, watchlist subscriptions, team admin, voice prefs, agent operations.

The current scaffold has Dashboard + PersonList + OrganizationList + NetworkMap + PathFinder + AlertsPage + BriefingsPage + PersonImportHistory = **8 pages collapsing into 2 (Today + Graph).** Admin pages stay under Settings.

---

## The universal command box

Top of Today, always-visible. One input that accepts text or voice. Behind it sits an **intent router** (Claude Haiku) that maps utterances to one of eight tools:

| Voice intent | Tool |
|---|---|
| "Reach the SBI CMD" | `findPath(target)` |
| "Brief me on Rajesh Kumar" | `briefPerson(name)` |
| "Met Rajesh yesterday, he said..." | `logInteraction(text)` |
| "What's new on ICICI?" | `searchIntel(org)` |
| "We got the LOI from SBI" | `updateOpportunity(name, stage, note)` |
| "Watch the new RBI Deputy Governor for me" | `addToWatchlist(target)` |
| "Who owns the HDFC relationship?" | `whoOwns(target)` |
| "Where are we weak in private banks?" | `coverageGap(sector)` |

Both voice and text flow through the same tool layer.

---

## Voice architecture (ported from Meridian)

Three layers:

### Layer 1 — `VoiceInputButton` (universal capture)
Inline `<Mic>` icon next to every text input. `MediaRecorder` → upload → AssemblyAI → text inserted. ~150 lines client. Reuses Meridian's `useVoiceRecording` hook + `RecordingBar` portal.

### Layer 2 — `VoiceBot` (Gemini Live conversational)
Floating action button → opens conversational mode. Backend `geminiRouter.getApiKey` (rate-limit 5/min, session lock 2-min TTL) returns key. Client opens WebSocket to `gemini-3.1-flash-live-preview` (v1beta, `?key=`). Tool definitions are RelGraph-specific (eight intents above). Streaming TTS. Function-calling for DB actions.

The repo already has `chat.router.ts:geminiToken` — extend it.

### Layer 3 — Intent router (text path)
Command box uses Claude Haiku to classify typed queries into the same eight tools.

---

## Data model additions

The current 22 tables cover persons, orgs, tenures (with dates!), relationships, interactions, reflections, intel, audit, alerts, briefings, chat, apify_*, bank_leadership_records.

**New tables required:**

| Table | Why |
|---|---|
| `opportunities` | First-class business initiatives with stage state machine |
| `opportunity_links` | Polymorphic links: opportunity → person | org | interaction |
| `watches` | User → (person | org | sector). Powers digest + alerts |
| `ownership` | Person → owning_user. Enforces "every Tier-1 has exactly one owner" |
| `provenance` | Polymorphic: any entity → {source_type, source_url, captured_by, captured_at, confidence, verified_by, verified_at, expires_at, content_hash} |
| `agent_registry` | Catalog of background agents (name, version, default_cadence, enabled) |
| `agent_schedules` | Per-agent cron + token_budget_cap + enabled (admin-configurable) |
| `agent_runs` | Execution history: agent_id, started_at, finished_at, status, items_processed, tokens_used, cost_usd, error |
| `power_moves` | Detected leadership/role changes from change-detection agent |
| `digest_cards` | Generated cards for daily action feed |

**Roles-with-tenure already exists** (`tenures` table has `startDate`, `endDate`, `isCurrent`, `source`, `sourceUrl`). This was the most important schema choice and it's already in place.

---

## Background agents

Each is a cron worker with observable status. Plain Postgres job queue (or MySQL — repo currently runs MySQL despite `.env.example` saying Postgres; see Issue #DB-DIALECT below).

| Agent | Default cadence | Job |
|---|---|---|
| Ingestion (RBI/PIB) | Every 6h | High-signal Indian regulator feeds |
| Ingestion (MCA21/Gazette) | Daily 2am | Slow-moving batch sources |
| Ingestion (BSE/NSE filings) | Daily 8pm | Post-market disclosure pull |
| Change-Detection | Daily 4am | Diffs prior 24h, emits power-moves |
| Dedup | On-write | Fuzzy-match new entities, auto-merge >0.9, queue 0.7-0.9 |
| Enrichment | Weekly Sunday | Backfill missing fields |
| Path-Recompute | Event-driven (graph change) | Re-run cached paths affected by moved node |
| Brief | Daily 5am per user | Pre-build tomorrow's meeting briefings |
| Trust-Auditor | Weekly | Demote stale facts past `expires_at` |
| Digest | Daily 6am per user | Assemble Today action feed |

**All cadences are admin-configurable via `agent_schedules` table.** Admin UI under Settings → Agent Operations: schedule, enable, source allowlist, token budget cap, run-now, dry-run mode, last-run/cost/status.

**Cost guardrails:**
- Per-agent monthly token cap. When hit → agent disables, posts alert card.
- Dry-run-by-default for new sources (first 7 days fetch+diff only, no LLM enrichment).
- Cheap-model first: Haiku for ingestion/dedup, Sonnet for change-summarization/briefings, full reasoning only for explicit user voice queries.
- Content-hash dedup: same source + content → never re-LLM.

---

## Auth tax reduction

Current state: working but loaded with legacy-MySQL-camelCase compatibility (see `debug-set-password-findings.md`). Live DB has columns `openId, loginMethod, createdAt, updatedAt, lastSignedIn`. Original code targeted Postgres; compat shims were added.

**Goal:** simplify and harden, not rebuild.

| Change | Why |
|---|---|
| Magic-link login (defer until email API ships) | Eliminate password flow churn |
| Domain auto-allow for `@manipalgroup.info` + configurable partner list | Cuts allowlist overhead for known orgs |
| Append-only audit log partitioned monthly | Already append-only by design; partitioning is stretch |
| Visibility scopes (`private` / `team` / `org`) on every fact | Multi-user trust |
| Ownership rule: every Tier-1 person has exactly one team owner | Prevents triple-contact and zero-contact |

Magic-link is **deferred** until the email API ships (already in `todo.md` as deferred). Until then: keep password flow, fix the legacy-schema landmines.

---

## Multi-user team rules

- Magic-link login (deferred, see above).
- Domain auto-allow for `@manipalgroup.info` + admin-configurable partner domains.
- Append-only audit log (already exists).
- Visibility scopes on every fact: `private | team | org`. Default `team`.
- Ownership rule on Person table: every Tier-1 person has exactly one owner. Today feed surfaces "X has no owner" until assigned.

---

## Day-1 activation experience

User signs up with `@manipalgroup.info` → magic-link (or password until email API) → lands on Today, already populated:
- Pre-built skeleton of Indian institutional power (top 50 banks PSU+private, RBI, SEBI, MoF, BSE-200 boards, key regulators), refreshed weekly via agent
- Auto-detected nearest paths from user's email domain to common targets
- Sample voice-capture prompt: "Tap the mic and tell me about your last meeting"

---

## What we are explicitly NOT building

- No metrics dashboard. Action feed only.
- No separate AI/Chat tab. AI is the command box and the agents.
- No personal-CRM features (mood, evening reflections, leadership scorecards from Meridian inspiration).
- No native iOS app yet. PWA-first; voice works in mobile Safari.
- No "relationship health score" in personal-CRM sense. Replace with Access × Path-Freshness × Decision-Authority.
- No Forums / Briefings / Alerts as separate pages. All output cards in Today.

---

## The 6-week build sequence

Each week is a coherent shippable chunk. **MAPS.md must be updated in the same commit** as any code change.

### Week 1 — Strategic schema foundation
**Goal:** new core tables for opportunities, watches, ownership, provenance, agents.

- [ ] 1.1 Migration `0005_strategic_spine.sql` adding: `opportunities`, `opportunity_links`, `watches`, `ownership`, `provenance`, `power_moves`, `digest_cards`
- [ ] 1.2 Migration `0006_agent_registry.sql` adding: `agent_registry`, `agent_schedules`, `agent_runs`
- [ ] 1.3 Drizzle schema additions in `server/db/schema.ts` with relations
- [ ] 1.4 Shared enums: opportunity stages, provenance source types, agent statuses, watch target types
- [ ] 1.5 Shared validation schemas (zod) for all new entities
- [ ] 1.6 Seed `agent_registry` with the 10 agents and default cadences
- [ ] 1.7 MAPS.md updated with all new tables, enums, and types
- [ ] 1.8 Tests: schema migration applies cleanly, drizzle types compile

### Week 2 — Apify watchers + Indian institutional skeleton
**Goal:** auto-ingested live institutional graph; Day-1 activation works.

- [ ] 2.1 Promote `apify_source_configs` to production: pre-create configs for RBI press releases, PIB, MCA21, SEBI orders, BSE/NSE filings, Gazette of India
- [ ] 2.2 Agent runner: `server/services/agent-runner.service.ts` reads `agent_schedules`, executes due agents
- [ ] 2.3 Ingestion agent implementation: pulls Apify dataset, normalizes, writes to provenance + creates/updates persons & orgs
- [ ] 2.4 Dedup agent: fuzzy-match on name + org, auto-merge > 0.9
- [ ] 2.5 Change-detection agent: diff role changes vs prior snapshot, write `power_moves`
- [ ] 2.6 Seed script: `server/db/seed-institutional-skeleton.ts` — top 50 banks, RBI, SEBI, MoF, top 100 BSE-200 boards (one-time bootstrap)
- [ ] 2.7 Admin UI: `client/src/pages/admin/AgentOperations.tsx` — schedule, enable, source allowlist, token cap, run-now, dry-run, last-run/cost
- [ ] 2.8 MAPS.md updated with agent runner, ingestion pipeline
- [ ] 2.9 Tests: agent runner respects cadence, dry-run skips LLM, token cap pauses agent

### Week 3 — Universal command box + intent router + collapsed IA
**Goal:** the product takes shape. Three surfaces, one verb.

- [ ] 3.1 New `client/src/pages/Today.tsx` with command box at top + card feed
- [ ] 3.2 New `client/src/pages/Graph.tsx` consolidating PersonList + OrganizationList + NetworkMap + PathFinder behind filter chips
- [ ] 3.3 Intent router: `server/services/intent-router.service.ts` using Claude Haiku, returns `{tool, args}` from utterance
- [ ] 3.4 Eight tool implementations wired to existing routers: `findPath, briefPerson, logInteraction, searchIntel, updateOpportunity, addToWatchlist, whoOwns, coverageGap`
- [ ] 3.5 Card components: `PowerMoveCard, BriefingCard, FollowUpCard, StaleCard, NewPathCard, IntelCard, OpportunityStallCard, NoOwnerCard`
- [ ] 3.6 New tRPC `today.router.ts`: `feed()` — returns ranked cards, `dismissCard()`, `actCard()`
- [ ] 3.7 Route `/` → Today (was Dashboard); old pages remain accessible via Graph filters
- [ ] 3.8 MAPS.md updated with new IA, intent router, tools, cards
- [ ] 3.9 Tests: intent router returns correct tool for sample utterances, today.feed returns ranked cards

### Week 4 — Voice stack ported from Meridian
**Goal:** voice as a first-class input everywhere.

- [ ] 4.1 `client/src/hooks/useVoiceRecording.ts` ported from Meridian
- [ ] 4.2 `client/src/components/RecordingBar.tsx` portalled to body, z-9999
- [ ] 4.3 `client/src/components/VoiceInputButton.tsx` — universal mic, slot into command box + every text input
- [ ] 4.4 `client/src/components/VoiceBot.tsx` — full conversational using Gemini Live
- [ ] 4.5 Server `geminiRouter.ts` (extend existing chat.geminiToken): rate-limit, session lock, return key + tools schema
- [ ] 4.6 Tool definitions for Gemini Live: convert eight intent tools to Gemini functionDeclaration format
- [ ] 4.7 `executeVoiceAction` server-side dispatcher: takes tool name + args, routes to existing routers, returns result
- [ ] 4.8 Wire VoiceBot button into Today page as floating FAB
- [ ] 4.9 Wire VoiceInputButton into command box (quick-capture mode = AssemblyAI; conversation mode = Gemini)
- [ ] 4.10 MAPS.md updated with voice architecture
- [ ] 4.11 Tests: voice transcription returns text, intent classification accuracy >85% on 20 sample utterances

### Week 5 — Opportunities + ownership + provenance UI
**Goal:** daily-use loop closes; team trust mechanics in place.

- [ ] 5.1 `opportunities.router.ts` with create/list/update/transitionStage; opportunity_links CRUD
- [ ] 5.2 New `client/src/components/OpportunityCard.tsx`, `OpportunityDetail.tsx`
- [ ] 5.3 Opportunity stage state machine: Identify → Map → Approach → Engage → Close → Maintain
- [ ] 5.4 `ownership.router.ts`: assign/transfer/list owners; "Tier-1 unowned" check
- [ ] 5.5 Provenance chip component: tap reveals source, captured-by, when, confidence, expires-at
- [ ] 5.6 Provenance auto-attached to every fact write (intel, interactions, notes, reflections, persons, tenures, relationships)
- [ ] 5.7 Visibility scopes enforced in domain-scoped procedures
- [ ] 5.8 MAPS.md updated with opportunity machine, ownership, provenance
- [ ] 5.9 Tests: stage transitions enforce valid moves, provenance written on every entity create

### Week 6 — Daily digest + Brief agent + Change-detection emit
**Goal:** the habit forms. Today feed is alive every morning.

- [ ] 6.1 Digest agent: assembles `digest_cards` for each user at 6am (their watches, owned relationships, opportunities, calendar)
- [ ] 6.2 Brief agent: at 5am, scans tomorrow's calendar for each user, pre-builds briefings
- [ ] 6.3 Change-detection agent emits `power_moves` → digest agent surfaces affected paths
- [ ] 6.4 Path-recompute agent triggers on graph change, updates cached paths for affected opportunities
- [ ] 6.5 Trust-auditor agent demotes stale facts weekly
- [ ] 6.6 Today feed ranking: power-moves > briefings > follow-ups > stale > new-paths > intel > opportunity-stalls > no-owner
- [ ] 6.7 Polish pass on Today UI: empty states, loading, swipe-dismiss
- [ ] 6.8 MAPS.md updated with all agents in production
- [ ] 6.9 Tests: digest assembles cards correctly, brief generates from calendar fixture

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| MySQL/Postgres dialect drift (live is MySQL, .env.example says Postgres) | Pin to MySQL in CLAUDE.md; fix `.env.example` in Week 1 |
| Apify costs balloon | Token caps + dry-run defaults + content-hash dedup |
| Email API not ready blocks magic-link | Defer magic-link; password flow stays |
| Old pages (Dashboard, NetworkMap) have users mid-build | Keep them mounted at old routes until Week 6 polish; only `/` switches |
| Voice features need Apple App Store review eventually | Defer Capacitor; PWA works in mobile Safari for now |
| Multi-user contention on shared graph writes | Ownership rule + visibility scopes ship in Week 5 |

---

## Definition of done

For every week:
- All checklist items checked
- Tests added and passing (`pnpm test`)
- `pnpm check` passes (TypeScript)
- `pnpm build` succeeds
- `MAPS.md` updated in same commits as code
- Commits use the format: `feat(area): description` or `fix(area): description`
- Pushed to `main` (Manus deploys from main)

---

## Continuation protocol

When a session ends mid-week, the next session starts by:
1. Reading this file's checklist for the current week
2. Reading `MAPS.md` for current state
3. Reading `git log --oneline -20` for recent context
4. Picking the next unchecked item

No task is "in progress" — either checked done with passing tests, or unchecked. Half-built items get reverted, not committed.
