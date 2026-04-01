import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { hybridSearch } from '../services/search.service';
import { findConnectionPath } from '../services/agent-tools.service';

export const searchRouter = router({
  search: protectedProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      return hybridSearch(input.query, { limit: input.limit });
    }),

  findPath: protectedProcedure
    .input(z.object({
      targetPersonId: z.string().uuid(),
      maxHops: z.number().int().min(1).max(6).default(4),
    }))
    .query(async ({ input }) => {
      return findConnectionPath(input.targetPersonId, input.maxHops);
    }),
});
