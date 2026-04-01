import { getDb } from '../db';
import { persons, organizations, interactions, reflections, personIntel } from '../db/schema';
import { or, like, desc } from 'drizzle-orm';

export interface SearchFilters {
  personId?: string;
  domainId?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface SearchResult {
  type: 'person' | 'organization' | 'interaction' | 'reflection' | 'intel' | 'note';
  id: string;
  title: string;
  snippet: string;
  score: number;
  metadata: Record<string, any>;
}

export async function hybridSearch(query: string, filters: SearchFilters = {}): Promise<SearchResult[]> {
  const db = getDb();
  const limit = filters.limit || 20;
  const results: SearchResult[] = [];

  // Search persons by name
  const personResults = await db.select({
    id: persons.id,
    name: persons.name,
    title: persons.currentTitle,
    category: persons.category,
  })
    .from(persons)
    .where(like(persons.name, `%${query}%`))
    .limit(limit);

  for (const p of personResults) {
    results.push({
      type: 'person',
      id: p.id,
      title: p.name,
      snippet: p.title || p.category || '',
      score: 1,
      metadata: { category: p.category },
    });
  }

  // Search organizations
  const orgResults = await db.select({
    id: organizations.id,
    name: organizations.name,
    shortName: organizations.shortName,
  })
    .from(organizations)
    .where(or(like(organizations.name, `%${query}%`), like(organizations.shortName, `%${query}%`)))
    .limit(limit);

  for (const o of orgResults) {
    results.push({
      type: 'organization',
      id: o.id,
      title: o.name,
      snippet: o.shortName || '',
      score: 0.9,
      metadata: {},
    });
  }

  // Search interactions by summary
  const interactionResults = await db.select({
    id: interactions.id,
    summary: interactions.summary,
    type: interactions.type,
    occurredAt: interactions.occurredAt,
  })
    .from(interactions)
    .where(like(interactions.summary, `%${query}%`))
    .orderBy(desc(interactions.occurredAt))
    .limit(limit);

  for (const i of interactionResults) {
    results.push({
      type: 'interaction',
      id: i.id,
      title: `${i.type} - ${i.occurredAt?.toISOString().split('T')[0] || ''}`,
      snippet: i.summary.slice(0, 200),
      score: 0.8,
      metadata: { type: i.type },
    });
  }

  // Search reflections
  const reflectionResults = await db.select({
    id: reflections.id,
    content: reflections.content,
    category: reflections.category,
    personId: reflections.personId,
  })
    .from(reflections)
    .where(like(reflections.content, `%${query}%`))
    .orderBy(desc(reflections.createdAt))
    .limit(limit);

  for (const r of reflectionResults) {
    results.push({
      type: 'reflection',
      id: r.id,
      title: `${r.category} reflection`,
      snippet: r.content.slice(0, 200),
      score: 0.7,
      metadata: { category: r.category, personId: r.personId },
    });
  }

  // Search intel
  const intelResults = await db.select({
    id: personIntel.id,
    fieldName: personIntel.fieldName,
    fieldValue: personIntel.fieldValue,
    personId: personIntel.personId,
  })
    .from(personIntel)
    .where(or(like(personIntel.fieldName, `%${query}%`), like(personIntel.fieldValue, `%${query}%`)))
    .limit(limit);

  for (const i of intelResults) {
    results.push({
      type: 'intel',
      id: i.id,
      title: i.fieldName,
      snippet: i.fieldValue.slice(0, 200),
      score: 0.6,
      metadata: { personId: i.personId },
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
