import Anthropic from '@anthropic-ai/sdk';
import { RELGRAPH_SYSTEM_PROMPT } from './chat-system-prompt';
import {
  classifyIntent,
  executeTool,
  type AgentContext,
  type ToolResult,
} from './memory-agent.service';
import { getDb } from '../db';
import { chatConversations, chatMessages } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

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
// Conversation CRUD
// ---------------------------------------------------------------------------

export async function createConversation(userId: string, title?: string) {
  const db = getDb();
  const [conv] = await db
    .insert(chatConversations)
    .values({
      userId,
      title: title || 'New conversation',
    })
    .returning();
  return conv;
}

export async function getConversations(userId: string) {
  const db = getDb();
  return db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId))
    .orderBy(desc(chatConversations.updatedAt));
}

export async function getMessages(conversationId: string) {
  const db = getDb();
  return db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.createdAt);
}

export async function deleteConversation(conversationId: string, userId: string) {
  const db = getDb();
  // Verify ownership
  const [conv] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, conversationId))
    .limit(1);
  if (!conv || conv.userId !== userId) {
    throw new Error('Conversation not found or access denied');
  }
  // Delete messages first (FK constraint)
  await db.delete(chatMessages).where(eq(chatMessages.conversationId, conversationId));
  await db.delete(chatConversations).where(eq(chatConversations.id, conversationId));
  return { success: true };
}

// ---------------------------------------------------------------------------
// Send message (text chat via Claude)
// ---------------------------------------------------------------------------

export async function sendMessage(
  conversationId: string,
  content: string,
  agentContext: AgentContext,
): Promise<{ response: string; toolCalls: ToolResult[] }> {
  const db = getDb();

  // Save user message
  await db.insert(chatMessages).values({
    conversationId,
    role: 'user',
    content,
    inputMethod: 'text',
  });

  // Get conversation history (last 20 messages for context window)
  const history = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(20);

  // Execute agent tools based on query intent
  const toolCalls = classifyIntent(content);
  const toolResults: ToolResult[] = [];
  for (const tool of toolCalls) {
    const result = await executeTool(tool, agentContext);
    toolResults.push(result);
  }

  // Build context block from tool results
  const contextBlock = toolResults
    .map(
      (tr) => `[Tool: ${tr.name}]\n${JSON.stringify(tr.result, null, 2)}`,
    )
    .join('\n\n');

  // Build message history for Claude (chronological, last 10 turns)
  const messages: Anthropic.MessageParam[] = history
    .reverse()
    .filter((m) => m.role !== 'system')
    .slice(-10)
    .map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.content,
    }));

  // Append current message with retrieved context
  if (contextBlock.length > 0) {
    messages.push({
      role: 'user',
      content: `${content}\n\n---\nRetrieved context from knowledge graph:\n${contextBlock}`,
    });
  } else {
    messages.push({
      role: 'user',
      content,
    });
  }

  // Call Claude API
  try {
    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: RELGRAPH_SYSTEM_PROMPT,
      messages,
    });

    const responseText = response.content
      .filter(
        (block): block is Anthropic.TextBlock => block.type === 'text',
      )
      .map((block) => block.text)
      .join('\n');

    // Save assistant message
    await db.insert(chatMessages).values({
      conversationId,
      role: 'assistant',
      content: responseText,
      toolCalls: toolResults.length > 0 ? toolResults : null,
      sourcesUsed:
        toolResults.length > 0
          ? toolResults.map((t) => ({ tool: t.name }))
          : null,
    });

    // Update conversation title on first real exchange
    if (history.length <= 1) {
      const title = content.slice(0, 100);
      await db
        .update(chatConversations)
        .set({ title, updatedAt: new Date() })
        .where(eq(chatConversations.id, conversationId));
    } else {
      await db
        .update(chatConversations)
        .set({ updatedAt: new Date() })
        .where(eq(chatConversations.id, conversationId));
    }

    return { response: responseText, toolCalls: toolResults };
  } catch (error: any) {
    const errorMsg = `I'm unable to process your request right now. ${error?.message || 'Please try again.'}`;

    await db.insert(chatMessages).values({
      conversationId,
      role: 'assistant',
      content: errorMsg,
    });

    return { response: errorMsg, toolCalls: [] };
  }
}

// ---------------------------------------------------------------------------
// Execute a single tool call (used by Gemini voice to run server-side tools)
// ---------------------------------------------------------------------------

export async function executeToolCall(
  toolName: string,
  args: Record<string, any>,
  agentContext: AgentContext,
): Promise<any> {
  const result = await executeTool({ name: toolName, args }, agentContext);
  return result.result;
}
