import { z } from 'zod';
import { router, protectedProcedure, contributorProcedure } from '../_core/trpc';
import { generateBriefing, listBriefings } from '../services/briefing.service';
import { logAudit, getClientIp } from '../middleware/audit';

export const briefingsRouter = router({
  generate: contributorProcedure
    .input(z.object({ personId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const content = await generateBriefing(input.personId, ctx.user.id);
      logAudit({
        userId: ctx.user.id,
        actionType: 'generate_briefing',
        entityType: 'briefing',
        entityId: input.personId,
        ipAddress: getClientIp(ctx.req),
        userAgent: ctx.req.headers['user-agent'] as string,
      });
      return { content };
    }),

  list: protectedProcedure
    .query(async () => {
      return listBriefings();
    }),
});
