# Project Instructions

## Deployment target
This project will be imported into Manus AI and deployed on Manus infrastructure.
Build and maintain it as a Manus-compatible static frontend project unless explicitly approved otherwise.

## App identity
RelGraph — Relationship Intelligence Platform.
Standalone relationship mapping and intelligence tool. No CRM integrations.

## Required stack
- React 19 + TypeScript + Vite 7 + Tailwind CSS 4
- pnpm (not npm or yarn)
- Wouter for routing
- shadcn/ui + Radix for components
- lucide-react for icons
- react-hook-form + zod for forms
- framer-motion for animation
- recharts for charts
- sonner for notifications
- Drizzle ORM + PostgreSQL for database
- ES modules throughout (never CommonJS)

## Required structure
- client/ — frontend source
- server/ — Express backend + API routes
- shared/ — shared types, constants, validation schemas
- Pages in client/src/pages/
- Components in client/src/components/ (organized by feature)
- Do not flatten into a single src/ directory
- Do not convert to Next.js or any other framework

## Styling
- Tailwind CSS 4 with design tokens in client/src/index.css
- Primary brand color: teal (#1D9E75)
- Use semantic tokens and shared primitives
- No hard-coded colors scattered across components

## Asset rules
- No large images, videos, or media in the project tree
- Use external/CDN URLs for large assets
- Only favicon, robots.txt, manifest.json in client/public/

## Database
- **MySQL** with Drizzle ORM (the live DB is MySQL — `.env.example` historically said Postgres; that is incorrect and will be fixed. `drizzle.config.ts` is the source of truth: `dialect: "mysql"`.)
- Schema in server/db/schema.ts
- Migrations via drizzle-kit, written to drizzle/
- The live `users` table has camelCase columns (`openId`, `loginMethod`, `createdAt`, `updatedAt`, `lastSignedIn`). Auth flows go through `server/services/auth.service.ts` which contains the compatibility layer. Do not bypass it.

## Key external services
- AssemblyAI for voice transcription of quick-log input (API key: ASSEMBLYAI_API_KEY)
- Google Gemini Live API for real-time voice chat (API key: GOOGLE_API_KEY). Use v1beta endpoint with ?key= auth. Model: gemini-3.1-flash-live-preview. See voice bot reference guide for implementation details.
- Anthropic Claude API for text chat agent and AI parsing (API key: ANTHROPIC_API_KEY)
- OpenAI for embeddings in agentic memory (API key: OPENAI_API_KEY)

## Environment variables
All required env vars documented in .env.example. Never hardcode secrets.

## Build and verification
Before finishing any task, run:
- pnpm check (TypeScript)
- pnpm build (production build)
Fix any failures before claiming done.

## Dev server
This is a full-stack app — pnpm dev runs tsx server/index.ts which starts Express with Vite middleware mode (not vite --host alone). This is a deliberate deviation from the standard Manus static frontend dev script because we need API routes in development. The production build and Express serving layer remain standard Manus-compatible.

## RBAC rules
Every API route must check user role level and domain access.
Every mutation must log to the audit table via audit middleware.
Audit log is append-only — never update or delete audit records.

## Handoff standard
Leave the repo so that:
1. pnpm install works cleanly
2. pnpm dev starts without manual repair
3. pnpm build succeeds
4. Another agent can understand the structure immediately

## Strategic plan
The full implementation plan lives in `docs/IMPLEMENTATION_PLAN.md`. The 6-week sequence is the canonical roadmap. Do not reorder or descope without updating that file in the same PR.

## Workflow rules (HARD — apply to every task)

### Rule 1 — Three-pass bug check before declaring done

After you believe a task is finished, you MUST perform at least three sequential bug-check passes. A "pass" is a deliberate, structured re-read of every file you touched (and adjacent files that consume them) looking for:

- **Pass focus areas** (rotate emphasis each pass — don't repeat the same lens):
  1. **Correctness** — wrong logic, off-by-one, inverted conditions, missing null checks, type mismatches the compiler missed (any/unknown), unreachable branches, async/await mistakes, race conditions, wrong column names, FK to wrong table, wrong direction on comparisons, swapped arguments
  2. **Schema & migration** — column types match across schema.ts and SQL, FK target types correct (int vs varchar(36) for users.id legacy), enum values match between TS enum + Drizzle pgEnum + SQL DDL, indexes on right columns, UNIQUE/NOT NULL where required, ON DELETE behaviour sensible, no orphaned references
  3. **Edge cases** — empty inputs, single-element collections, null/undefined inputs, very large inputs, unicode/special chars, concurrent writes, retry idempotency, time-zone handling, dates near boundaries, missing optional fields, what happens when DB is unavailable
  4. **Security & RBAC** — every new procedure has correct authorization tier (publicProcedure / protectedProcedure / contributorProcedure / adminProcedure / domainScopedProcedure), no SQL injection, no auth bypass, no PII leak, audit log written for mutations, secrets not logged, visibility scopes enforced, ownership boundaries respected
  5. **Consistency** — code matches MAPS.md, MAPS.md matches code, naming conventions followed (camelCase TS, snake_case SQL), file placement matches structure (CLAUDE.md required structure), enums centralized in shared/enums.ts, no duplicated constants

- **Stopping rule:** continue passes until you have **at least three consecutive passes that find zero bugs**. If a pass finds even one bug, fix it and reset the counter — the next pass becomes pass 1 again. Three clean passes in a row = done.

- **Document it:** in the commit message or PR body, state: "Bug-check: N total passes, M findings fixed, 3 consecutive clean passes." If finding & fixing reveals architectural drift, update MAPS.md per Rule 2.

- **What counts as a "bug" worth fixing now vs filing:** anything that breaks correctness, security, or user-visible behaviour → fix now. Style nits, minor refactors, or hypothetical future hardening → file as a TODO or skip.

### Rule 2 — Read MAPS.md before starting; update MAPS.md after every change

**Before any task:**
1. Read `MAPS.md` cover-to-cover (or at least the sections you'll touch)
2. Read `docs/IMPLEMENTATION_PLAN.md` for current week's checklist
3. Read recent `git log --oneline -20` for context

**After any change:**
- Every commit that adds, changes, or removes code MUST update the relevant section of MAPS.md in the **same commit**
- Append a Changelog entry at the bottom of MAPS.md with date, type, area, description, and (after push) commit SHA
- If you discover MAPS has drifted from code reality, fix MAPS as part of the change — never leave it stale
- A PR is not done until MAPS reflects reality. Reviewers should reject any code-changing PR that does not touch MAPS.

This is what keeps RelGraph maintainable as the codebase grows. Read MAPS first when picking up work; write to MAPS last when finishing.

### Rule 3 — Apple-grade UX: frictionless, designed not assembled

Every pixel and interaction must feel like Apple would have shipped it. RelGraph users are senior executives — their tolerance for clutter, ambiguity, or jank is zero. "It works" is not enough; the product must feel inevitable.

**The Apple HIG triad as our floor:**
- **Clarity** — type is legible, icons precise, every element earns its place. No decoration that doesn't communicate.
- **Deference** — UI defers to content. Chrome (toolbars, panels, separators) is light; data is bold. The graph, the brief, the opportunity card is the hero.
- **Depth** — visual hierarchy through space and motion, not borders. Cards float; sheets slide; transitions explain.

**Frictionless interaction principles (every screen MUST satisfy):**

1. **One job per surface.** Each page answers exactly one question. Today = "what should I do now?" Graph = "who do I need?" Settings = "how do I configure this?" No mixed-intent pages.
2. **Zero-state is a teaching moment, never a void.** Every empty list, search-with-no-results, never-used feature shows: a one-line explanation + one obvious next action + a sample/example if applicable. "No opportunities yet — tap + to create your first one or speak it: '/opp NBFC acquisition.'"
3. **Defaults are sane and explicit.** Forms pre-fill what we know. New opportunities default to `identify` stage and the user's domain. New watches default to digest=on, push=off. The user changes defaults only when they want something different.
4. **Direct manipulation > modals.** Edit-in-place over a separate edit screen. Drag-to-reorder over arrow buttons. Swipe-to-dismiss over a "delete" button buried in a menu. Modals only for irreversible decisions (delete, transfer ownership, send broadcast).
5. **Progressive disclosure.** Show the 3 things 80% of users need; hide the other 17 behind a clear affordance ("More", "Advanced"). Don't ship 20 fields at once.
6. **Optimistic UI.** Mutations look instant. State updates locally before the server confirms; on failure, roll back with a clear toast. Never make the user wait on a spinner for something fast.
7. **Loading states are designed, not absent.** Skeleton placeholders that match the final layout. No content-shift jank. No blank-white flash. No bare `Loading…` text on a critical surface.
8. **Errors never say just "Error."** Every error states: what happened (in human language), why it likely happened, what the user can do next. "Couldn't reach the server. Check your connection and tap retry." Not "Network error".
9. **Forgiveness over confirmation.** Prefer "Undo" toasts over "Are you sure?" dialogs. Reserve confirmation for destructive + irreversible (drop user, transfer ownership, send broadcast to >50 people).
10. **44pt minimum touch targets.** Even on desktop. Every clickable element gets enough hit area that a thumb works on mobile and a trackpad cursor doesn't miss.
11. **Type scale & spacing are tokens, not magic numbers.** Font sizes from a defined scale; spacing from Tailwind's 4px grid (Tailwind 4's default). No `padding: 13px` anywhere. Use the design tokens in `client/src/index.css` and the brand teal `#1D9E75` from `CLAUDE.md > Styling`. If a token doesn't exist for what you need, add one to `index.css` rather than inlining a value.
12. **Motion has meaning.** Transitions explain state change (slide-in = "this came from there"; fade = "this replaced that"). 200-300ms ease-out for most. Never decoration. Respect `prefers-reduced-motion`.
13. **Accessibility is non-negotiable.** Every interactive element keyboard-navigable with visible focus rings. Every icon button has an `aria-label`. Color is never the only signal (use icon + color). WCAG AA contrast minimum on text. Screen reader testable.
14. **System theme respected.** Light and dark mode both ship at the same time. The dark mode is not "light with inverted colors" — it's designed.
15. **Voice-first inputs everywhere.** Per the product spec, every text input has the universal mic. The mic is never an afterthought — its press-and-hold flow is as polished as a native iOS Messages voice note.
16. **No premature features.** Ship the 80% solution clean rather than the 100% solution cluttered. A button that does one thing right beats a dropdown of five half-things.

**Grandfathering existing screens.** Pages that pre-date this rule (Dashboard, PersonList, OrganizationList, NetworkMap, PathFinder, AlertsPage, BriefingsPage, PersonImportHistory, all of `admin/*`) are grandfathered until you touch them. The moment you modify an existing screen, it must comply with this rule end-to-end before the change is "done" — no half-Apple, half-legacy. Net effect: every PR that touches a screen leaves it cleaner than it was.

**UX self-review pass (run as a 6th lens during Rule 1 bug-check on any change that touches `client/`):**
- Open the new screen in light mode + dark mode side by side. Both feel intentional?
- Tab through with keyboard only. Every action reachable? Focus rings visible?
- Throttle network to "slow 3G" in DevTools. Does it still feel acceptable?
- Resize to 375px width (iPhone SE). Nothing breaks, no horizontal scroll?
- Hover/long-press every icon. Tooltip / aria-label present?
- Trigger every error path (kill backend, send bad input). Error message human-readable + actionable?
- Read aloud the empty states, error messages, button labels. Do any sound like they came from an engineer rather than a designer?
- One year from now, will another developer look at this and say "they cared"?

If any answer is "no", the change isn't done.

**Anti-patterns to refuse, even if asked:**
- Multi-line buttons. Buttons are nouns or short verb-phrases.
- "Submit" as a button label. Use the verb of what happens: "Save", "Send", "Create opportunity".
- "Are you sure?" dialogs without naming the action and its consequence.
- Spinner-only loading on screens that load > 500ms.
- Settings buried behind 3+ taps when they belong on the main screen.
- Required fields with no indication they're required until you submit.
- Tooltips that say the same thing as the label they decorate.
- Generic stock illustrations to fill empty states. Use clean type + a single icon.
- Toast messages that auto-dismiss on critical actions. The user must read it.
- Different terminology for the same thing across screens ("opportunity" vs "deal" vs "initiative" — pick one and don't drift).

## Status tracking
- Active plan: `docs/IMPLEMENTATION_PLAN.md`
- Authoritative state: `MAPS.md`
- Open work: `todo.md` (legacy; new work tracked in IMPLEMENTATION_PLAN checklists)
