import {
  searchPerson,
  getRelationships,
  searchReflections,
  getInteractions,
  searchOrganization,
  findConnectionPath,
} from './agent-tools.service';
import { hybridSearch } from './search.service';
import { getDb } from '../db';
import { chatMessages } from '../db/schema';
import { desc, like } from 'drizzle-orm';

export interface AgentContext {
  userId: string;
  userRole: string;
  userDomainIds: string[] | null;
}

export interface ToolCall {
  name: string;
  args: Record<string, any>;
}

export interface ToolResult {
  name: string;
  result: any;
}

// Classify query intent to determine which tools to call
export function classifyIntent(query: string): ToolCall[] {
  const lowerQuery = query.toLowerCase();
  const toolCalls: ToolCall[] = [];

  // Person lookup
  if (lowerQuery.includes('who is') || lowerQuery.includes('tell me about') || lowerQuery.includes('brief me on')) {
    const nameMatch = query.match(/(?:who is|tell me about|brief me on)\s+(.+?)(?:\?|$)/i);
    if (nameMatch) {
      toolCalls.push({ name: 'search_person', args: { query: nameMatch[1].trim() } });
      toolCalls.push({ name: 'get_relationships', args: { person_name: nameMatch[1].trim() } });
      toolCalls.push({ name: 'get_reflections', args: { person_name: nameMatch[1].trim() } });
    }
  }

  // Path finding
  if (lowerQuery.includes('path to') || lowerQuery.includes('how do we reach') || lowerQuery.includes('connection to')) {
    const nameMatch = query.match(/(?:path to|reach|connection to)\s+(.+?)(?:\?|$)/i);
    if (nameMatch) {
      toolCalls.push({ name: 'search_person', args: { query: nameMatch[1].trim() } });
    }
  }

  // Relationship queries
  if (lowerQuery.includes('who knows') || lowerQuery.includes('relationships')) {
    const nameMatch = query.match(/(?:who knows|relationships (?:of|for|with))\s+(.+?)(?:\?|$)/i);
    if (nameMatch) {
      toolCalls.push({ name: 'get_relationships', args: { person_name: nameMatch[1].trim() } });
    }
  }

  // Organization queries
  if (lowerQuery.includes('coverage') || lowerQuery.includes('organization') || lowerQuery.includes('org')) {
    const nameMatch = query.match(/(?:coverage|about|at)\s+(.+?)(?:\?|$)/i);
    if (nameMatch) {
      toolCalls.push({ name: 'search_organization', args: { query: nameMatch[1].trim() } });
    }
  }

  // Log interaction
  if (lowerQuery.includes('i met') || lowerQuery.includes('had a meeting') || lowerQuery.includes('spoke with')) {
    toolCalls.push({ name: 'log_interaction', args: { raw_text: query } });
  }

  // Fallback: semantic search
  if (toolCalls.length === 0) {
    toolCalls.push({ name: 'semantic_search', args: { query } });
  }

  return toolCalls;
}

// Execute a tool call
export async function executeTool(tool: ToolCall, _context: AgentContext): Promise<ToolResult> {
  switch (tool.name) {
    case 'search_person':
      return { name: tool.name, result: await searchPerson(tool.args.query) };

    case 'get_relationships': {
      const people = await searchPerson(tool.args.person_name);
      if (people.length === 0) return { name: tool.name, result: { error: 'Person not found' } };
      return { name: tool.name, result: await getRelationships(people[0].id) };
    }

    case 'get_reflections': {
      const people = await searchPerson(tool.args.person_name);
      if (people.length === 0) return { name: tool.name, result: { error: 'Person not found' } };
      return { name: tool.name, result: await searchReflections(people[0].id, tool.args.category) };
    }

    case 'get_interactions': {
      const people = await searchPerson(tool.args.person_name);
      if (people.length === 0) return { name: tool.name, result: { error: 'Person not found' } };
      return { name: tool.name, result: await getInteractions(people[0].id) };
    }

    case 'search_organization':
      return { name: tool.name, result: await searchOrganization(tool.args.query) };

    case 'find_path': {
      const people = await searchPerson(tool.args.target_name);
      if (people.length === 0) return { name: tool.name, result: { error: 'Person not found' } };
      return { name: tool.name, result: await findConnectionPath(people[0].id) };
    }

    case 'log_interaction':
      return {
        name: tool.name,
        result: {
          message: 'Interaction logging requires structured data. Please provide: person name, type, and summary.',
        },
      };

    case 'semantic_search':
      return { name: tool.name, result: await hybridSearch(tool.args.query) };

    default:
      return { name: tool.name, result: { error: `Unknown tool: ${tool.name}` } };
  }
}

// Get recall memory (past chat conversations)
export async function getRecallMemory(userId: string, query: string, limit: number = 5) {
  const db = getDb();
  const results = await db.select({
    content: chatMessages.content,
    role: chatMessages.role,
    createdAt: chatMessages.createdAt,
  })
    .from(chatMessages)
    .where(like(chatMessages.content, `%${query}%`))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

  return results;
}
