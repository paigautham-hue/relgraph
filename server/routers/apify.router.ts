import { z } from "zod";
import { adminProcedure, contributorProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  apifyRunFilterSchema,
  apifyRunLookupSchema,
  apifySourceFilterSchema,
  applyApifyDiscoverySchema,
  applyApifyEnrichmentSchema,
  bankLeadershipRecordFilterSchema,
  createApifySourceConfigSchema,
  createBankLeadershipRecordSchema,
  importBankLeadershipRecordSchema,
  runApifySourceSchema,
  syncApifyMonitoringSchema,
  updateApifySourceConfigSchema,
  updateBankLeadershipRecordSchema,
} from "@shared/validation";
import {
  applyApifyDiscovery,
  applyApifyEnrichment,
  createApifySourceConfig,
  createBankLeadershipRecord,
  createIndianBankSeedPreview,
  getApifyRunById,
  getApifySourceConfigById,
  getBankLeadershipRecordById,
  getIndianBankTargets,
  importBankLeadershipRecord,
  listApifyRuns,
  listApifySourceConfigs,
  listBankLeadershipRecords,
  runApifySource,
  seedIndianBankOrganizations,
  syncApifyMonitoring,
  updateApifySourceConfig,
  updateBankLeadershipRecord,
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

  listBankLeadershipRecords: protectedProcedure
    .input(bankLeadershipRecordFilterSchema)
    .query(async ({ input }) => {
      return listBankLeadershipRecords(input);
    }),

  getBankLeadershipRecord: protectedProcedure
    .input(apifyRunLookupSchema)
    .query(async ({ input }) => {
      return getBankLeadershipRecordById(input.id);
    }),

  updateBankLeadershipRecord: adminProcedure
    .input(updateBankLeadershipRecordSchema)
    .mutation(async ({ input }) => {
      return updateBankLeadershipRecord(input);
    }),

  createBankLeadershipRecord: adminProcedure
    .input(createBankLeadershipRecordSchema)
    .mutation(async ({ ctx, input }) => {
      return createBankLeadershipRecord(input, ctx.user.id);
    }),

  importBankLeadershipRecord: adminProcedure
    .input(importBankLeadershipRecordSchema)
    .mutation(async ({ ctx, input }) => {
      return importBankLeadershipRecord(input, ctx.user.id);
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
