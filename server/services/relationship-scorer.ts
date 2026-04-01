import { getDb } from '../db';
import { relationships, interactions, interactionParticipants } from '../db/schema';
import { eq } from 'drizzle-orm';

interface ScoringFactors {
  recency: number;      // Exponential decay from last interaction
  frequency: number;    // Interactions per quarter
  depth: number;        // Weighted by interaction type
  reciprocity: number;  // Binary
}

const DEPTH_WEIGHTS: Record<string, number> = {
  meal: 10,
  one_on_one_meeting: 8,
  group_meeting: 5,
  conference: 3,
  phone_call: 6,
  event: 4,
  email: 2,
  social: 3,
  other: 2,
};

export function getStrengthLabel(score: number): string {
  if (score <= 20) return 'dormant';
  if (score <= 40) return 'acquaintance';
  if (score <= 60) return 'active';
  if (score <= 80) return 'strong';
  return 'champion';
}

export async function calculateRelationshipScore(
  sourcePersonId: string,
  targetPersonId: string,
): Promise<{ score: number; label: string; factors: ScoringFactors }> {
  const db = getDb();

  // Get interactions involving both persons
  const sourceParticipations = await db.select({ interactionId: interactionParticipants.interactionId })
    .from(interactionParticipants)
    .where(eq(interactionParticipants.personId, sourcePersonId));
  const targetParticipations = await db.select({ interactionId: interactionParticipants.interactionId })
    .from(interactionParticipants)
    .where(eq(interactionParticipants.personId, targetPersonId));

  const sourceIds = new Set(sourceParticipations.map(p => p.interactionId));
  const sharedInteractionIds = targetParticipations
    .filter(p => sourceIds.has(p.interactionId))
    .map(p => p.interactionId);

  // Get shared interactions
  const sharedInteractions: any[] = [];
  if (sharedInteractionIds.length > 0) {
    for (const id of sharedInteractionIds) {
      const [interaction] = await db.select().from(interactions).where(eq(interactions.id, id));
      if (interaction) sharedInteractions.push(interaction);
    }
  }

  const now = Date.now();

  // Recency: exponential decay from most recent interaction
  let recency = 0;
  if (sharedInteractions.length > 0) {
    const mostRecent = sharedInteractions.sort((a, b) =>
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    )[0];
    const daysSince = (now - new Date(mostRecent.occurredAt).getTime()) / (1000 * 60 * 60 * 24);
    recency = Math.max(0, 25 * Math.exp(-daysSince / 90)); // Decays over 90 days
  }

  // Frequency: interactions in last 90 days
  const recentInteractions = sharedInteractions.filter(i =>
    (now - new Date(i.occurredAt).getTime()) < 90 * 24 * 60 * 60 * 1000
  );
  const frequency = Math.min(25, recentInteractions.length * 5);

  // Depth: weighted by interaction type
  let depthTotal = 0;
  for (const i of sharedInteractions.slice(0, 10)) {
    depthTotal += DEPTH_WEIGHTS[i.type] || 2;
  }
  const depth = Math.min(25, depthTotal);

  // Reciprocity (simplified)
  const reciprocity = sharedInteractions.length >= 2 ? 25 : sharedInteractions.length >= 1 ? 12 : 0;

  const score = Math.min(100, Math.round(recency + frequency + depth + reciprocity));
  const label = getStrengthLabel(score);

  return { score, label, factors: { recency, frequency, depth, reciprocity } };
}

// Update all relationship scores (batch job)
export async function recalculateAllScores() {
  const db = getDb();
  const allRelationships = await db.select().from(relationships);

  for (const rel of allRelationships) {
    const { score, label } = await calculateRelationshipScore(rel.sourcePersonId, rel.targetPersonId);
    await db.update(relationships).set({
      strengthScore: score,
      strengthLabel: label as any,
      updatedAt: new Date(),
    }).where(eq(relationships.id, rel.id));
  }

  return { updated: allRelationships.length };
}
