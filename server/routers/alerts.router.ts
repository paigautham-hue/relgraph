import { z } from 'zod';
import { router, protectedProcedure } from '../_core/trpc';
import { getAlerts } from '../services/alert.service';
import { getDb } from '../db';
import { alerts } from '../db/schema';
import { eq } from 'drizzle-orm';

export const alertsRouter = router({
  list: protectedProcedure
    .input(z.object({
      type: z.string().optional(),
      isDismissed: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      return getAlerts(input ?? undefined);
    }),

  dismiss: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.update(alerts).set({
        isDismissed: true,
        dismissedBy: ctx.user.id,
        updatedAt: new Date(),
      }).where(eq(alerts.id, input.id));
      return { success: true };
    }),

  markAction: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      actionNote: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.update(alerts).set({
        actionTaken: true,
        actionNote: input.actionNote,
        updatedAt: new Date(),
      }).where(eq(alerts.id, input.id));
      return { success: true };
    }),
});
