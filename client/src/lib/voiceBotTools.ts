/**
 * Function declarations for the VoiceBot — the 8 RelGraph intents formatted
 * for Gemini Live's BidiGenerateContent tool-calling API.
 *
 * Mirrors the intent catalog from `server/services/intent-router.service.ts`
 * but uses Gemini's OBJECT/STRING type discriminator (uppercase) and
 * conversational descriptions tuned for Gemini's tool-call selection.
 *
 * IMPORTANT: tool names here MUST match the `tool` enum in
 * `today.executeVoiceIntent` so the server can dispatch them. If you add a
 * tool, update both sides.
 */

export const VOICE_BOT_TOOLS = [
  {
    name: "findPath",
    description:
      "Find paths or connections to a person, role, or organization. Use when the user asks how to reach someone or who connects them to a target.",
    parameters: {
      type: "OBJECT",
      properties: {
        target: {
          type: "STRING",
          description: "The person, role, or organization to reach (e.g. 'SBI CMD' or 'Sanjay Malhotra').",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "briefPerson",
    description:
      "Generate a dossier or briefing on a specific person. Use when the user wants to know about someone before a meeting.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: {
          type: "STRING",
          description: "Full or partial name of the person to brief.",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "logInteraction",
    description:
      "Log a meeting, call, or conversation. Use whenever the user describes something that happened with someone — meeting notes, call summaries, conversation snippets.",
    parameters: {
      type: "OBJECT",
      properties: {
        text: {
          type: "STRING",
          description: "The full verbatim utterance describing what happened. Don't summarize — preserve names, orgs, and quotes.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "searchIntel",
    description:
      "Look up recent news, power-moves, or intel about an organization. Use when the user asks 'what's new on X' or 'any news about Y'.",
    parameters: {
      type: "OBJECT",
      properties: {
        org: {
          type: "STRING",
          description: "Organization name (full or short form, e.g. 'ICICI', 'RBI', 'Reserve Bank of India').",
        },
      },
      required: ["org"],
    },
  },
  {
    name: "updateOpportunity",
    description:
      "Move a tracked opportunity to a new stage. Stages in order: identify, map, approach, engage, close, maintain. Or set to lost. Use when the user reports progress on a deal or initiative.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: {
          type: "STRING",
          description: "Opportunity name (e.g. 'SBI lending partnership').",
        },
        stage: {
          type: "STRING",
          description: "Target stage: identify, map, approach, engage, close, maintain, or lost.",
        },
        note: {
          type: "STRING",
          description: "Optional one-line note on the change.",
        },
      },
      required: ["name", "stage"],
    },
  },
  {
    name: "addToWatchlist",
    description:
      "Subscribe to alerts about a person, organization, role, or sector. Use when the user says 'watch X' or 'track Y' or 'alert me on Z'.",
    parameters: {
      type: "OBJECT",
      properties: {
        target: {
          type: "STRING",
          description: "What to watch (e.g. 'the new RBI Deputy Governor', 'ICICI', 'PSU bank reshuffles').",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "whoOwns",
    description:
      "Find which team member owns a given relationship. Use when the user asks who is the lead on someone or who owns a contact.",
    parameters: {
      type: "OBJECT",
      properties: {
        target: {
          type: "STRING",
          description: "Person name or organization the user is asking about.",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "coverageGap",
    description:
      "Find weak coverage in a sector. Use when the user asks where they are weak, which orgs they don't cover, or coverage gaps.",
    parameters: {
      type: "OBJECT",
      properties: {
        sector: {
          type: "STRING",
          description: "Sector name (e.g. 'private banks', 'PSU banks', 'NBFCs', 'regulators').",
        },
      },
      required: ["sector"],
    },
  },
] as const;

export type VoiceBotTool = (typeof VOICE_BOT_TOOLS)[number]["name"];

/**
 * System prompt that primes Gemini for the RelGraph use case. Kept short —
 * Gemini Live charges per token in the system instruction even for cached
 * sessions.
 */
export const VOICE_BOT_SYSTEM_PROMPT = `You are RelGraph's voice assistant for senior executives at organizations like Manipal Group. RelGraph is a relationship-intelligence platform for Indian banking, government, regulatory, and corporate networks.

Your job: turn what the user says into one of 8 tool calls and confirm in one short sentence.

Rules:
- Use logInteraction whenever the user describes something that happened ("Met X yesterday...", "Call notes from Y..."). Pass the full utterance verbatim in args.text — don't summarize.
- Use updateOpportunity when the user reports progress on a deal. Map stage words: "got the LOI" → engage, "signed" or "closed" → close, "lost" → lost.
- Use addToWatchlist on "watch X", "track Y", "alert me on Z".
- Use briefPerson on "tell me about X", "brief me on X".
- Use searchIntel on "what's new on X", "any news about X".
- Use findPath on "how do I reach X", "path to X", "who connects me to X".
- Use whoOwns on "who owns X", "who's lead on X".
- Use coverageGap on "where are we weak in X", "coverage gaps in X".

After a tool call, say one short sentence acknowledging what you did. Keep responses under 15 seconds of speech. Don't explain your reasoning. Don't say "I called the X tool" — just the result in plain language.

Speak in clear, professional Indian English with senior-executive register.`;
