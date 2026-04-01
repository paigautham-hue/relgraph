import { getDb } from '../db';
import { alerts, relationships } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';

// Check for relationship decay (no interaction in 90+ days)
export async function checkRelationshipDecay() {
  const db = getDb();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const strongRelationships = await db.select().from(relationships)
    .where(eq(relationships.strengthLabel, 'strong' as any));

  const decayAlerts = [];
  for (const rel of strongRelationships) {
    if (rel.lastInteractionAt && rel.lastInteractionAt < ninetyDaysAgo) {
      decayAlerts.push({
        type: 'relationship_decay' as const,
        severity: 'warning' as const,
        title: `Relationship decay detected`,
        description: `A strong relationship has had no interaction in over 90 days. Last interaction: ${rel.lastInteractionAt.toISOString().split('T')[0]}`,
        personId: rel.sourcePersonId,
      });
    }
  }

  if (decayAlerts.length > 0) {
    await db.insert(alerts).values(decayAlerts);
  }

  return decayAlerts.length;
}

export async function getAlerts(filters?: { type?: string; isDismissed?: boolean }) {
  const db = getDb();
  const conditions = [];
  if (filters?.type) conditions.push(eq(alerts.type, filters.type as any));
  if (filters?.isDismissed !== undefined) conditions.push(eq(alerts.isDismissed, filters.isDismissed));

  return db.select().from(alerts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(alerts.createdAt))
    .limit(100);
}
