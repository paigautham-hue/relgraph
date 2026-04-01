import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { persons, organizations, interactions, relationships } from "../db/schema";
import { count, eq, sql } from "drizzle-orm";
import { STRENGTH_RANGES } from "@shared/constants";

export const dashboardRouter = router({
  stats: protectedProcedure.query(async () => {
    const db = getDb();

    const [
      [{ personsCount }],
      [{ organizationsCount }],
      [{ interactionsCount }],
      [{ relationshipsCount }],
    ] = await Promise.all([
      db.select({ personsCount: count() }).from(persons),
      db.select({ organizationsCount: count() }).from(organizations),
      db.select({ interactionsCount: count() }).from(interactions),
      db.select({ relationshipsCount: count() }).from(relationships),
    ]);

    // Strength distribution
    const strengthDistribution = await db
      .select({
        label: relationships.strengthLabel,
        count: count(),
      })
      .from(relationships)
      .groupBy(relationships.strengthLabel);

    const strengthMap: Record<string, number> = {};
    for (const row of strengthDistribution) {
      if (row.label) strengthMap[row.label] = row.count;
    }

    // Recent interactions (count in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [{ recentInteractionsCount }] = await db
      .select({ recentInteractionsCount: count() })
      .from(interactions)
      .where(sql`${interactions.occurredAt} >= ${thirtyDaysAgo}`);

    // Tracked persons count
    const [{ trackedPersonsCount }] = await db
      .select({ trackedPersonsCount: count() })
      .from(persons)
      .where(eq(persons.isTracked, true));

    return {
      persons: personsCount,
      organizations: organizationsCount,
      interactions: interactionsCount,
      relationships: relationshipsCount,
      trackedPersons: trackedPersonsCount,
      recentInteractions: recentInteractionsCount,
      strengthDistribution: strengthMap,
    };
  }),
});
