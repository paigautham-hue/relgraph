/**
 * DigestCard — renders one card in the Today action feed.
 *
 * The 10 card types share a single component so the feed reads consistently;
 * the icon + tone + footer-action change per type. A minimal abstraction
 * — premature abstraction would cost more than it saves at 10 types.
 *
 * Apple-grade per Rule 3:
 *   - Optimistic dismiss (slides + fades; rolls back on error)
 *   - Tap-to-action navigates to the related entity
 *   - Designed empty-string fallbacks ("we'll learn about this once …")
 *   - Light + dark designed; not inverted
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertOctagon,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Gauge,
  Network,
  TrendingDown,
  TrendingUp,
  UserMinus,
  Users,
  X,
  Zap,
} from "lucide-react";

type CardType =
  | "power_move"
  | "briefing"
  | "follow_up"
  | "stale_relationship"
  | "new_path"
  | "team_intel"
  | "opportunity_stall"
  | "no_owner"
  | "opportunity_momentum"
  | "watchlist_hit";

interface DigestCardData {
  id: string;
  type: string;
  title: string;
  body: string | null;
  rank: number;
  relatedPersonId: string | null;
  relatedPersonName: string | null;
  relatedOrgId: string | null;
  relatedOrgName: string | null;
  relatedOpportunityId: string | null;
  relatedOpportunityName: string | null;
  relatedPowerMoveId: string | null;
  relatedPowerMoveHeadline: string | null;
  actionPayload: Record<string, unknown> | null;
  isDismissed: boolean;
  isActioned: boolean;
  createdAt: string | Date;
  expiresAt: string | Date | null;
}

const CARD_META: Record<CardType, { label: string; icon: typeof Zap; tone: string; iconBg: string }> = {
  power_move: {
    label: "Power move",
    icon: Zap,
    tone: "text-amber-700 dark:text-amber-300",
    iconBg: "bg-amber-100 dark:bg-amber-900/30",
  },
  briefing: {
    label: "Briefing ready",
    icon: FileText,
    tone: "text-sky-700 dark:text-sky-300",
    iconBg: "bg-sky-100 dark:bg-sky-900/30",
  },
  follow_up: {
    label: "Follow-up due",
    icon: Clock,
    tone: "text-violet-700 dark:text-violet-300",
    iconBg: "bg-violet-100 dark:bg-violet-900/30",
  },
  stale_relationship: {
    label: "Stale relationship",
    icon: TrendingDown,
    tone: "text-orange-700 dark:text-orange-300",
    iconBg: "bg-orange-100 dark:bg-orange-900/30",
  },
  new_path: {
    label: "New path opened",
    icon: Network,
    tone: "text-emerald-700 dark:text-emerald-300",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/30",
  },
  team_intel: {
    label: "Team intel",
    icon: Users,
    tone: "text-indigo-700 dark:text-indigo-300",
    iconBg: "bg-indigo-100 dark:bg-indigo-900/30",
  },
  opportunity_stall: {
    label: "Opportunity stalled",
    icon: AlertOctagon,
    tone: "text-rose-700 dark:text-rose-300",
    iconBg: "bg-rose-100 dark:bg-rose-900/30",
  },
  no_owner: {
    label: "Needs an owner",
    icon: UserMinus,
    tone: "text-slate-700 dark:text-slate-300",
    iconBg: "bg-slate-100 dark:bg-slate-800",
  },
  opportunity_momentum: {
    label: "Momentum",
    icon: TrendingUp,
    tone: "text-teal-700 dark:text-teal-300",
    iconBg: "bg-teal-100 dark:bg-teal-900/30",
  },
  watchlist_hit: {
    label: "Watchlist hit",
    icon: Eye,
    tone: "text-pink-700 dark:text-pink-300",
    iconBg: "bg-pink-100 dark:bg-pink-900/30",
  },
};

function relativeTime(value: string | Date): string {
  const d = new Date(value);
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function DigestCard({ card }: { card: DigestCardData }) {
  const [, setLocation] = useLocation();
  const [isLeaving, setIsLeaving] = useState(false);
  const utils = trpc.useUtils();
  const meta = CARD_META[card.type as CardType] ?? {
    label: card.type,
    icon: Briefcase,
    tone: "text-muted-foreground",
    iconBg: "bg-muted",
  };
  const Icon = meta.icon;

  const dismissMutation = trpc.today.dismissCard.useMutation({
    onMutate: async ({ id }) => {
      await utils.today.feed.cancel();
      setIsLeaving(true);
    },
    onSuccess: () => {
      utils.today.feed.invalidate();
    },
    onError: (err) => {
      setIsLeaving(false);
      toast.error(err.message || "Couldn't dismiss this card. Try again.");
    },
  });

  const actMutation = trpc.today.actCard.useMutation({
    onSuccess: () => {
      utils.today.feed.invalidate();
    },
  });

  const targetPath = card.relatedPersonId
    ? `/persons/${card.relatedPersonId}`
    : card.relatedOrgId
    ? `/organizations`
    : null;

  const handlePrimaryAction = () => {
    actMutation.mutate({ id: card.id });
    if (targetPath) setLocation(targetPath);
  };

  return (
    <Card
      className={`group transition-all duration-300 ${
        isLeaving
          ? "scale-95 opacity-0 -translate-x-3 pointer-events-none"
          : "hover:shadow-sm hover:border-primary/30"
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${meta.iconBg}`}>
            <Icon className={`h-4 w-4 ${meta.tone}`} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={`font-normal ${meta.tone}`}>{meta.label}</Badge>
              <span className="text-xs text-muted-foreground">{relativeTime(card.createdAt)}</span>
            </div>
            <h3 className="mt-2 text-sm font-semibold leading-snug">{card.title}</h3>
            {card.body && (
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{card.body}</p>
            )}
            {card.relatedPersonName && (
              <p className="mt-2 text-xs text-muted-foreground">
                Person: <span className="font-medium text-foreground">{card.relatedPersonName}</span>
              </p>
            )}
            {card.relatedOrgName && !card.relatedPersonName && (
              <p className="mt-2 text-xs text-muted-foreground">
                Org: <span className="font-medium text-foreground">{card.relatedOrgName}</span>
              </p>
            )}
            {card.relatedOpportunityName && (
              <p className="mt-1 text-xs text-muted-foreground">
                Opportunity: <span className="font-medium text-foreground">{card.relatedOpportunityName}</span>
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dismissMutation.mutate({ id: card.id })}
            disabled={dismissMutation.isPending}
            className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            aria-label="Dismiss card"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>

        {targetPath && (
          <div className="mt-3 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrimaryAction}
              className="h-8 gap-1 text-xs"
            >
              Open <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export type { DigestCardData };
