/**
 * Seed runner. Currently:
 *   - Seeds the Indian Institutional Skeleton (week 2.6) — 54 organizations
 *     covering all PSU banks, top private banks, key regulators, MoF + DFS
 *     and other government bodies, DFIs, and market infrastructure.
 *
 * Idempotent: re-running is safe and reports drift counts.
 *
 * Invocation: `pnpm db:seed`
 */

import { getDb } from "../db";
import { seedInstitutionalSkeleton } from "../services/institutional-skeleton-seed.service";

async function seed() {
  const db = getDb();
  if (!db) throw new Error("Database connection is not available.");

  console.log("[seed] Starting institutional skeleton seed...");
  const result = await seedInstitutionalSkeleton();
  console.log("[seed] Skeleton domain:", result.domainCreated ? "created" : "exists", `(${result.domainId})`);
  console.log(
    `[seed] Organizations: ${result.orgsCreated} created, ${result.orgsUpdated} updated, ${result.orgsUnchanged} unchanged.`,
  );
}

seed()
  .then(() => {
    console.log("[seed] Done.");
    process.exit(0);
  })
  .catch(error => {
    console.error("[seed] Failed:", error);
    process.exit(1);
  });
