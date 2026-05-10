import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import {
  createConversation,
  getConversations,
  getMessages,
  sendMessage,
  deleteConversation,
  executeToolCall,
} from '../services/chat.service';
import type { AgentContext } from '../services/memory-agent.service';

export const chatRouter = router({
  // ── Conversations ───────────────────────────────────────────────────────

  createConversation: protectedProcedure
    .input(z.object({ title: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return createConversation(ctx.user.id, input.title);
    }),

  listConversations: protectedProcedure.query(async ({ ctx }) => {
    return getConversations(ctx.user.id);
  }),

  deleteConversation: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return deleteConversation(input.conversationId, ctx.user.id);
    }),

  // ── Messages ────────────────────────────────────────────────────────────

  getMessages: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ input }) => {
      return getMessages(input.conversationId);
    }),

  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        content: z.string().min(1).max(4000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const agentContext: AgentContext = {
        userId: ctx.user.id,
        userRole: ctx.user.role,
        userDomainIds: null,
      };
      return sendMessage(input.conversationId, input.content, agentContext);
    }),

  // ── Tool execution (for Gemini voice) ──────────────────────────────────

  executeToolCall: protectedProcedure
    .input(
      z.object({
        toolName: z.string(),
        args: z.record(z.string(), z.any()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const agentContext: AgentContext = {
        userId: ctx.user.id,
        userRole: ctx.user.role,
        userDomainIds: null,
      };
      return executeToolCall(input.toolName, input.args, agentContext);
    }),

  // ── Gemini token endpoint ──────────────────────────────────────────────

  geminiToken: protectedProcedure.query(async () => {
    const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!apiKey) return { error: 'Gemini API key not configured' as const };
    return {
      token: apiKey,
      model: 'gemini-2.5-flash-preview-native-audio-dialog' as const,
      mode: 'raw_key' as const,
    };
  }),
});
