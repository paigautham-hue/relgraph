import { AssemblyAI } from "assemblyai";

const getClient = () => {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY not configured");
  return new AssemblyAI({ apiKey });
};

/**
 * Upload an audio buffer to AssemblyAI's CDN and synchronously transcribe.
 * Used by the universal voice input — short clips (<= 60 s) get transcribed
 * end-to-end in a single round-trip from the client's perspective.
 *
 * For long-form recordings (meetings, interviews), the queued path
 * (`transcribeAudio` with a pre-uploaded URL) is preferred.
 *
 * Caller passes the raw bytes as a Buffer; we forward to AssemblyAI's upload
 * endpoint and immediately request transcription with sane defaults.
 */
export async function uploadAndTranscribe(
  audioBuffer: Buffer,
  options?: { languageDetection?: boolean },
): Promise<{ id: string; text: string; status: string; durationSec: number | null }> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY not configured");

  // Step 1: upload bytes to AssemblyAI's signed-URL endpoint. Node's
  // fetch type definitions reject raw Buffer (SharedArrayBuffer-vs-ArrayBuffer
  // strictness) — copy into a fresh ArrayBuffer-backed Uint8Array first, then
  // wrap in a Blob (Node 18+ global) which is BodyInit-compatible.
  const fresh = new Uint8Array(audioBuffer.byteLength);
  fresh.set(audioBuffer);
  const body = new Blob([fresh], { type: "application/octet-stream" });
  const uploadResp = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: {
      authorization: apiKey,
      "content-type": "application/octet-stream",
    },
    body,
  });
  if (!uploadResp.ok) {
    const errText = await uploadResp.text().catch(() => "");
    throw new Error(`AssemblyAI upload failed (${uploadResp.status}): ${errText}`);
  }
  const uploadJson = (await uploadResp.json()) as { upload_url?: string };
  if (!uploadJson.upload_url) throw new Error("AssemblyAI did not return an upload_url");

  // Step 2: start transcription. The SDK's `transcribe()` polls until done.
  const client = getClient();
  const transcript = await client.transcripts.transcribe({
    audio_url: uploadJson.upload_url,
    speech_model: "best" as any,
    language_detection: options?.languageDetection ?? true,
  });
  return {
    id: transcript.id,
    text: transcript.text ?? "",
    status: transcript.status,
    durationSec: typeof transcript.audio_duration === "number" ? transcript.audio_duration : null,
  };
}

export async function transcribeAudio(audioUrl: string) {
  const client = getClient();
  const transcript = await client.transcripts.transcribe({
    audio_url: audioUrl,
    speech_model: "best" as any,
    language_detection: true,
    entity_detection: true,
    sentiment_analysis: true,
    speaker_labels: true,
  });
  return transcript;
}

export async function extractFromTranscript(transcriptId: string) {
  const client = getClient();
  const result = await client.lemur.task({
    transcript_ids: [transcriptId],
    prompt: `Extract the following from this voice note about a business interaction:
    1. Person(s) mentioned (name, title, organization if mentioned)
    2. Interaction type (meeting, call, conference, meal, event)
    3. Date (if mentioned, otherwise null)
    4. Location (if mentioned)
    5. Key intelligence points
    6. Action items
    7. Reflective observations

    Return as JSON: { persons: [{name, title?, org?}], interaction_type: string, date: string|null, location: string|null, intel_points: string[], action_items: string[], reflections: string[] }`,
    final_model: "anthropic/claude-sonnet" as any,
  });
  return result.response;
}

export async function getTranscriptStatus(transcriptId: string) {
  const client = getClient();
  return client.transcripts.get(transcriptId);
}
