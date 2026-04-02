import { z } from "zod";
import { adminProcedure, contributorProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  apifyRunFilterSchema,
  apifyRunLookupSchema,
  apifySourceFilterSchema,
  applyApifyDiscoverySchema,
  applyApifyEnrichmentSchema,
  createApifySourceConfigSchema,
  runApifySourceSchema,
  syncApifyMonitoringSchema,
  updateApifySourceConfigSchema,
} from "@shared/validation";
import {
  applyApifyDiscovery,
  applyApifyEnrichment,
  createApifySourceConfig,
  createIndianBankSeedPreview,
  getApifyRunById,
  getApifySourceConfigById,
  getIndianBankTargets,
  listApifyRuns,
  listApifySourceConfigs,
  runApifySource,
  seedIndianBankOrganizations,
  syncApifyMonitoring,
  updateApifySourceConfig,
} from "../services/apify.service";

export const apifyRouter = router({
  listSourceConfigs: protectedProcedure
    .input(apifySourceFilterSchema)
    .query(async ({ input }) => {
      return listApifySourceConfigs(input);
    }),

  getSourceConfig: protectedProcedure
    .input(apifyRunLookupSchema)
    .query(async ({ input }) => {
      return getApifySourceConfigById(input.id);
    }),

  createSourceConfig: adminProcedure
    .input(createApifySourceConfigSchema)
    .mutation(async ({ ctx, input }) => {
      return createApifySourceConfig(input, ctx.user.id);
    }),

  updateSourceConfig: adminProcedure
    .input(updateApifySourceConfigSchema)
    .mutation(async ({ input }) => {
      return updateApifySourceConfig(input);
    }),

  listRuns: protectedProcedure
    .input(apifyRunFilterSchema)
    .query(async ({ input }) => {
      return listApifyRuns(input);
    }),

  getRun: protectedProcedure
    .input(apifyRunLookupSchema)
    .query(async ({ input }) => {
      return getApifyRunById(input.id);
    }),

  runSource: contributorProcedure
    .input(runApifySourceSchema)
    .mutation(async ({ ctx, input }) => {
      return runApifySource(input, ctx.user.id);
    }),

  applyDiscovery: contributorProcedure
    .input(applyApifyDiscoverySchema)
    .mutation(async ({ ctx, input }) => {
      return applyApifyDiscovery(input, ctx.user.id);
    }),

  applyEnrichment: contributorProcedure
    .input(applyApifyEnrichmentSchema)
    .mutation(async ({ ctx, input }) => {
      return applyApifyEnrichment(input, ctx.user.id);
    }),

  syncMonitoring: adminProcedure
    .input(syncApifyMonitoringSchema)
    .mutation(async ({ input }) => {
      return syncApifyMonitoring(input);
    }),

  getIndianBankTargets: protectedProcedure
    .query(async () => {
      return getIndianBankTargets();
    }),

  previewIndianBankSeed: protectedProcedure
    .input(z.object({ domainId: z.string().uuid() }))
    .query(async ({ input }) => {
      return createIndianBankSeedPreview(input.domainId);
    }),

  seedIndianBankOrganizations: adminProcedure
    .input(z.object({ domainId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return seedIndianBankOrganizations(input.domainId, ctx.user.id);
    }),
});
