import { z } from "zod";
import { router, contributorProcedure } from "../_core/trpc";
import {
  transcribeAudio,
  extractFromTranscript,
  getTranscriptStatus,
} from "../services/voice.service";
import { TRPCError } from "@trpc/server";

export const voiceRouter = router({
  transcribe: contributorProcedure
    .input(z.object({ audioUrl: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const transcript = await transcribeAudio(input.audioUrl);
        return {
          transcriptId: transcript.id,
          status: transcript.status,
          text: transcript.text,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Transcription failed",
        });
      }
    }),

  extract: contributorProcedure
    .input(z.object({ transcriptId: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const result = await extractFromTranscript(input.transcriptId);
        return { data: result };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Extraction failed",
        });
      }
    }),

  status: contributorProcedure
    .input(z.object({ transcriptId: z.string() }))
    .query(async ({ input }) => {
      const transcript = await getTranscriptStatus(input.transcriptId);
      return { status: transcript.status, text: transcript.text };
    }),
});
