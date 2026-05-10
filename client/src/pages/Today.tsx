/**
 * Today — the homepage. Universal command box at the top, action feed below.
 *
 * One job: "What should I do now?"
 * Per Rule 3 #1, this page does nothing else. No metrics widgets, no
 * navigation grids — those live in Settings or Graph.
 *
 * Empty-state strategy (Rule 3 #2): until the digest agent populates cards,
 * the feed shows three "starter" prompts that teach the user how to use the
 * command box and watchlist.
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { CommandBox } from "@/components/today/CommandBox";
import { DigestCard } from "@/components/today/DigestCard";
import { VoiceBot } from "@/components/voice/VoiceBot";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ArrowRight, Bot, Eye, Sparkles, Network } from "lucide-react";

const STARTER_PROMPTS = [
  {
    icon: Network,
    title: "Find a path",
    body: "Type \"How do I reach the SBI CMD?\" or any name + org.",
  },
  {
    icon: Eye,
    title: "Watch a person or sector",
    body: "Try \"Watch the new RBI Deputy Governor for me\" — you'll see updates here.",
  },
  {
    icon: Sparkles,
    title: "Log an interaction",
    body: "Type freely: \"Met Rajesh from HDFC yesterday — said NBFC partnerships are easing.\" RelGraph extracts the people.",
  },
];

function greeting(name: string | undefined): string {
  const hour = new Date().getHours();
  const who = name?.split(/\s+/)[0] ?? "there";
  if (hour < 12) return `Good morning, ${who}`;
  if (hour < 17) return `Good afternoon, ${who}`;
  return `Good evening, ${who}`;
}

export default function TodayPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const feedQuery = trpc.today.feed.useQuery({ limit: 50, includeDismissed: false });

  const cards = feedQuery.data ?? [];
  const dateText = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-16">
      <header className="space-y-1 pt-2">
        <p className="text-sm text-muted-foreground">{dateText}</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{greeting(user?.name)}</h1>
        <p className="text-sm text-muted-foreground">
          Ask anything, log an interaction, or scan what needs you.
        </p>
      </header>

      <CommandBox />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-muted-foreground tracking-wide uppercase">For you today</h2>
          {cards.length > 0 && (
            <span className="text-xs text-muted-foreground">{cards.length} card{cards.length === 1 ? "" : "s"}</span>
          )}
        </div>

        {feedQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : cards.length === 0 ? (
          <EmptyFeed onNavigate={(path) => setLocation(path)} />
        ) : (
          <div className="space-y-3">
            {cards.map((c) => (
              <DigestCard key={c.id} card={c as any} />
            ))}
          </div>
        )}
      </section>

      {/* Voice bot floats above the page; absent until the user taps. */}
      <VoiceBot />
    </div>
  );
}

function EmptyFeed(props: { onNavigate: (path: string) => void }) {
  return (
    <div className="space-y-4">
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <div className="max-w-md">
            <p className="font-medium">Your feed is quiet — try the command box above</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Once you start watching people and orgs, RelGraph will surface power-moves, briefings,
              and stale relationships here every morning at 06:00 IST.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {STARTER_PROMPTS.map((p) => (
          <Card key={p.title} className="transition hover:border-primary/30">
            <CardContent className="space-y-2 p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <p.icon className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <p className="text-sm font-medium">{p.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{p.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={() => props.onNavigate("/graph")} className="gap-1">
          Or browse the graph <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
