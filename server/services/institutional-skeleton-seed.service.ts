/**
 * Institutional skeleton seed runner.
 *
 * Loads the curated list from `institutional-skeleton.ts` into the live DB,
 * idempotently:
 *   - If no domain exists named "Indian Financial System", create it.
 *   - For each org in the skeleton, upsert into `organizations` (matched by
 *     name within the skeleton domain). Existing orgs get their fields
 *     refreshed (city, website, type) but the row id is preserved.
 *
 * Returns counts. Designed to be run from a one-shot script (`pnpm db:seed`)
 * OR from an admin "Reload skeleton" button (week 5+).
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { domains, organizations } from "../db/schema";
import { ALL_SKELETON_ORGS } from "../db/institutional-skeleton";

const SKELETON_DOMAIN_NAME = "Indian Financial System";
const SKELETON_DOMAIN_DESCRIPTION =
  "Curated graph of Indian banks, regulators, ministries, DFIs, and market infrastructure. Auto-refreshed weekly.";
const SKELETON_DOMAIN_COLOR = "#1D9E75"; // brand teal

export async function seedInstitutionalSkeleton(): Promise<{
  domainId: string;
  domainCreated: boolean;
  orgsCreated: number;
  orgsUpdated: number;
  orgsUnchanged: number;
}> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // 1. Domain
  const [existingDomain] = await db
    .select()
    .from(domains)
    .where(eq(domains.name, SKELETON_DOMAIN_NAME))
    .limit(1);

  let domainId: string;
  let domainCreated = false;
  if (existingDomain) {
    domainId = existingDomain.id;
  } else {
    domainId = crypto.randomUUID();
    await db.insert(domains).values({
      id: domainId,
      name: SKELETON_DOMAIN_NAME,
      description: SKELETON_DOMAIN_DESCRIPTION,
      color: SKELETON_DOMAIN_COLOR,
      isActive: true,
    });
    domainCreated = true;
  }

  // 2. Orgs — match by (name, domainId). Use a single SELECT for the full set
  // to avoid N round trips, then diff in memory.
  const existing = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      shortName: organizations.shortName,
      type: organizations.type,
      city: organizations.city,
      website: organizations.website,
    })
    .from(organizations)
    .where(eq(organizations.domainId, domainId));

  const byName = new Map(existing.map(o => [o.name, o]));

  let orgsCreated = 0;
  let orgsUpdated = 0;
  let orgsUnchanged = 0;

  for (const skel of ALL_SKELETON_ORGS) {
    const present = byName.get(skel.name);
    if (!present) {
      await db.insert(organizations).values({
        id: crypto.randomUUID(),
        name: skel.name,
        shortName: skel.shortName,
        type: skel.type,
        city: skel.city,
        website: skel.website,
        domainId,
      });
      orgsCreated++;
      continue;
    }

    const drift =
      present.shortName !== skel.shortName ||
      present.type !== skel.type ||
      present.city !== skel.city ||
      present.website !== skel.website;

    if (drift) {
      await db
        .update(organizations)
        .set({
          shortName: skel.shortName,
          type: skel.type,
          city: skel.city,
          website: skel.website,
        })
        .where(eq(organizations.id, present.id));
      orgsUpdated++;
    } else {
      orgsUnchanged++;
    }
  }

  return { domainId, domainCreated, orgsCreated, orgsUpdated, orgsUnchanged };
}
