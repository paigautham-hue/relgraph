/**
 * LLM-based entity extractor for the drop-import flow.
 *
 * Takes arbitrary text and returns structured persons + organizations the
 * dispatcher can propose. Uses Claude Sonnet (better extraction than Haiku,
 * worth the cost for a user-initiated action; classifier-style intent routing
 * stays on Haiku elsewhere).
 *
 * Cost: ~$0.01 per drop for a typical email signature or short paragraph;
 * up to ~$0.10 for a 30-row spreadsheet flattened to text. The drop-import
 * router enforces per-user monthly caps (configurable, default $20/month).
 */

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface ExtractedPerson {
  name: string;
  currentTitle?: string;
  orgName?: string;
  email?: string;
  phone?: string;
  sourceSnippet?: string; // up to 200 chars; verbatim text the extraction was based on
  /** 0..1; model's self-reported certainty for this entity */
  confidence?: number;
}

export interface ExtractedOrganization {
  name: string;
  type?: string; // "psu_bank" | "private_bank" | "regulator" | "government" | "nbfc" | "dfi" | "corporate" | "other"
  city?: string;
  sourceSnippet?: string;
  confidence?: number;
}

export interface ExtractedEntities {
  persons: ExtractedPerson[];
  organizations: ExtractedOrganization[];
  warnings: string[];
  /** Total LLM cost for this extraction. Zero if LLM unavailable + we fell
   *  through to a no-op (returns empty). */
  costUsd: number;
}

const SYSTEM_PROMPT = `You extract structured entities from unstructured text that a senior Indian executive at an organization like Manipal Group might paste or drop into their relationship-intelligence platform (RelGraph).

Your job: identify people and organizations mentioned in the input. Return JSON only.

Output schema:
{
  "persons": [
    {
      "name": string,           // Full name as written, preserving honorifics if present
      "currentTitle": string?,  // Job title if mentioned
      "orgName": string?,       // Organization name if mentioned. Full official form preferred ("Reserve Bank of India") but short form OK if that's all the source gives ("RBI")
      "email": string?,         // Email address if present
      "phone": string?,         // Phone if present, raw format OK
      "sourceSnippet": string?, // Up to 200 chars of verbatim source text supporting this person
      "confidence": number      // 0.0-1.0; how confident you are this is a real person worth importing
    }
  ],
  "organizations": [
    {
      "name": string,           // Org name
      "type": string?,          // One of: psu_bank, private_bank, regulator, government, nbfc, dfi, corporate, other
      "city": string?,          // HQ city if mentioned
      "sourceSnippet": string?,
      "confidence": number
    }
  ],
  "warnings": string[]          // Any caveats (e.g. "Ambiguous title — could be a placeholder")
}

Rules:
- Only return JSON. No markdown, no prose, no code fences.
- Be conservative: if you're not sure something is a real entity, set confidence < 0.5 and add a warning.
- For email signatures and business cards, expect exactly one person + maybe one organization.
- For longer text (meeting notes, articles, board listings), there may be many entities.
- Indian context: recognize PSU bank names (SBI, PNB, Canara, BoB, etc.), regulators (RBI, SEBI, IRDAI, PFRDA, IFSCA), and well-known corporates. Map type accordingly.
- If a row in tabular input ("Row 1: Name: Rajesh; Title: CMD; Org: SBI"), treat each row as one person plus possibly one org.
- Empty result is fine — return { "persons": [], "organizations": [], "warnings": ["No entities detected"] } rather than guessing.
- Cap output at 100 persons + 50 organizations even if the source has more.`;

/**
 * Extract entities from arbitrary text. Never throws — returns
 * `{ persons: [], organizations: [], warnings: ["..."] }` on any failure
 * (no API key, network error, parse failure).
 */
export async function extractEntitiesFromText(
  text: string,
  opts: { sourceLabel: string },
): Promise<ExtractedEntities> {
  const client = getClient();
  if (!client) {
    return {
      persons: [],
      organizations: [],
      warnings: [
        "ANTHROPIC_API_KEY isn't configured on this server. Drop-import for text/PDF/vCard requires the LLM extractor; ask your admin to wire the key.",
      ],
      costUsd: 0,
    };
  }

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Source: ${opts.sourceLabel}\n\n---\n\n${text}\n\n---\n\nExtract entities and return JSON only.`,
        },
      ],
    });

    const responseText = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // Strip code fences if the model ignored instructions.
    const cleaned = responseText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        persons: [],
        organizations: [],
        warnings: ["Extractor returned unparseable output. Try a simpler input or paste smaller chunks."],
        costUsd: estimateCost(message),
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return {
        persons: [],
        organizations: [],
        warnings: ["Extractor returned an unexpected shape."],
        costUsd: estimateCost(message),
      };
    }

    const obj = parsed as Record<string, unknown>;
    const persons = (Array.isArray(obj.persons) ? obj.persons : []) as Array<Record<string, unknown>>;
    const organizations = (Array.isArray(obj.organizations) ? obj.organizations : []) as Array<Record<string, unknown>>;
    const warnings = (Array.isArray(obj.warnings) ? obj.warnings : []) as string[];

    return {
      persons: persons
        .filter((p) => typeof p.name === "string" && p.name.length > 0)
        .slice(0, 100)
        .map((p) => ({
          name: String(p.name).trim(),
          currentTitle: typeof p.currentTitle === "string" ? p.currentTitle : undefined,
          orgName: typeof p.orgName === "string" ? p.orgName : undefined,
          email: typeof p.email === "string" ? p.email : undefined,
          phone: typeof p.phone === "string" ? p.phone : undefined,
          sourceSnippet: typeof p.sourceSnippet === "string" ? p.sourceSnippet.slice(0, 200) : undefined,
          confidence: typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0.7,
        })),
      organizations: organizations
        .filter((o) => typeof o.name === "string" && o.name.length > 0)
        .slice(0, 50)
        .map((o) => ({
          name: String(o.name).trim(),
          type: typeof o.type === "string" ? o.type : undefined,
          city: typeof o.city === "string" ? o.city : undefined,
          sourceSnippet: typeof o.sourceSnippet === "string" ? o.sourceSnippet.slice(0, 200) : undefined,
          confidence: typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0.7,
        })),
      warnings: warnings.filter((w) => typeof w === "string"),
      costUsd: estimateCost(message),
    };
  } catch (err) {
    return {
      persons: [],
      organizations: [],
      warnings: [`Extractor failed: ${err instanceof Error ? err.message : String(err)}`],
      costUsd: 0,
    };
  }
}

/**
 * Rough cost estimate from Anthropic usage. Sonnet 4.5 pricing
 * (as of model release):
 *   - Input:  $3 / 1M tokens
 *   - Output: $15 / 1M tokens
 * These are approximate; the Anthropic console is the source of truth.
 */
function estimateCost(message: Anthropic.Message): number {
  const inputTokens = message.usage?.input_tokens ?? 0;
  const outputTokens = message.usage?.output_tokens ?? 0;
  const inputCost = (inputTokens / 1_000_000) * 3;
  const outputCost = (outputTokens / 1_000_000) * 15;
  return inputCost + outputCost;
}
