import fs from "node:fs";
import path from "node:path";

const root = "/home/ubuntu/relgraph";

function write(relPath, content) {
  const fullPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
}

const packageJson = `{
  "name": "relgraph",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "scripts": {
    "dev": "tsx server/index.ts",
    "build": "vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist",
    "start": "NODE_ENV=production node dist/index.js",
    "preview": "vite preview --host",
    "check": "tsc --noEmit",
    "format": "prettier --write .",
    "test": "vitest run",
    "db:push": "drizzle-kit push",
    "db:seed": "tsx server/db/seed.ts",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.62.0",
    "@aws-sdk/client-s3": "^3.693.0",
    "@aws-sdk/s3-request-presigner": "^3.693.0",
    "@hookform/resolvers": "^5.2.2",
    "@radix-ui/react-accordion": "^1.2.12",
    "@radix-ui/react-alert-dialog": "^1.1.15",
    "@radix-ui/react-aspect-ratio": "^1.1.7",
    "@radix-ui/react-avatar": "^1.1.10",
    "@radix-ui/react-checkbox": "^1.3.3",
    "@radix-ui/react-collapsible": "^1.1.12",
    "@radix-ui/react-context-menu": "^2.2.16",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-hover-card": "^1.1.15",
    "@radix-ui/react-label": "^2.1.7",
    "@radix-ui/react-menubar": "^1.1.16",
    "@radix-ui/react-navigation-menu": "^1.2.14",
    "@radix-ui/react-popover": "^1.1.15",
    "@radix-ui/react-progress": "^1.1.7",
    "@radix-ui/react-radio-group": "^1.3.8",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-separator": "^1.1.7",
    "@radix-ui/react-slider": "^1.3.6",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-switch": "^1.2.6",
    "@radix-ui/react-tabs": "^1.1.13",
    "@radix-ui/react-toggle": "^1.1.10",
    "@radix-ui/react-toggle-group": "^1.1.11",
    "@radix-ui/react-tooltip": "^1.2.8",
    "@tanstack/react-query": "^5.90.2",
    "@trpc/client": "^11.6.0",
    "@trpc/react-query": "^11.6.0",
    "@trpc/server": "^11.6.0",
    "assemblyai": "^4.8.0",
    "bcrypt": "^6.0.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "cookie": "^1.0.2",
    "cookie-parser": "^1.4.7",
    "cors": "^2.8.5",
    "date-fns": "^4.1.0",
    "dotenv": "^17.2.2",
    "drizzle-orm": "^0.44.5",
    "embla-carousel-react": "^8.6.0",
    "express": "^4.21.2",
    "framer-motion": "^12.23.22",
    "input-otp": "^1.4.2",
    "jose": "6.1.0",
    "jsonwebtoken": "^9.0.2",
    "lucide-react": "^0.453.0",
    "next-themes": "^0.4.6",
    "openai": "^6.3.0",
    "pg": "^8.16.3",
    "react": "^19.2.1",
    "react-day-picker": "^9.11.1",
    "react-dom": "^19.2.1",
    "react-hook-form": "^7.64.0",
    "react-resizable-panels": "^3.0.6",
    "recharts": "^2.15.2",
    "sonner": "^2.0.7",
    "streamdown": "^1.4.0",
    "superjson": "^1.13.3",
    "tailwind-merge": "^3.3.1",
    "tailwindcss-animate": "^1.0.7",
    "vaul": "^1.1.2",
    "wouter": "^3.7.1",
    "zod": "^4.1.12"
  },
  "devDependencies": {
    "@builder.io/vite-plugin-jsx-loc": "^0.1.1",
    "@tailwindcss/typography": "^0.5.15",
    "@tailwindcss/vite": "^4.1.3",
    "@types/bcrypt": "^6.0.0",
    "@types/cookie-parser": "^1.4.9",
    "@types/cors": "^2.8.19",
    "@types/express": "4.17.21",
    "@types/google.maps": "^3.58.1",
    "@types/jsonwebtoken": "^9.0.10",
    "@types/node": "^24.7.0",
    "@types/pg": "^8.15.5",
    "@types/react": "^19.2.1",
    "@types/react-dom": "^19.2.1",
    "@vitejs/plugin-react": "^5.0.4",
    "autoprefixer": "^10.4.20",
    "drizzle-kit": "^0.31.4",
    "esbuild": "^0.25.0",
    "pnpm": "^10.15.1",
    "postcss": "^8.4.47",
    "prettier": "^3.6.2",
    "tailwindcss": "^4.1.14",
    "tsx": "^4.19.1",
    "tw-animate-css": "^1.4.0",
    "typescript": "5.9.3",
    "vite": "^7.1.7",
    "vite-plugin-manus-runtime": "^0.0.57",
    "vitest": "^2.1.4"
  },
  "packageManager": "pnpm@10.4.1+sha512.c753b6c3ad7afa13af388fa6d808035a008e30ea9993f58c6663e2bc5ff21679aa834db094987129aa4d488b86df57f7b634981b2f827cdcacc698cc0cfb88af",
  "pnpm": {
    "patchedDependencies": {
      "wouter@3.7.1": "patches/wouter@3.7.1.patch"
    },
    "overrides": {
      "tailwindcss>nanoid": "3.3.7"
    }
  }
}\n`;

const appTsx = `import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function HomeRoute() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container flex min-h-screen items-center justify-center py-16">
        <div className="w-full max-w-3xl rounded-3xl border border-border bg-card px-8 py-12 text-center shadow-sm">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-muted-foreground">
            RelGraph Starter Template
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            RelGraph
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Relationship Intelligence Platform starter scaffold built with React 19, Vite 7,
            TypeScript, Tailwind CSS 4, Wouter, Express, Drizzle, and Manus runtime integration.
          </p>
        </div>
      </div>
    </main>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />
      <Route>
        <HomeRoute />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
`;

const indexCss = `@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

:root {
  --radius: 0.8rem;
  --background: oklch(0.992 0.003 180);
  --foreground: oklch(0.218 0.014 188);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.218 0.014 188);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.218 0.014 188);
  --primary: oklch(0.641 0.118 171.5);
  --primary-foreground: oklch(0.985 0.004 180);
  --secondary: oklch(0.961 0.008 180);
  --secondary-foreground: oklch(0.314 0.018 188);
  --muted: oklch(0.968 0.004 180);
  --muted-foreground: oklch(0.511 0.014 188);
  --accent: oklch(0.953 0.016 171.5);
  --accent-foreground: oklch(0.262 0.018 188);
  --destructive: oklch(0.618 0.204 27.4);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.902 0.01 180);
  --input: oklch(0.902 0.01 180);
  --ring: oklch(0.641 0.118 171.5);
  --chart-1: oklch(0.641 0.118 171.5);
  --chart-2: oklch(0.642 0.149 278.4);
  --chart-3: oklch(0.642 0.164 41.7);
  --chart-4: oklch(0.647 0.144 337.6);
  --chart-5: oklch(0.653 0.126 236.8);
  --sidebar: oklch(0.985 0.003 180);
  --sidebar-foreground: oklch(0.218 0.014 188);
  --sidebar-primary: oklch(0.641 0.118 171.5);
  --sidebar-primary-foreground: oklch(0.985 0.004 180);
  --sidebar-accent: oklch(0.953 0.016 171.5);
  --sidebar-accent-foreground: oklch(0.262 0.018 188);
  --sidebar-border: oklch(0.902 0.01 180);
  --sidebar-ring: oklch(0.641 0.118 171.5);

  --relgraph-primary: #1d9e75;
  --relgraph-primary-light: #e1f5ee;
  --relgraph-primary-dark: #085041;

  --domain-psu-banking: #7f77dd;
  --domain-private-banking: #1d9e75;
  --domain-regulators: #d85a30;
  --domain-government: #d4537e;
  --domain-nbfc: #378add;
  --domain-corporates: #ba7517;

  --strength-dormant: #888780;
  --strength-acquaintance: #378add;
  --strength-active: #ba7517;
  --strength-strong: #1d9e75;
  --strength-champion: #639922;

  --input-voice: #d85a30;
  --input-text: #7f77dd;
  --input-auto: #888780;
  --input-card: #1d9e75;
}

.dark {
  --background: oklch(0.184 0.012 188);
  --foreground: oklch(0.962 0.004 180);
  --card: oklch(0.228 0.012 188);
  --card-foreground: oklch(0.962 0.004 180);
  --popover: oklch(0.228 0.012 188);
  --popover-foreground: oklch(0.962 0.004 180);
  --primary: oklch(0.672 0.125 171.5);
  --primary-foreground: oklch(0.182 0.012 188);
  --secondary: oklch(0.272 0.011 188);
  --secondary-foreground: oklch(0.928 0.004 180);
  --muted: oklch(0.272 0.011 188);
  --muted-foreground: oklch(0.758 0.012 188);
  --accent: oklch(0.302 0.017 171.5);
  --accent-foreground: oklch(0.946 0.003 180);
  --destructive: oklch(0.704 0.191 22.2);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(1 0 0 / 12%);
  --input: oklch(1 0 0 / 16%);
  --ring: oklch(0.672 0.125 171.5);
  --chart-1: oklch(0.672 0.125 171.5);
  --chart-2: oklch(0.699 0.142 278.4);
  --chart-3: oklch(0.705 0.171 41.7);
  --chart-4: oklch(0.686 0.155 337.6);
  --chart-5: oklch(0.688 0.142 236.8);
  --sidebar: oklch(0.214 0.012 188);
  --sidebar-foreground: oklch(0.952 0.003 180);
  --sidebar-primary: oklch(0.672 0.125 171.5);
  --sidebar-primary-foreground: oklch(0.182 0.012 188);
  --sidebar-accent: oklch(0.302 0.017 171.5);
  --sidebar-accent-foreground: oklch(0.946 0.003 180);
  --sidebar-border: oklch(1 0 0 / 12%);
  --sidebar-ring: oklch(0.672 0.125 171.5);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }

  html {
    scroll-behavior: smooth;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  button:not(:disabled),
  [role="button"]:not([aria-disabled="true"]),
  [type="button"]:not(:disabled),
  [type="submit"]:not(:disabled),
  [type="reset"]:not(:disabled),
  a[href],
  select:not(:disabled),
  input[type="checkbox"]:not(:disabled),
  input[type="radio"]:not(:disabled) {
    @apply cursor-pointer;
  }
}

@layer components {
  .container {
    width: 100%;
    margin-inline: auto;
    padding-inline: 1rem;
  }

  .flex {
    min-width: 0;
    min-height: 0;
  }

  @media (min-width: 640px) {
    .container {
      padding-inline: 1.5rem;
    }
  }

  @media (min-width: 1024px) {
    .container {
      max-width: 1280px;
      padding-inline: 2rem;
    }
  }
}
`;

const serverIndex = `import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./_core/oauth";
import { createContext } from "./_core/context";
import { appRouter } from "./routers";
import { serveStatic, setupVite } from "./_core/vite";

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

  server.listen(port, "0.0.0.0", () => {
    console.log(\`RelGraph server running on port \${port}\`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start RelGraph server", error);
  process.exit(1);
});
`;

const schemaPlaceholder = `export {};
`;
const libApi = `export {};
`;
const sharedPlaceholder = `export {};
`;
const seedTs = `console.log("RelGraph seed placeholder: no seed data defined yet.");
`;
const routesIndex = `export {};
`;
const middlewareIndex = `export {};
`;
const servicesIndex = `export {};
`;

const drizzleConfig = `import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
  verbose: true,
  strict: true,
});
`;

const tsconfigNode = `{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "drizzle.config.ts", "server/**/*.ts"]
}
`;

const componentsJson = `{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "client/src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
`;

const envExample = `# Database (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/relgraph

# Authentication
JWT_SECRET=change-this-to-a-random-secret
JWT_REFRESH_SECRET=change-this-to-another-random-secret

# AssemblyAI (voice transcription for quick-log)
ASSEMBLYAI_API_KEY=

# Google Gemini Live API (voice chat assistant)
# Must have Live API access enabled
GOOGLE_API_KEY=

# Anthropic Claude API (text chat agent + AI parsing)
ANTHROPIC_API_KEY=

# OpenAI (embeddings for agentic memory)
OPENAI_API_KEY=

# File storage
UPLOAD_DIR=./uploads
MAX_VOICE_FILE_SIZE=25MB
`;

const claudeMd = `# Project Instructions

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
`;

const readmeMd = `# RelGraph — Relationship Intelligence Platform

Relationship intelligence for organizational networks across Indian banking, government, regulatory, and corporate sectors.

## Status
Scaffold created by Manus AI. Features will be built on top of this starter template.

## Quick start
\`\`\`bash
pnpm install
cp .env.example .env
pnpm dev
\`\`\`

## Stack
React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + Wouter + Express + Drizzle ORM + PostgreSQL

## Structure
\`\`\`
client/   — Frontend (React + Vite)
server/   — Backend (Express + API routes)
shared/   — Shared types and constants
\`\`\`

## Deployment
Manus AI
`;

const scaffoldTest = `import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");

describe("RelGraph starter scaffold", () => {
  it("contains the required starter files and folders", () => {
    const requiredPaths = [
      "client/src/pages",
      "client/src/components/ui/button.tsx",
      "client/src/components/layout",
      "client/src/components/network",
      "client/src/components/person",
      "client/src/components/input",
      "client/src/components/chat",
      "client/src/components/alerts",
      "client/src/components/admin",
      "client/src/components/shared",
      "client/src/contexts",
      "client/src/hooks",
      "client/src/lib/api.ts",
      "server/index.ts",
      "server/routes",
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
    ];

    for (const relPath of requiredPaths) {
      expect(fs.existsSync(path.join(root, relPath)), \`\${relPath} should exist\`).toBe(true);
    }
  });

  it("includes the RelGraph design tokens in the stylesheet", () => {
    const css = fs.readFileSync(path.join(root, "client/src/index.css"), "utf8");
    expect(css).toContain("--relgraph-primary: #1d9e75");
    expect(css).toContain("--domain-psu-banking: #7f77dd");
    expect(css).toContain("--strength-champion: #639922");
    expect(css).toContain("--input-card: #1d9e75");
  });
});
`;

write("package.json", packageJson);
write("client/src/App.tsx", appTsx);
write("client/src/index.css", indexCss);
write("client/src/lib/api.ts", libApi);
write("server/index.ts", serverIndex);
write("server/db/schema.ts", schemaPlaceholder);
write("server/db/seed.ts", seedTs);
write("server/routes/index.ts", routesIndex);
write("server/middleware/index.ts", middlewareIndex);
write("server/services/index.ts", servicesIndex);
write("shared/types.ts", sharedPlaceholder);
write("shared/constants.ts", sharedPlaceholder);
write("shared/validation.ts", sharedPlaceholder);
write("shared/enums.ts", sharedPlaceholder);
write("drizzle.config.ts", drizzleConfig);
write("tsconfig.node.json", tsconfigNode);
write("components.json", componentsJson);
write(".env.example", envExample);
write("CLAUDE.md", claudeMd);
write("README.md", readmeMd);
write("server/scaffold.test.ts", scaffoldTest);

console.log("RelGraph starter scaffold files written.");
