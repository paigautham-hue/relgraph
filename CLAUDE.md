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
- PostgreSQL with Drizzle ORM
- Schema in server/db/schema.ts
- Migrations via drizzle-kit

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
