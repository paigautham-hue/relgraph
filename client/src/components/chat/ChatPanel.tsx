import { useState, useRef, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  MessageCircle,
  Send,
  Mic,
  MicOff,
  Loader2,
  Bot,
  User,
  Plus,
  Trash2,
  ChevronDown,
  Sparkles,
  PhoneCall,
  PhoneOff,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { GeminiLiveEngine, type GeminiLiveCallbacks } from '@/lib/geminiLiveEngine';
import { RELGRAPH_SYSTEM_PROMPT_CLIENT } from '@/lib/chatPrompt';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string | Date;
  toolCalls?: any[] | null;
  sourcesUsed?: any[] | null;
}

type VoiceState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'speaking'
  | 'listening'
  | 'reconnecting'
  | 'error';

// ---------------------------------------------------------------------------
// Suggestion chips
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  { label: 'Brief me on...', prompt: 'Brief me on ' },
  { label: 'Who knows...', prompt: 'Who knows ' },
  { label: 'Path to...', prompt: 'Find the warmest path to ' },
  { label: 'Coverage at...', prompt: 'What is our coverage at ' },
  { label: 'Recent interactions', prompt: 'Show recent interactions' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatPanel() {
  // Panel state
  const [open, setOpen] = useState(false);

  // Conversations
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showConversationList, setShowConversationList] = useState(false);

  // Messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Voice
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceTranscripts, setVoiceTranscripts] = useState<
    { text: string; isUser: boolean }[]
  >([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const engineRef = useRef<GeminiLiveEngine | null>(null);

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── tRPC queries / mutations ──────────────────────────────────────────

  const conversationsQuery = trpc.chat.listConversations.useQuery(undefined, {
    enabled: open,
  });

  const messagesQuery = trpc.chat.getMessages.useQuery(
    { conversationId: activeConversationId! },
    { enabled: !!activeConversationId },
  );

  const createConversation = trpc.chat.createConversation.useMutation({
    onSuccess: (data) => {
      setActiveConversationId(data.id);
      setMessages([]);
      conversationsQuery.refetch();
    },
  });

  const sendMessageMutation = trpc.chat.sendMessage.useMutation();

  const deleteConversation = trpc.chat.deleteConversation.useMutation({
    onSuccess: () => {
      setActiveConversationId(null);
      setMessages([]);
      conversationsQuery.refetch();
    },
  });

  const geminiTokenQuery = trpc.chat.geminiToken.useQuery(undefined, {
    enabled: false, // Fetch on demand
  });

  // ── Sync messages from query ──────────────────────────────────────────

  useEffect(() => {
    if (messagesQuery.data) {
      setMessages(
        messagesQuery.data.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
          createdAt: m.createdAt,
          toolCalls: m.toolCalls as any,
          sourcesUsed: m.sourcesUsed as any,
        })),
      );
    }
  }, [messagesQuery.data]);

  // ── Auto-scroll ───────────────────────────────────────────────────────

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, voiceTranscripts]);

  // ── Send text message ─────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isSending) return;

    // Create conversation if none active
    let convId = activeConversationId;
    if (!convId) {
      try {
        const conv = await createConversation.mutateAsync({});
        convId = conv.id;
      } catch {
        toast.error('Failed to create conversation');
        return;
      }
    }

    setInputValue('');
    setIsSending(true);

    // Optimistic user message
    const userMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const result = await sendMessageMutation.mutateAsync({
        conversationId: convId!,
        content: text,
      });

      // Add assistant response
      const assistantMsg: ChatMessage = {
        id: `resp-${Date.now()}`,
        role: 'assistant',
        content: result.response,
        createdAt: new Date().toISOString(),
        toolCalls: result.toolCalls,
        sourcesUsed: result.toolCalls?.map((t) => ({ tool: t.name })),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      conversationsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  }, [
    inputValue,
    isSending,
    activeConversationId,
    createConversation,
    sendMessageMutation,
    conversationsQuery,
  ]);

  // ── Voice mode ────────────────────────────────────────────────────────

  const startVoice = useCallback(async () => {
    try {
      const tokenResult = await geminiTokenQuery.refetch();
      const data = tokenResult.data;
      if (!data || 'error' in data) {
        toast.error(
          (data as any)?.error || 'Gemini API key not configured',
        );
        return;
      }

      setVoiceState('connecting');
      setVoiceTranscripts([]);

      const callbacks: GeminiLiveCallbacks = {
        onConnectionChange: (state) => {
          const stateMap: Record<string, VoiceState> = {
            connecting: 'connecting',
            connected: 'connected',
            disconnected: 'idle',
            reconnecting: 'reconnecting',
            error: 'error',
          };
          setVoiceState(stateMap[state] || 'idle');
        },
        onTranscript: (text, _isFinal, isUser) => {
          setVoiceTranscripts((prev) => {
            // Append or update the latest transcript from the same speaker
            const last = prev[prev.length - 1];
            if (last && last.isUser === isUser) {
              return [...prev.slice(0, -1), { text: last.text + ' ' + text, isUser }];
            }
            return [...prev, { text, isUser }];
          });
          if (!isUser) {
            setVoiceState('speaking');
          } else {
            setVoiceState('listening');
          }
        },
        onAudioLevel: (level) => {
          setAudioLevel(level);
        },
        onToolCall: (toolName) => {
          setVoiceTranscripts((prev) => [
            ...prev,
            { text: `[Looking up: ${toolName}...]`, isUser: false },
          ]);
        },
        onError: (error) => {
          toast.error(error);
        },
      };

      const engine = new GeminiLiveEngine(
        data.token,
        callbacks,
        RELGRAPH_SYSTEM_PROMPT_CLIENT,
      );
      engineRef.current = engine;
      await engine.connect();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to start voice');
      setVoiceState('idle');
    }
  }, [geminiTokenQuery]);

  const stopVoice = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.disconnect();
      engineRef.current = null;
    }
    setVoiceState('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.disconnect();
        engineRef.current = null;
      }
    };
  }, []);

  // ── Keyboard shortcut ─────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // ── Voice status label ────────────────────────────────────────────────

  const voiceStatusLabel: Record<VoiceState, string> = {
    idle: '',
    connecting: 'Connecting...',
    connected: 'Ready - speak now',
    speaking: 'AI speaking...',
    listening: 'Listening...',
    reconnecting: 'Reconnecting...',
    error: 'Connection error',
  };

  const voiceStatusColor: Record<VoiceState, string> = {
    idle: '',
    connecting: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    connected: 'bg-green-500/20 text-green-700 dark:text-green-400',
    speaking: 'bg-blue-500/20 text-blue-700 dark:text-blue-400',
    listening: 'bg-green-500/20 text-green-700 dark:text-green-400',
    reconnecting: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400',
    error: 'bg-red-500/20 text-red-700 dark:text-red-400',
  };

  // ── Render ────────────────────────────────────────────────────────────

  const isVoiceActive = voiceState !== 'idle';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* Floating toggle button */}
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all"
          variant="default"
        >
          <MessageCircle className="h-5 w-5" />
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:w-[420px] p-0 flex flex-col"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <SheetTitle className="text-base">RelGraph AI</SheetTitle>
            </div>
            <div className="flex items-center gap-1">
              {/* Conversation selector */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowConversationList(!showConversationList)}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              {/* New conversation */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setActiveConversationId(null);
                  setMessages([]);
                  setShowConversationList(false);
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Voice status indicator */}
          {isVoiceActive && (
            <div className="flex items-center gap-2 mt-2">
              <Badge
                variant="secondary"
                className={cn(
                  'text-xs font-normal',
                  voiceStatusColor[voiceState],
                )}
              >
                <Volume2 className="h-3 w-3 mr-1" />
                {voiceStatusLabel[voiceState]}
              </Badge>
              {voiceState === 'listening' && (
                <div
                  className="h-2 bg-green-500 rounded-full transition-all duration-75"
                  style={{
                    width: `${Math.min(audioLevel * 500, 100)}%`,
                    minWidth: '4px',
                  }}
                />
              )}
            </div>
          )}
        </SheetHeader>

        {/* ── Conversation list dropdown ──────────────────────── */}
        {showConversationList && (
          <div className="border-b bg-muted/30 max-h-48 overflow-y-auto shrink-0">
            {conversationsQuery.data?.length === 0 && (
              <p className="text-xs text-muted-foreground p-3">
                No conversations yet
              </p>
            )}
            {conversationsQuery.data?.map((conv) => (
              <button
                key={conv.id}
                onClick={() => {
                  setActiveConversationId(conv.id);
                  setShowConversationList(false);
                }}
                className={cn(
                  'w-full text-left px-4 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between group',
                  activeConversationId === conv.id && 'bg-muted',
                )}
              >
                <span className="truncate flex-1 mr-2">
                  {conv.title || 'New conversation'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation.mutate({
                      conversationId: conv.id,
                    });
                  }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </button>
            ))}
          </div>
        )}

        {/* ── Message area ────────────────────────────────────── */}
        <ScrollArea className="flex-1 px-4" ref={scrollRef}>
          <div className="py-4 space-y-4">
            {/* Empty state */}
            {messages.length === 0 && !isVoiceActive && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Sparkles className="h-10 w-10 text-muted-foreground/40 mb-4" />
                <p className="text-sm font-medium text-muted-foreground">
                  Ask me anything about your network
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  I can look up people, find paths, and generate briefings.
                </p>

                {/* Suggestion chips */}
                <div className="flex flex-wrap gap-2 mt-6 justify-center max-w-[320px]">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      className="text-xs px-3 py-1.5 rounded-full border bg-background hover:bg-muted transition-colors"
                      onClick={() => {
                        setInputValue(s.prompt);
                        inputRef.current?.focus();
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Text messages */}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Sending indicator */}
            {isSending && (
              <div className="flex items-start gap-2">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Thinking...
                </div>
              </div>
            )}

            {/* Voice transcripts */}
            {isVoiceActive && voiceTranscripts.length > 0 && (
              <div className="space-y-3 border-t pt-4 mt-4">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                  Voice conversation
                </p>
                {voiceTranscripts.map((t, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-start gap-2',
                      t.isUser && 'flex-row-reverse',
                    )}
                  >
                    <div
                      className={cn(
                        'h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                        t.isUser
                          ? 'bg-foreground/10'
                          : 'bg-primary/10',
                      )}
                    >
                      {t.isUser ? (
                        <User className="h-3 w-3" />
                      ) : (
                        <Bot className="h-3 w-3 text-primary" />
                      )}
                    </div>
                    <div
                      className={cn(
                        'rounded-lg px-3 py-2 text-sm max-w-[80%]',
                        t.isUser
                          ? 'bg-foreground/5 text-foreground'
                          : 'bg-primary/5 text-foreground',
                      )}
                    >
                      {t.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Input bar ───────────────────────────────────────── */}
        <div className="border-t p-3 shrink-0">
          <div className="flex items-center gap-2">
            {/* Voice toggle */}
            <Button
              variant={isVoiceActive ? 'destructive' : 'outline'}
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={isVoiceActive ? stopVoice : startVoice}
              title={isVoiceActive ? 'End voice call' : 'Start voice chat'}
            >
              {isVoiceActive ? (
                <PhoneOff className="h-4 w-4" />
              ) : (
                <PhoneCall className="h-4 w-4" />
              )}
            </Button>

            {/* Text input */}
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  isVoiceActive
                    ? 'Voice mode active...'
                    : 'Ask about your network...'
                }
                disabled={isSending || isVoiceActive}
                className="pr-10 h-9 text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-9 w-9"
                onClick={handleSend}
                disabled={!inputValue.trim() || isSending || isVoiceActive}
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Message bubble sub-component
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const sources = message.sourcesUsed as { tool: string }[] | null;

  return (
    <div
      className={cn('flex items-start gap-2', isUser && 'flex-row-reverse')}
    >
      <div
        className={cn(
          'h-7 w-7 rounded-full flex items-center justify-center shrink-0 mt-0.5',
          isUser ? 'bg-foreground/10' : 'bg-primary/10',
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>

      <div
        className={cn(
          'rounded-lg px-3 py-2 text-sm max-w-[85%] space-y-2',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted/60 text-foreground',
        )}
      >
        {/* Message content with basic markdown-like formatting */}
        <div className="whitespace-pre-wrap break-words leading-relaxed">
          {message.content}
        </div>

        {/* Source attribution */}
        {sources && sources.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1 border-t border-foreground/5">
            {sources.map((s, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-[10px] py-0 h-4 font-normal opacity-60"
              >
                {s.tool.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
