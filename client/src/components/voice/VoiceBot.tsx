/**
 * VoiceBot — full conversational voice surface using Gemini Live.
 *
 * Floats as a small FAB at the bottom-right of the Today page. Tap to
 * open the call; tap mute to silence the mic; tap end to disconnect.
 *
 * Differences from the universal VoiceInputButton:
 *   - This is a CONVERSATIONAL session (talk back-and-forth with the AI).
 *   - The AI can call any of the 8 RelGraph intents and speak the result
 *     back via TTS.
 *   - No transcribe-and-insert: the user's words don't go into a textbox.
 *
 * Per Rule 3 (Apple-grade UX):
 *   - One FAB, one job (start a voice conversation)
 *   - Connection state visible at all times (connecting/connected/error)
 *   - Audio level animates so the user knows they're being heard
 *   - Tool calls surface as ephemeral pills so the user sees what the AI did
 *   - aria-live region announces transcripts for screen readers
 *   - 44pt+ tap targets; light + dark designed
 */

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { GeminiLiveEngine } from "@/lib/geminiLiveEngine";
import { VOICE_BOT_TOOLS, VOICE_BOT_SYSTEM_PROMPT } from "@/lib/voiceBotTools";
import type { VoiceBotTool } from "@/lib/voiceBotTools";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AlertCircle, MicOff, Mic, PhoneOff, Sparkles, Activity, X } from "lucide-react";

type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "reconnecting" | "error";

interface ToolCallEvent {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  timestamp: number;
  resultSummary?: string;
}

interface TranscriptEvent {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: number;
}

const VOICE_BOT_TOOL_NAMES = new Set(VOICE_BOT_TOOLS.map((t) => t.name));

export function VoiceBot() {
  const [isOpen, setIsOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [muted, setMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcripts, setTranscripts] = useState<TranscriptEvent[]>([]);
  const [toolEvents, setToolEvents] = useState<ToolCallEvent[]>([]);
  const engineRef = useRef<GeminiLiveEngine | null>(null);
  const tokenQuery = trpc.chat.geminiToken.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 60_000,
  });
  const executeIntentMutation = trpc.today.executeVoiceIntent.useMutation();

  // Always tear down the engine on unmount.
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.disconnect();
        engineRef.current = null;
      }
    };
  }, []);

  // Connect when the user opens the panel and we have a token.
  useEffect(() => {
    if (!isOpen) return;
    if (engineRef.current) return; // already connecting/connected
    if (!tokenQuery.data) return;
    if ("error" in tokenQuery.data) {
      toast.error("Voice bot needs the Gemini API key configured. Ask your admin to set GOOGLE_API_KEY.");
      setConnection("error");
      return;
    }

    const engine = new GeminiLiveEngine(
      tokenQuery.data.token,
      {
        onConnectionChange: setConnection,
        onTranscript: (text, isFinal, isUser) => {
          if (!isFinal) return;
          setTranscripts((prev) =>
            [
              ...prev,
              { id: crypto.randomUUID(), text, isUser, timestamp: Date.now() },
            ].slice(-12),
          );
        },
        onAudioLevel: setAudioLevel,
        onToolCall: (toolName, args) => {
          setToolEvents((prev) =>
            [
              ...prev,
              {
                id: crypto.randomUUID(),
                toolName,
                args,
                timestamp: Date.now(),
              },
            ].slice(-6),
          );
        },
        onError: (msg) => {
          toast.error(msg);
        },
      },
      VOICE_BOT_SYSTEM_PROMPT,
      VOICE_BOT_TOOLS as any,
      // Custom tool handler routes to today.executeVoiceIntent
      async (name, args) => {
        if (!VOICE_BOT_TOOL_NAMES.has(name as VoiceBotTool)) {
          return { error: `Unknown voice tool: ${name}` };
        }
        try {
          const { result, voiceSummary } = await executeIntentMutation.mutateAsync({
            tool: name as VoiceBotTool,
            args: args as Record<string, string | number | boolean>,
          });
          // Stamp the most recent matching tool event with its summary so the
          // UI can show what happened.
          setToolEvents((prev) => {
            const last = [...prev].reverse().find((e) => e.toolName === name && !e.resultSummary);
            if (!last) return prev;
            return prev.map((e) => (e.id === last.id ? { ...e, resultSummary: voiceSummary } : e));
          });
          return { kind: result.kind, summary: voiceSummary };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "Tool execution failed" };
        }
      },
    );
    engineRef.current = engine;
    void engine.connect();
  }, [isOpen, tokenQuery.data, executeIntentMutation]);

  const handleClose = () => {
    if (engineRef.current) {
      engineRef.current.disconnect();
      engineRef.current = null;
    }
    setConnection("idle");
    setIsOpen(false);
    setTranscripts([]);
    setToolEvents([]);
    setMuted(false);
    setAudioLevel(0);
  };

  const handleToggleMute = () => {
    if (!engineRef.current) return;
    const next = !muted;
    engineRef.current.setMuted(next);
    setMuted(next);
  };

  // ── Closed: render the FAB ──────────────────────────────────────────────
  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        size="icon"
        aria-label="Start voice conversation"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg transition-transform hover:scale-105 focus-visible:scale-105"
      >
        <Sparkles className="h-5 w-5" aria-hidden />
      </Button>
    );
  }

  // ── Open: render the conversation panel ─────────────────────────────────
  const isLive = connection === "connected";
  const isConnecting = connection === "connecting" || connection === "reconnecting" || tokenQuery.isFetching;

  return (
    <div
      className="fixed bottom-6 right-6 z-40 w-[min(380px,calc(100vw-3rem))] overflow-hidden rounded-2xl border bg-background shadow-2xl"
      role="dialog"
      aria-label="Voice conversation"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <ConnectionDot state={connection} />
          <span className="text-sm font-medium">
            {connection === "idle" || isConnecting
              ? "Connecting…"
              : isLive
              ? "Listening"
              : connection === "error"
              ? "Connection error"
              : connection === "disconnected"
              ? "Disconnected"
              : "Reconnecting…"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="h-8 w-8"
          aria-label="End call and close"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {/* Conversation transcript */}
      <div className="max-h-72 overflow-y-auto px-4 py-3" aria-live="polite" aria-atomic="false">
        {transcripts.length === 0 && toolEvents.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <Sparkles className="h-5 w-5 text-primary" aria-hidden />
            <p>
              {isLive
                ? "Speak naturally. Try: 'How do I reach the SBI CMD?' or 'Met Rajesh from HDFC yesterday.'"
                : "Setting up your conversation…"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {[
              ...transcripts.map((t) => ({ kind: "transcript" as const, ...t })),
              ...toolEvents.map((t) => ({ kind: "tool" as const, ...t })),
            ]
              .sort((a, b) => a.timestamp - b.timestamp)
              .map((event) =>
                event.kind === "transcript" ? (
                  <TranscriptBubble key={event.id} text={event.text} isUser={event.isUser} />
                ) : (
                  <ToolPill key={event.id} toolName={event.toolName} resultSummary={event.resultSummary} />
                ),
              )}
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-3">
        <div className="flex flex-1 items-center gap-2">
          {isLive ? <AudioLevelBars level={muted ? 0 : audioLevel} /> : <span className="h-3 flex-1" />}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={muted ? "destructive" : "outline"}
            size="icon"
            onClick={handleToggleMute}
            disabled={!isLive}
            className="h-11 w-11 rounded-full"
            aria-label={muted ? "Unmute" : "Mute microphone"}
            aria-pressed={muted}
          >
            {muted ? <MicOff className="h-4 w-4" aria-hidden /> : <Mic className="h-4 w-4" aria-hidden />}
          </Button>
          <Button
            variant="destructive"
            size="icon"
            onClick={handleClose}
            className="h-11 w-11 rounded-full"
            aria-label="End call"
          >
            <PhoneOff className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConnectionDot({ state }: { state: ConnectionState }) {
  const tone =
    state === "connected"
      ? "bg-emerald-500 animate-pulse"
      : state === "connecting" || state === "reconnecting"
      ? "bg-amber-400 animate-pulse"
      : state === "error"
      ? "bg-red-500"
      : "bg-muted-foreground/40";
  return <span className={`block h-2.5 w-2.5 rounded-full ${tone}`} aria-hidden />;
}

function TranscriptBubble({ text, isUser }: { text: string; isUser: boolean }) {
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-snug ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function ToolPill({ toolName, resultSummary }: { toolName: string; resultSummary?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed bg-background p-2">
      <Activity className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 text-xs">
        <span className="font-medium">{prettyToolName(toolName)}</span>
        {resultSummary && <p className="mt-0.5 text-muted-foreground leading-relaxed">{resultSummary}</p>}
      </div>
    </div>
  );
}

function AudioLevelBars({ level }: { level: number }) {
  // 8 bars, sized by audio level + slight per-bar variation so silence
  // still looks alive (Apple voice memos pattern).
  return (
    <div className="flex h-3 items-center gap-[2px]" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => {
        const phase = (i + 1) / 8;
        const v = Math.min(1, level * (0.5 + phase) + 0.05);
        return (
          <div
            key={i}
            className="w-1 rounded-full bg-primary/70 transition-all duration-75"
            style={{ height: `${Math.max(2, v * 12)}px`, opacity: 0.4 + v * 0.6 }}
          />
        );
      })}
    </div>
  );
}

function prettyToolName(name: string): string {
  const map: Record<string, string> = {
    findPath: "Found a path",
    briefPerson: "Built a briefing",
    logInteraction: "Logged it",
    searchIntel: "Searched intel",
    updateOpportunity: "Updated opportunity",
    addToWatchlist: "Added to watchlist",
    whoOwns: "Looked up owner",
    coverageGap: "Checked coverage",
  };
  return map[name] ?? name;
}
