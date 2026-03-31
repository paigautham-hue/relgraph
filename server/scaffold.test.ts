import fs from "node:fs";
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
      expect(fs.existsSync(path.join(root, relPath)), `${relPath} should exist`).toBe(true);
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
