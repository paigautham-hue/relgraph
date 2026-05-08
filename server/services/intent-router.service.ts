/**
 * Intent router — classifies natural-language utterances from the universal
 * command box into one of 8 RelGraph tools, with extracted arguments.
 *
 * Used by:
 *   - The text path: command-box typed input → tRPC `intentRouter.classify`
 *   - The voice path (week 4): Gemini Live receives speech, calls the same
 *     8 tools as functionDeclarations
 *
 * Model: Claude Haiku 4.5 — cheap, fast, sufficient for intent classification
 * with ~50-token prompts. The chat agent and briefings keep using Sonnet for
 * deeper reasoning; this is a single-shot classification.
 *
 * Cost: ~$0.0001 per classification. A power-user issuing 100 commands/day
 * costs ~$0.30/month. Fits any reasonable token cap.
 */

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

// ─── Tool catalog ────────────────────────────────────────────────────────────

export const INTENT_TOOLS = [
  "findPath",
  "briefPerson",
  "logInteraction",
  "searchIntel",
  "updateOpportunity",
  "addToWatchlist",
  "whoOwns",
  "coverageGap",
  "unknown",
] as const;
export type IntentTool = (typeof INTENT_TOOLS)[number];

export interface ClassifiedIntent {
  tool: IntentTool;
  args: Record<string, string>;
  confidence: number; // 0-1
  /** The model's brief explanation, surfaced to the UI on low confidence */
  rationale?: string;
}

const SYSTEM_PROMPT = `You are the intent router for RelGraph, an Indian institutional relationship intelligence platform used by senior executives at organizations like Manipal Group.

Your job: read a single user utterance and return a JSON object that classifies it into exactly ONE of these tools, with extracted arguments.

Tools:

1. findPath — User wants paths/connections to a person, role, or organization.
   args: { target: string }
   Examples:
     "How do I reach the SBI CMD" → { target: "SBI CMD" }
     "Path to Sanjay Malhotra" → { target: "Sanjay Malhotra" }
     "Who connects me to RBI" → { target: "RBI" }

2. briefPerson — User wants a dossier/briefing on a specific person.
   args: { name: string }
   Examples:
     "Brief me on Rajesh Kumar" → { name: "Rajesh Kumar" }
     "Tell me about the new SEBI chairman" → { name: "the new SEBI chairman" }

3. logInteraction — User wants to log a meeting, call, or conversation. The
   utterance contains free-text describing what happened.
   args: { text: string }
   Examples:
     "Met Rajesh from SBI yesterday, he said digital lending is moving fast"
       → { text: <the full utterance, verbatim> }
     "Call notes: Meera from RBI risk team, ..." → { text: <verbatim> }

4. searchIntel — User wants recent news/intel about an organization or sector.
   args: { org: string }
   Examples:
     "What's new on ICICI" → { org: "ICICI" }
     "Latest from RBI" → { org: "RBI" }
     "Any news on HDFC" → { org: "HDFC" }

5. updateOpportunity — User is moving an opportunity to a new stage with a note.
   args: { name: string, stage: string, note?: string }
   Stages: identify, map, approach, engage, close, maintain, lost
   Examples:
     "Got the LOI from SBI for the lending partnership" →
       { name: "SBI lending partnership", stage: "engage", note: "Got the LOI" }
     "Lost the NBFC deal" → { name: "NBFC deal", stage: "lost" }

6. addToWatchlist — User wants to subscribe to alerts about a person/org/sector.
   args: { target: string }
   Examples:
     "Watch the new RBI Deputy Governor for me" → { target: "new RBI Deputy Governor" }
     "Track ICICI" → { target: "ICICI" }
     "Alert me on PSU bank reshuffles" → { target: "PSU bank reshuffles" }

7. whoOwns — User asks who on the team owns a relationship.
   args: { target: string }
   Examples:
     "Who owns the HDFC relationship" → { target: "HDFC" }
     "Who's the lead on Rajesh" → { target: "Rajesh" }

8. coverageGap — User asks about weak coverage in a sector or org type.
   args: { sector: string }
   Examples:
     "Where are we weak in private banks" → { sector: "private banks" }
     "Coverage gaps in NBFCs" → { sector: "NBFCs" }

9. unknown — None of the above. Use sparingly; prefer best-fit over unknown.

Return ONLY a JSON object with this exact shape (no markdown, no prose):
{
  "tool": "<one of the 9 names>",
  "args": { <tool-specific args> },
  "confidence": <0.0 to 1.0>,
  "rationale": "<one short sentence>"
}

Rules:
- For logInteraction, the args.text MUST be the full verbatim utterance.
- For ambiguous utterances ("Tell me about ICICI"), prefer searchIntel over briefPerson.
- For utterances mixing capture and a question, choose the dominant intent.
- Confidence < 0.5 means "I'm unsure" — the UI will ask the user to clarify.`;

/**
 * Classify an utterance into a tool + args. Throws on API failure; the caller
 * is responsible for fallback behavior (typically: surface a "tap mic to
 * dictate or try rephrasing" message).
 *
 * Cost-controlled: 50-token system prompt cached, ~150 max output tokens.
 */
export async function classifyIntent(utterance: string): Promise<ClassifiedIntent> {
  if (!utterance.trim()) {
    return { tool: "unknown", args: {}, confidence: 0, rationale: "Empty input" };
  }

  const client = getClient();
  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: utterance }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  // Defensive parse — model may include code fences despite instructions.
  let parsed: unknown;
  try {
    const stripped = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    parsed = JSON.parse(stripped);
  } catch {
    return {
      tool: "unknown",
      args: { text: utterance },
      confidence: 0,
      rationale: "Could not parse classifier output",
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { tool: "unknown", args: {}, confidence: 0, rationale: "Invalid classifier output" };
  }

  const obj = parsed as Record<string, unknown>;
  const tool = typeof obj.tool === "string" && (INTENT_TOOLS as readonly string[]).includes(obj.tool)
    ? (obj.tool as IntentTool)
    : "unknown";
  const args = obj.args && typeof obj.args === "object" ? (obj.args as Record<string, string>) : {};
  const confidence = typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0.5;
  const rationale = typeof obj.rationale === "string" ? obj.rationale : undefined;

  // For logInteraction: ensure args.text is set to the full utterance, not a
  // summary. The model sometimes truncates.
  if (tool === "logInteraction" && (!args.text || args.text.length < utterance.length / 2)) {
    args.text = utterance;
  }

  return { tool, args, confidence, rationale };
}
