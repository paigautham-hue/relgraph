import { z } from "zod";
import { router, contributorProcedure, protectedProcedure } from "../_core/trpc";
import {
  transcribeAudio,
  extractFromTranscript,
  getTranscriptStatus,
  uploadAndTranscribe,
} from "../services/voice.service";
import { TRPCError } from "@trpc/server";

// Quick-transcribe is the path used by the universal mic on the command
// box and any other text input. Short clips (<= 60 s typically) come up
// over tRPC as base64 to avoid wiring a separate multipart upload route.
//
// Size cap is 10 MB encoded — that's roughly 7.5 MB of audio (base64
// inflates by ~33%), which is well over our 60 s clip target at typical
// browser webm/opus bitrates (~24 KB/s = ~1.5 MB for 60 s).
const MAX_QUICK_AUDIO_BASE64_BYTES = 10 * 1024 * 1024;

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

  /**
   * One-shot quick transcribe. Accepts base64-encoded audio bytes from the
   * client's MediaRecorder, uploads to AssemblyAI, and synchronously returns
   * the transcript text. Used by the universal `<Mic>` button next to any
   * text input.
   *
   * Available to any authenticated user (not gated to contributors) since
   * voice transcription is a baseline accessibility feature, not a
   * privileged write.
   */
  quickTranscribe: protectedProcedure
    .input(
      z.object({
        audioBase64: z
          .string()
          .min(1)
          .max(MAX_QUICK_AUDIO_BASE64_BYTES, {
            message: `Audio is too long for quick transcribe. Keep clips under 60 seconds.`,
          }),
        mimeType: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const buffer = Buffer.from(input.audioBase64, "base64");
        if (buffer.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Audio data was empty. Try recording again.",
          });
        }
        const result = await uploadAndTranscribe(buffer);
        if (result.status === "error") {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "AssemblyAI couldn't process the audio. Try again with a clearer recording.",
          });
        }
        return { text: result.text, durationSec: result.durationSec };
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Voice transcription failed",
        });
      }
    }),
});
