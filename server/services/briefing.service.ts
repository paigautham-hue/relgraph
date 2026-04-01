import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db';
import {
  persons,
  organizations,
  domains,
  tenures,
  personIntel,
  briefings,
  users,
} from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { getRelationships, searchReflections, getInteractions } from './agent-tools.service';

// ---------------------------------------------------------------------------
// Anthropic client singleton
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Briefing generation
// ---------------------------------------------------------------------------

export async function generateBriefing(personId: string, userId: string): Promise<string> {
  const db = getDb();

  // Gather all data about the person
  const [person] = await db.select({
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
    .where(eq(persons.id, personId));

  if (!person) throw new Error('Person not found');

  // Career timeline
  const careerHistory = await db.select({
    title: tenures.title,
    department: tenures.department,
    orgName: organizations.name,
    startDate: tenures.startDate,
    endDate: tenures.endDate,
    isCurrent: tenures.isCurrent,
  })
    .from(tenures)
    .leftJoin(organizations, eq(tenures.orgId, organizations.id))
    .where(eq(tenures.personId, personId))
    .orderBy(desc(tenures.startDate));

  // Relationships
  const rels = await getRelationships(personId);

  // Recent interactions
  const recentInteractions = await getInteractions(personId, 10);

  // Reflections
  const allReflections = await searchReflections(personId, undefined, 20);

  // Intel
  const intel = await db.select({
    fieldName: personIntel.fieldName,
    fieldValue: personIntel.fieldValue,
    contributorName: users.name,
  })
    .from(personIntel)
    .leftJoin(users, eq(personIntel.contributedBy, users.id))
    .where(eq(personIntel.personId, personId));

  // Build context
  const context = {
    person: {
      name: person.name,
      title: person.title,
      org: person.orgName,
      domain: person.domainName,
      category: person.category,
    },
    career: careerHistory,
    relationships: rels.slice(0, 10),
    interactions: recentInteractions,
    reflections: allReflections,
    intel,
  };

  // Generate briefing with Claude
  const client = getClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    system: `You are a relationship intelligence analyst. Generate a comprehensive pre-meeting briefing. Structure it as:

## Background
Brief overview of the person's role, organization, and domain.

## Career History
Key career milestones.

## Your Relationship History
How your team knows this person, interaction history, connection strength.

## Key Intel from Team
Important observations and intelligence contributed by team members. Attribute each insight.

## How to Approach
Strategic recommendations for the meeting based on personality and behavioral insights.

## Suggested Talking Points
Specific topics to discuss based on current intel and opportunities.

## Open Questions
Things the team still needs to find out.

Use markdown formatting. Attribute insights to team members by name.`,
    messages: [{
      role: 'user',
      content: `Generate a pre-meeting briefing for: ${person.name}

Data from our knowledge graph:
${JSON.stringify(context, null, 2)}`,
    }],
  });

  const briefingContent = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  // Save briefing
  await db.insert(briefings).values({
    personId,
    generatedBy: userId,
    content: briefingContent,
    sourcesUsed: {
      intel: intel.length,
      reflections: allReflections.length,
      interactions: recentInteractions.length,
    },
  });

  return briefingContent;
}

export async function listBriefings(userId?: string) {
  const db = getDb();
  return db.select({
    id: briefings.id,
    personName: persons.name,
    generatedByName: users.name,
    content: briefings.content,
    sourcesUsed: briefings.sourcesUsed,
    createdAt: briefings.createdAt,
  })
    .from(briefings)
    .leftJoin(persons, eq(briefings.personId, persons.id))
    .leftJoin(users, eq(briefings.generatedBy, users.id))
    .orderBy(desc(briefings.createdAt))
    .limit(50);
}
