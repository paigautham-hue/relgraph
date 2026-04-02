import { getDb } from '../db';
import {
  persons,
  organizations,
  relationships,
  reflections,
  interactions,
  interactionParticipants,
  personIntel,
  personNotes,
  tenures,
  users,
  domains,
} from '../db/schema';
import { eq, and, or, like, desc, sql } from 'drizzle-orm';

// Search for a person by name, title, or org
export async function searchPerson(query: string) {
  const db = getDb();
  const results = await db.select({
    id: persons.id,
    name: persons.name,
    title: persons.currentTitle,
    category: persons.category,
    orgName: organizations.name,
    domainName: domains.name,
  })
    .from(persons)
    .leftJoin(organizations, eq(persons.currentOrgId, organizations.id))
    .leftJoin(domains, eq(organizations.domainId, domains.id))
    .where(like(persons.name, `%${query}%`))
    .limit(5);

  return results;
}

// Get all relationships for a person with strength scores
export async function getRelationships(personId: string) {
  const db = getDb();
  // Get relationships where person is source or target
  const rels = await db.select({
    id: relationships.id,
    type: relationships.type,
    strengthScore: relationships.strengthScore,
    strengthLabel: relationships.strengthLabel,
    lastInteractionAt: relationships.lastInteractionAt,
    originStory: relationships.originStory,
    sourcePersonId: relationships.sourcePersonId,
    targetPersonId: relationships.targetPersonId,
  })
    .from(relationships)
    .where(or(eq(relationships.sourcePersonId, personId), eq(relationships.targetPersonId, personId)));

  // Resolve person names
  const personIds = new Set<string>();
  for (const r of rels) {
    personIds.add(r.sourcePersonId);
    personIds.add(r.targetPersonId);
  }

  const personNames: Record<string, string> = {};
  if (personIds.size > 0) {
    const pidArray = Array.from(personIds);
    for (const pid of pidArray) {
      const [p] = await db.select({ id: persons.id, name: persons.name })
        .from(persons)
        .where(eq(persons.id, pid))
        .limit(1);
      if (p) personNames[p.id] = p.name;
    }
  }

  return rels.map(r => ({
    ...r,
    sourcePersonName: personNames[r.sourcePersonId] || 'Unknown',
    targetPersonName: personNames[r.targetPersonId] || 'Unknown',
    connectedPersonName: r.sourcePersonId === personId
      ? personNames[r.targetPersonId]
      : personNames[r.sourcePersonId],
  }));
}

// Find warmest connection path using BFS with weighted edges
export async function findConnectionPath(targetPersonId: string, maxHops: number = 4) {
  const db = getDb();
  // Get all relationships as an adjacency list
  const allRels = await db.select().from(relationships);

  // Build adjacency list
  const graph: Record<string, { personId: string; strength: number; relId: string }[]> = {};
  for (const r of allRels) {
    if (!graph[r.sourcePersonId]) graph[r.sourcePersonId] = [];
    if (!graph[r.targetPersonId]) graph[r.targetPersonId] = [];
    graph[r.sourcePersonId].push({ personId: r.targetPersonId, strength: r.strengthScore, relId: r.id });
    graph[r.targetPersonId].push({ personId: r.sourcePersonId, strength: r.strengthScore, relId: r.id });
  }

  // BFS to find paths up to maxHops
  const visited = new Set<string>();
  const queue: { personId: string; path: string[]; minStrength: number }[] = [];

  const neighbors = graph[targetPersonId] || [];
  if (neighbors.length === 0) return [];

  // Reverse search from target
  queue.push({ personId: targetPersonId, path: [targetPersonId], minStrength: 100 });
  const paths: { path: string[]; minStrength: number }[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.path.length > maxHops + 1) continue;
    if (visited.has(current.personId) && current.path.length > 2) continue;
    visited.add(current.personId);

    if (current.path.length >= 2) {
      paths.push(current);
    }

    const edges = graph[current.personId] || [];
    for (const edge of edges) {
      if (!current.path.includes(edge.personId)) {
        queue.push({
          personId: edge.personId,
          path: [...current.path, edge.personId],
          minStrength: Math.min(current.minStrength, edge.strength),
        });
      }
    }
  }

  // Sort by minStrength descending (warmest first)
  paths.sort((a, b) => b.minStrength - a.minStrength);

  // Resolve names for top paths
  const topPaths = paths.slice(0, 5);
  const allPersonIds = Array.from(new Set(topPaths.flatMap(p => p.path)));
  const nameMap: Record<string, string> = {};
  for (const pid of allPersonIds) {
    const [p] = await db.select({ id: persons.id, name: persons.name })
      .from(persons)
      .where(eq(persons.id, pid))
      .limit(1);
    if (p) nameMap[p.id] = p.name;
  }

  return topPaths.map(p => ({
    path: p.path.map(id => ({ id, name: nameMap[id] || 'Unknown' })),
    minStrength: p.minStrength,
  }));
}

// Get reflections for a person, optionally filtered by category
export async function searchReflections(personId: string, category?: string, limit: number = 10) {
  const db = getDb();
  const conditions = [eq(reflections.personId, personId)];
  if (category) conditions.push(eq(reflections.category, category as any));

  const results = await db.select({
    id: reflections.id,
    category: reflections.category,
    content: reflections.content,
    confidenceLevel: reflections.confidenceLevel,
    authorName: users.name,
    createdAt: reflections.createdAt,
  })
    .from(reflections)
    .leftJoin(users, eq(reflections.authorId, users.id))
    .where(and(...conditions))
    .orderBy(desc(reflections.createdAt))
    .limit(limit);

  return results;
}

// Get recent interactions for a person
export async function getInteractions(personId: string, limit: number = 10) {
  const db = getDb();
  const participations = await db.select({ interactionId: interactionParticipants.interactionId })
    .from(interactionParticipants)
    .where(eq(interactionParticipants.personId, personId));

  if (participations.length === 0) return [];

  const interactionIds = participations.map(p => p.interactionId);
  const results = await db.select({
    id: interactions.id,
    type: interactions.type,
    summary: interactions.summary,
    occurredAt: interactions.occurredAt,
    location: interactions.location,
    createdByName: users.name,
  })
    .from(interactions)
    .leftJoin(users, eq(interactions.createdBy, users.id))
    .where(sql`${interactions.id} IN (${sql.join(interactionIds.map(id => sql`${id}`), sql`, `)})`)
    .orderBy(desc(interactions.occurredAt))
    .limit(limit);

  return results;
}

// Search organization by name
export async function searchOrganization(query: string) {
  const db = getDb();
  return db.select({
    id: organizations.id,
    name: organizations.name,
    shortName: organizations.shortName,
    city: organizations.city,
    domainName: domains.name,
  })
    .from(organizations)
    .leftJoin(domains, eq(organizations.domainId, domains.id))
    .where(or(like(organizations.name, `%${query}%`), like(organizations.shortName, `%${query}%`)))
    .limit(5);
}

// Log an interaction from AI
export async function logInteraction(
  data: { personName: string; type: string; summary: string; date?: string },
  userId: string,
) {
  const db = getDb();
  // Resolve person by name
  const [person] = await db.select().from(persons).where(like(persons.name, `%${data.personName}%`)).limit(1);
  if (!person) return { error: `Person "${data.personName}" not found in graph` };

  const interactionId = crypto.randomUUID();

  await db.insert(interactions).values({
    id: interactionId,
    type: data.type as any,
    summary: data.summary,
    occurredAt: data.date ? new Date(data.date) : new Date(),
    inputMethod: 'voice',
    createdBy: userId,
  });

  await db.insert(interactionParticipants).values({
    id: crypto.randomUUID(),
    interactionId,
    personId: person.id,
    role: 'attendee',
  });

  return { success: true, interactionId, personName: person.name };
}

// Add a reflection from AI
export async function addReflection(
  data: { personName: string; category: string; content: string },
  userId: string,
) {
  const db = getDb();
  const [person] = await db.select().from(persons).where(like(persons.name, `%${data.personName}%`)).limit(1);
  if (!person) return { error: `Person "${data.personName}" not found in graph` };

  const reflectionId = crypto.randomUUID();

  await db.insert(reflections).values({
    id: reflectionId,
    personId: person.id,
    authorId: userId,
    category: data.category as any,
    content: data.content,
    confidenceLevel: 'medium',
    inputMethod: 'voice',
    visibilityLevel: 'contributor',
  });

  return { success: true, reflectionId, personName: person.name };
}

// Compare coverage across organizations
export async function compareCoverage(orgNames: string[]) {
  const db = getDb();
  const results = [];
  for (const name of orgNames) {
    const [org] = await db.select().from(organizations).where(like(organizations.name, `%${name}%`)).limit(1);
    if (!org) {
      results.push({ orgName: name, tracked: 0, totalRelationships: 0, recentInteractions: 0 });
      continue;
    }
    const tracked = await db.select({ id: persons.id }).from(persons).where(eq(persons.currentOrgId, org.id));
    results.push({
      orgName: org.name,
      tracked: tracked.length,
      totalRelationships: 0,
      recentInteractions: 0,
    });
  }
  return results;
}
