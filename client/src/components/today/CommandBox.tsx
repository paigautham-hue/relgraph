/**
 * CommandBox — the universal command surface at the top of the Today page.
 *
 * One input. Eight intents. Apple-grade.
 *
 *   - Submits via Cmd/Ctrl+Enter or the send button
 *   - Shows a compact "Routing as: …" hint after a 600ms debounce while typing
 *     (free classification preview — single Claude Haiku call, ~$0.0001)
 *   - On submit, dispatches via `today.command` and renders a result card
 *     immediately below the box
 *   - Empty state: pre-filled placeholder rotates between five example
 *     prompts so the user discovers what's possible
 *   - Result card supports "Try another" (clears) and a contextual primary
 *     action (e.g. open profile after briefPerson)
 *
 * Voice mic placeholder is rendered to the right of the send button. The
 * actual voice flow ships in Week 4 when VoiceInputButton lands.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Bot,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Eye,
  HelpCircle,
  Newspaper,
  Send,
  Sparkles,
  TrendingDown,
  UserCircle2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

const PLACEHOLDER_EXAMPLES = [
  "How do I reach the SBI CMD?",
  "Brief me on the new RBI Deputy Governor",
  "Met Rajesh from HDFC yesterday — said NBFC partnerships are easing",
  "What's new on ICICI?",
  "Watch the SEBI chair for me",
];

type ToolKey =
  | "findPath"
  | "briefPerson"
  | "logInteraction"
  | "searchIntel"
  | "updateOpportunity"
  | "addToWatchlist"
  | "whoOwns"
  | "coverageGap"
  | "unknown";

const TOOL_META: Record<ToolKey, { label: string; icon: typeof ArrowRight; tone: string }> = {
  findPath: { label: "Find a path", icon: ArrowRight, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  briefPerson: { label: "Brief on a person", icon: BookOpen, tone: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  logInteraction: { label: "Log this interaction", icon: CheckCircle2, tone: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  searchIntel: { label: "Search intel", icon: Newspaper, tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  updateOpportunity: { label: "Update opportunity", icon: Briefcase, tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
  addToWatchlist: { label: "Add to watchlist", icon: Eye, tone: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" },
  whoOwns: { label: "Find owner", icon: Users, tone: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300" },
  coverageGap: { label: "Coverage gaps", icon: TrendingDown, tone: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  unknown: { label: "Unrecognised", icon: HelpCircle, tone: "bg-muted text-muted-foreground" },
};

type CommandResult = {
  intent: { tool: ToolKey; args: Record<string, string>; confidence: number; rationale?: string };
  result: any;
};

export function CommandBox() {
  const [, setLocation] = useLocation();
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [activeResult, setActiveResult] = useState<CommandResult | null>(null);
  const placeholder = useMemo(
    () => PLACEHOLDER_EXAMPLES[Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length)],
    [],
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Debounce typed input for live classification preview.
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(text.trim()), 600);
    return () => clearTimeout(handle);
  }, [text]);

  // Live classification — only fires when the user has paused typing AND
  // typed at least 8 characters. Keeps the cost trivial.
  const classifyQuery = trpc.today.classify.useQuery(
    { utterance: debounced },
    {
      enabled: debounced.length >= 8 && !activeResult,
      staleTime: 30_000,
    },
  );

  const commandMutation = trpc.today.command.useMutation({
    onSuccess: (data) => {
      setActiveResult(data as CommandResult);
    },
    onError: (err) => {
      toast.error(err.message || "I couldn't run that. Try rephrasing or use one of the example prompts.");
    },
  });

  const handleSubmit = () => {
    const utterance = text.trim();
    if (!utterance) return;
    if (utterance.length < 4) {
      toast.info("Tell me a bit more — at least a few words.");
      return;
    }
    commandMutation.mutate({ utterance });
  };

  const handleReset = () => {
    setText("");
    setActiveResult(null);
    setDebounced("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const charCount = text.length;
  const isPending = commandMutation.isPending;
  const canSubmit = text.trim().length >= 4 && !isPending;
  const livePreview = !activeResult && classifyQuery.data && classifyQuery.data.confidence >= 0.5
    ? classifyQuery.data
    : null;

  return (
    <Card className="overflow-hidden border-2 transition-all focus-within:border-primary/40 focus-within:shadow-md">
      <CardContent className="p-3 md:p-4">
        {!activeResult ? (
          <>
            <div className="flex items-start gap-2">
              <Sparkles className="mt-2.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
              <Textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={isPending}
                rows={1}
                className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent px-1 py-2 text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:text-base"
                aria-label="Command box — type a question or describe what happened"
              />
              <div className="mt-1">
                <VoiceInputButton
                  onTranscription={(text) =>
                    setText((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))
                  }
                  ariaLabel="Voice input — tap to record, tap stop to insert"
                  disabled={isPending}
                />
              </div>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                size="icon"
                className="mt-1 h-11 w-11 flex-shrink-0 rounded-full"
                aria-label="Run command"
              >
                {isPending ? (
                  <Activity className="h-4 w-4 animate-pulse" aria-hidden />
                ) : (
                  <Send className="h-4 w-4" aria-hidden />
                )}
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 px-1">
              <div className="flex min-h-[20px] items-center gap-2 text-xs text-muted-foreground">
                {classifyQuery.isFetching && !classifyQuery.data && (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> reading…
                  </span>
                )}
                {livePreview && <ToolBadge tool={livePreview.tool as ToolKey} />}
              </div>
              <kbd className="hidden rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground sm:inline">
                {typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac") ? "⌘↵" : "Ctrl+↵"}
              </kbd>
            </div>
          </>
        ) : (
          <CommandResultView
            result={activeResult}
            onReset={handleReset}
            onNavigate={(p) => setLocation(p)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ToolBadge({ tool }: { tool: ToolKey }) {
  const meta = TOOL_META[tool] ?? TOOL_META.unknown;
  const Icon = meta.icon;
  return (
    <Badge className={`gap-1 font-normal ${meta.tone}`}>
      <Icon className="h-3 w-3" aria-hidden />
      Routing as: {meta.label}
    </Badge>
  );
}

function CommandResultView(props: {
  result: CommandResult;
  onReset: () => void;
  onNavigate: (path: string) => void;
}) {
  const { result } = props;
  const meta = TOOL_META[result.intent.tool] ?? TOOL_META.unknown;
  const Icon = meta.icon;
  const isError = result.result.kind === "error";
  const isPending = result.result.kind === "pending";

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {isError ? (
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
          ) : isPending ? (
            <Bot className="h-4 w-4 text-muted-foreground" aria-hidden />
          ) : (
            <Icon className="h-4 w-4 text-primary" aria-hidden />
          )}
          <Badge className={`font-normal ${meta.tone}`}>{meta.label}</Badge>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={props.onReset}
          className="h-8 w-8"
          aria-label="Clear result and ask another"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      <p className="text-sm leading-relaxed">{result.result.summary}</p>

      <CommandResultDetail result={result} onNavigate={props.onNavigate} />

      <div className="flex justify-between gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={props.onReset} className="h-9 gap-1.5">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Ask another
        </Button>
      </div>
    </div>
  );
}

function CommandResultDetail({
  result,
  onNavigate,
}: {
  result: CommandResult;
  onNavigate: (path: string) => void;
}) {
  const r = result.result;
  if (r.kind === "briefing" && r.payload?.matched?.length > 0) {
    return (
      <div className="grid gap-2">
        {r.payload.matched.map((m: { id: string; name: string; currentTitle: string | null }) => (
          <button
            key={m.id}
            onClick={() => onNavigate(`/persons/${m.id}`)}
            className="group flex items-center gap-3 rounded-lg border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-muted/40"
          >
            <UserCircle2 className="h-5 w-5 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{m.name}</div>
              {m.currentTitle && <div className="text-xs text-muted-foreground">{m.currentTitle}</div>}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" aria-hidden />
          </button>
        ))}
      </div>
    );
  }
  if (r.kind === "intel" && r.payload?.powerMoves?.length > 0) {
    return (
      <div className="grid gap-2">
        {r.payload.powerMoves.map((m: { id: string; headline: string; type: string; occurredAt: Date | null }) => (
          <div key={m.id} className="rounded-lg border bg-background p-3">
            <div className="text-sm font-medium">{m.headline}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {m.type.replace(/_/g, " ")}
              {m.occurredAt && (
                <>
                  {" · "}
                  {new Date(m.occurredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (r.kind === "owner" && r.payload?.matches?.length > 0) {
    return (
      <div className="grid gap-2">
        {r.payload.matches.map((m: { personId: string; personName: string; ownerName: string; tier: string }) => (
          <button
            key={m.personId}
            onClick={() => onNavigate(`/persons/${m.personId}`)}
            className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3 text-left transition hover:border-primary/40"
          >
            <div>
              <div className="font-medium">{m.personName}</div>
              <div className="text-xs text-muted-foreground">Owner: {m.ownerName} · {m.tier.replace("_", " ")}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          </button>
        ))}
      </div>
    );
  }
  if (r.kind === "gap" && r.payload?.gaps?.length > 0) {
    return (
      <div className="rounded-lg border bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
        <p className="mb-2 font-medium text-amber-900 dark:text-amber-200">Uncovered:</p>
        <ul className="ml-4 list-disc space-y-0.5 text-amber-900 dark:text-amber-200">
          {r.payload.gaps.slice(0, 8).map((name: string) => (
            <li key={name}>{name}</li>
          ))}
          {r.payload.gaps.length > 8 && (
            <li className="text-muted-foreground">… and {r.payload.gaps.length - 8} more</li>
          )}
        </ul>
      </div>
    );
  }
  if (r.kind === "logged" && r.payload?.interactionId) {
    return (
      <p className="text-xs text-muted-foreground">
        Interaction id <code className="rounded bg-muted px-1">{r.payload.interactionId.slice(0, 8)}…</code>
      </p>
    );
  }
  if (r.kind === "watch_added") {
    return (
      <p className="text-xs text-muted-foreground">
        Watching <span className="font-medium text-foreground">{r.payload.target}</span>. You can manage watches in Settings.
      </p>
    );
  }
  return null;
}
