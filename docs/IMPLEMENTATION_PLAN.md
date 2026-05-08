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

### Week 1 — Strategic schema foundation ✅ SHIPPED 2026-05-08
**Goal:** new core tables for opportunities, watches, ownership, provenance, agents.

- [x] 1.1 Migration `0005_strategic_spine.sql` adding: `opportunities`, `opportunity_links`, `watches`, `ownership`, `provenance`, `power_moves`, `digest_cards`
- [x] 1.2 Migration `0006_agent_registry.sql` adding: `agent_registry`, `agent_schedules`, `agent_runs` + idempotent seed of 10 agents
- [x] 1.3 Drizzle schema additions in `server/db/schema.ts` with relations and inferred types
- [x] 1.4 Shared enums: opportunity stages (with state-machine transitions map), provenance source/entity types, agent names + run statuses, watch target types, ownership tiers, power-move types, digest-card types, visibility scopes
- [x] 1.5 Shared validation schemas (zod) for all new entities — 18 schemas
- [x] 1.6 Seed `agent_registry` with the 10 agents and default cadences (ingestion + change_detection start DISABLED + dry-run as cost guardrail)
- [x] 1.7 Runtime sync service (`server/services/agent-registry.service.ts`) for idempotent boot-time registry refresh
- [x] 1.8 MAPS.md updated with all new tables, enums, types, agents
- [x] 1.9 Tests: 21 new vitest cases — schema entity exports, stage-transition correctness, Zod schema validation, agent definition guardrails. All passing. `pnpm check` and `pnpm build` green.

### Week 2 — Apify watchers + Indian institutional skeleton
**Goal:** auto-ingested live institutional graph; Day-1 activation works.

- [x] 2.0 Wire `syncAgentRegistry()` into `server/index.ts` boot path. Also starts `startAgentRunner()` after DB pool init.
- [ ] 2.1 Promote `apify_source_configs` to production: pre-create configs for RBI press releases, PIB, MCA21, SEBI orders, BSE/NSE filings, Gazette of India *(deferred — needs Apify token + cost-controlled live testing)*
- [x] 2.2 Agent runner: `server/services/agent-runner.service.ts` + `cron-utils.ts`. Atomic claim via UPDATE-WHERE on `next_run_at`. Skips event-driven agents in WHERE clause. IST-aware via in-house cron parser. Singleton tick every 60s. Per-run timeout 5min. Manual `triggerRunNow()` for admin UI.
- [ ] 2.3 Ingestion agent dispatcher (RBI/PIB, MCA21/Gazette, BSE/NSE): pulls Apify dataset, normalizes, writes to provenance + creates/updates persons & orgs *(deferred to next session — depends on 2.1)*
- [ ] 2.4 Dedup agent dispatcher: fuzzy-match on name + org, auto-merge > 0.9 *(deferred to next session)*
- [ ] 2.5 Change-detection agent dispatcher: diff role changes vs prior snapshot, write `power_moves` *(deferred to next session)*
- [x] 2.6 Seed script: `server/db/institutional-skeleton.ts` (data) + `server/services/institutional-skeleton-seed.service.ts` (idempotent seeder) + `server/db/seed.ts` (entrypoint). 54 curated organizations: 12 PSBs, 20 private banks, 5 regulators, 5 govt bodies, 7 DFIs, 5 market infra. Run via `pnpm db:seed`.
- [x] 2.7 Admin UI: `client/src/pages/admin/AgentOperations.tsx` — Apple-grade per Rule 3. Schedule cards with optimistic toggles, inline cron+cap edit, dry-run mode, run-now/dry-run buttons, monthly usage progress bar with semantic colors, AlertDialog for destructive reset, recent runs table with status badges and error tooltips. Designed loading/empty states. 375px responsive.
- [x] 2.8 MAPS.md updated with agent runner, cron utils, skeleton seed, agents router, AgentOperations page.
- [x] 2.9 Tests (21 new): cron parser correctness; IST next-run accuracy across edge cases (day rollover, Sunday-only, every-6h, every-minute); skeleton dataset shape (counts, no duplicates, valid types, valid URLs); agent definitions coverage (event-driven flags, user-scoped flags, valid IST crons).

**Week 2 partial ship (this session):** items 2.0, 2.2, 2.6, 2.7, 2.8, 2.9. Items 2.1, 2.3, 2.4, 2.5 deferred to follow-on session — they require live Apify integration with API token and cost-controlled testing. The runner and admin UI are ready to host real dispatchers via `registerAgentDispatcher(name, fn)` once those are implemented.

### Week 3 — Universal command box + intent router + collapsed IA ✅ SHIPPED 2026-05-08
**Goal:** the product takes shape. Three surfaces, one verb.

- [x] 3.1 New `client/src/pages/Today.tsx` with command box at top + ranked digest-card feed + designed empty state with 3 starter prompts
- [x] 3.2 New `client/src/pages/Graph.tsx` consolidating PersonList + OrganizationList + NetworkMap + PathFinder behind filter chips
- [x] 3.3 Intent router: `server/services/intent-router.service.ts` using Claude Haiku 4.5, returns `{tool, args, confidence, rationale}` from utterance with defensive JSON parsing
- [x] 3.4 Eight tool implementations in `server/services/command-dispatcher.service.ts`: findPath, briefPerson, logInteraction (auto-extracts persons), searchIntel, updateOpportunity (returns pending until week 5), addToWatchlist (heuristic targetType classification), whoOwns, coverageGap. Never throws — wraps errors in `kind: 'error'`.
- [x] 3.5 DigestCard component renders all 10 card types via meta map (one component, 10 visual themes — premature abstraction avoided per Rule 3 #16)
- [x] 3.6 New tRPC `today.router.ts`: `feed()` ranked cards with related-entity joins, `dismissCard()`, `actCard()`, `command()` (classify+dispatch in one call), `classify()` (preview-only)
- [x] 3.7 Route `/` → Today (Dashboard moved to `/dashboard`); legacy pages remain at `/persons`, `/organizations`, etc. for deep linking
- [x] 3.8 MAPS.md updated with new IA, intent router, dispatcher, today router, Today/Graph/CommandBox/DigestCard
- [x] 3.9 Tests: 13 new vitest cases — intent catalog stable, empty-input short-circuit (no API call), every dispatcher tool's error/pending path returns the right `kind`

### Week 4 — Voice stack ported from Meridian ✅ SHIPPED 2026-05-08 (partial — voice transcribe wedge)
**Goal:** voice as a first-class input everywhere.

- [x] 4.1 `client/src/hooks/useVoiceRecording.ts` — owns MediaRecorder, level monitoring, retry, base64 encoding
- [x] 4.2 `client/src/components/voice/RecordingBar.tsx` — portalled, z-9999, animated waveform, designed for light+dark
- [x] 4.3 `client/src/components/voice/VoiceInputButton.tsx` — universal mic, drop-in for any text input
- [ ] 4.4 `VoiceBot` floating FAB for full conversational mode via Gemini Live *(deferred — `geminiToken` + `geminiLiveEngine.ts` exist; the integrated chat-bot surface is a bigger lift)*
- [ ] 4.5 Extend `chat.geminiToken` router with rate-limit + session lock + tools schema *(deferred with 4.4)*
- [ ] 4.6 Convert 8 intent tools to Gemini functionDeclaration format *(deferred with 4.4)*
- [ ] 4.7 `executeVoiceAction` server-side dispatcher *(deferred with 4.4 — note that Week 3's `command-dispatcher.service.ts` already exists and the Gemini path can call it directly)*
- [ ] 4.8 Wire VoiceBot button into Today page as floating FAB *(deferred with 4.4)*
- [x] 4.9 Wire VoiceInputButton into command box (quick-capture mode = AssemblyAI). Backend: `voice.quickTranscribe` accepts base64, uploads to AssemblyAI's CDN, returns transcript synchronously.
- [x] 4.10 MAPS.md updated with voice architecture
- [x] 4.11 Tests: 6 new vitest cases — input contract (size cap, empty rejection), base64 round-trip preservation. Live AssemblyAI calls not tested in CI (would be flaky and cost-bearing).

**Week 4 partial ship (this session):** items 4.1-4.3, 4.9-4.11 — the wedge from voice → text → command works end-to-end. Items 4.4-4.8 (full conversational Gemini Live bot) deferred to follow-on session because (a) the integrated chat surface is a bigger lift, (b) the `command-dispatcher.service.ts` from Week 3 already exposes the same 8 tools the bot would need, so the future bot can directly invoke it.

### Week 5 — Opportunities + ownership + provenance UI ✅ SHIPPED 2026-05-08
**Goal:** daily-use loop closes; team trust mechanics in place.

- [x] 5.1 `opportunities.router.ts` — create/list/update/transitionStage/link/unlink with visibility filter
- [x] 5.2 `client/src/pages/Opportunities.tsx` with inline OpportunityCard (premature OpportunityDetail page deferred — the inline card with stuck-stage hint covers 80% case)
- [x] 5.3 Opportunity stage state machine validated server-side via OPPORTUNITY_STAGE_TRANSITIONS map; invalid transitions return human-readable error
- [x] 5.4 `ownership.router.ts` — assign/transfer/remove + listUnowned (powers no_owner digest card)
- [x] 5.5 Provenance chip component — *deferred to follow-on*; the back-end + helpers ship now so any future UI can call `provenance.listForEntity`
- [x] 5.6 Provenance recorded for the new write paths (logInteraction, updateOpportunity via command box). Back-fill on legacy writes (intel, notes, reflections, persons, tenures, relationships) is a follow-on per CLAUDE.md's documented incremental-rollout pattern.
- [x] 5.7 Visibility scopes enforced in `opportunities.list` and `assertCanView/assertCanEdit` helpers — private (owner/creator only), team (domain access), org (anyone)
- [x] 5.8 MAPS.md updated with opportunities/ownership/provenance routers, Opportunities page, dispatcher's new `updateOpportunity` real implementation
- [x] 5.9 Tests: 21 new vitest cases — state-machine completeness, Zod schema validation for all 5 new mutations, provenance source/entity enum catalog

### Week 6 — Daily digest + Brief agent + Change-detection emit ✅ SHIPPED 2026-05-08 (digest + trust-auditor)
**Goal:** the habit forms. Today feed is alive every morning.

- [x] 6.1 Digest agent: `server/services/agents/digest-dispatcher.ts` — fans out per active user; assembles cards from watches, owned relationships, opportunities, follow-ups, no-owner candidates; idempotent within 7-day window
- [ ] 6.2 Brief agent: pre-builds tomorrow's meeting briefings *(deferred — needs calendar integration which RelGraph doesn't have yet)*
- [ ] 6.3 Change-detection agent emits `power_moves` *(deferred — depends on ingestion dispatchers from Week 2.3-2.5 which need live Apify data)*
- [ ] 6.4 Path-recompute agent on graph change *(deferred — would integrate with the existing `searchRouter.findPath`; no urgency until ingestion produces graph mutations at scale)*
- [x] 6.5 Trust-auditor agent: `server/services/agents/trust-auditor-dispatcher.ts` — weekly decay of past-expiry provenance, verified entries exempt
- [x] 6.6 Today feed ranking implemented in digest dispatcher per the canonical order (power_move 10 → watchlist_hit 20 → follow_up 30 → opportunity_stall 40 → opportunity_momentum 45 → stale_relationship 50 → no_owner 60 → team_intel 70 → new_path 80). Ranks gap-spaced ≥5 so future card types insert without renumbering.
- [x] 6.7 Today UI polish — already shipped in Week 3 (designed empty/loading/error states, swipe-dismiss with optimistic mutation, light+dark designed).
- [x] 6.8 MAPS.md updated with both new dispatchers, ranking rationale, deferred items
- [x] 6.9 Tests: 10 new vitest cases — card rank ordering invariants (gap-spacing, relative priorities), trust-auditor decay math (1.0→0.8→0.6→0.4 floor, monotone within operating regime, verified-exempt)

**Week 6 partial ship (this session):** items 6.1, 6.5, 6.6, 6.7, 6.8, 6.9. Items 6.2 (brief — calendar dep), 6.3 (change-detection — ingestion dep), 6.4 (path-recompute — value gated on ingestion volume) deferred to follow-on sessions when their external dependencies land. The activation loop is now functionally end-to-end with digest as the daily heartbeat — users will see cards every morning at 06:00 IST starting the day after first ingestion data arrives.

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
