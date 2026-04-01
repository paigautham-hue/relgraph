import { AssemblyAI } from "assemblyai";

const getClient = () => {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) throw new Error("ASSEMBLYAI_API_KEY not configured");
  return new AssemblyAI({ apiKey });
};

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
