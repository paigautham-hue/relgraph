/**
 * Watches — manage your subscription list.
 *
 * Per Rule 3 #1, one job: "what am I tracking, and do I still want to?"
 * Cards group by target type (person/org/sector/role); inline toggles for
 * digest + push notifications; one-tap remove with optimistic UI.
 *
 * Empty state guides the user back to the command box: "Watch X" creates
 * watches; this page just manages them.
 */

import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Building2, Eye, Trash2, UserCircle2, Users, Briefcase, Sparkles, ArrowRight } from "lucide-react";

type TargetType = "person" | "organization" | "sector" | "role";

const TARGET_META: Record<TargetType, { label: string; icon: typeof Eye }> = {
  person: { label: "Person", icon: UserCircle2 },
  organization: { label: "Organization", icon: Building2 },
  sector: { label: "Sector", icon: Users },
  role: { label: "Role", icon: Briefcase },
};

function relativeTime(value: string | Date): string {
  const d = new Date(value);
  const days = Math.round((Date.now() - d.getTime()) / 86400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function WatchesPage() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const listQuery = trpc.watches.list.useQuery();
  const updateMutation = trpc.watches.update.useMutation({
    onMutate: async (input) => {
      await utils.watches.list.cancel();
      const prev = utils.watches.list.getData();
      if (prev) {
        utils.watches.list.setData(undefined, (old) =>
          old?.map((w) =>
            w.id === input.id
              ? {
                  ...w,
                  ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                  ...(input.notifyDigest !== undefined ? { notifyDigest: input.notifyDigest } : {}),
                  ...(input.notifyPush !== undefined ? { notifyPush: input.notifyPush } : {}),
                }
              : w,
          ),
        );
      }
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) utils.watches.list.setData(undefined, ctx.prev);
      toast.error(err.message || "Couldn't save the change. Try again.");
    },
    onSuccess: () => utils.watches.list.invalidate(),
  });
  const deleteMutation = trpc.watches.delete.useMutation({
    onMutate: async (input) => {
      await utils.watches.list.cancel();
      const prev = utils.watches.list.getData();
      if (prev) {
        utils.watches.list.setData(undefined, (old) => old?.filter((w) => w.id !== input.id));
      }
      return { prev };
    },
    onSuccess: () => {
      toast.success("Removed from watchlist");
      utils.watches.list.invalidate();
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) utils.watches.list.setData(undefined, ctx.prev);
      toast.error(err.message || "Couldn't remove the watch.");
    },
  });

  const watches = listQuery.data ?? [];
  const active = watches.filter((w) => w.isActive);
  const paused = watches.filter((w) => !w.isActive);

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-12">
      <PageHeader
        title="Watches"
        subtitle="Subscriptions that drive your daily digest. Add new watches via the command box on Today."
      />

      {listQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : watches.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Eye className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="max-w-md">
              <p className="font-medium">You're not watching anything yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Use the command box on Today: <span className="font-medium text-foreground">"Watch the new RBI Deputy Governor"</span>{" "}
                or <span className="font-medium text-foreground">"Track ICICI"</span>.
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setLocation("/")} className="gap-1">
              Go to Today <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <WatchSection
            title="Active"
            count={active.length}
            watches={active}
            onUpdate={(input) => updateMutation.mutate(input)}
            onDelete={(id) => deleteMutation.mutate({ id })}
          />
          {paused.length > 0 && (
            <WatchSection
              title="Paused"
              count={paused.length}
              watches={paused}
              onUpdate={(input) => updateMutation.mutate(input)}
              onDelete={(id) => deleteMutation.mutate({ id })}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface WatchRow {
  id: string;
  targetType: string;
  targetId: string | null;
  targetLabel: string;
  isActive: boolean;
  notifyDigest: boolean;
  notifyPush: boolean;
  createdAt: string | Date;
}

function WatchSection(props: {
  title: string;
  count: number;
  watches: WatchRow[];
  onUpdate: (input: { id: string; isActive?: boolean; notifyDigest?: boolean; notifyPush?: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{props.title}</h2>
        <span className="text-xs text-muted-foreground">{props.count}</span>
      </div>
      <div className="space-y-2">
        {props.watches.map((w) => (
          <WatchCard key={w.id} watch={w} onUpdate={props.onUpdate} onDelete={props.onDelete} />
        ))}
      </div>
    </section>
  );
}

function WatchCard(props: {
  watch: WatchRow;
  onUpdate: (input: { id: string; isActive?: boolean; notifyDigest?: boolean; notifyPush?: boolean }) => void;
  onDelete: (id: string) => void;
}) {
  const { watch } = props;
  const meta = TARGET_META[watch.targetType as TargetType] ?? {
    label: watch.targetType,
    icon: Sparkles,
  };
  const Icon = meta.icon;

  return (
    <Card className={`transition ${watch.isActive ? "" : "opacity-60"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Icon className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium leading-snug">{watch.targetLabel}</p>
                <Badge variant="outline" className="text-xs">{meta.label}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Added {relativeTime(watch.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={watch.isActive}
              onCheckedChange={(v) => props.onUpdate({ id: watch.id, isActive: v })}
              aria-label={watch.isActive ? "Pause watch" : "Resume watch"}
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Remove watch">
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" aria-hidden />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove "{watch.targetLabel}" from watchlist?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You'll stop seeing digest cards for this target. You can add it back any time via the command box.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep watching</AlertDialogCancel>
                  <AlertDialogAction onClick={() => props.onDelete(watch.id)}>Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {watch.isActive && (
          <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs">
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-muted-foreground">Daily digest</span>
              <Switch
                checked={watch.notifyDigest}
                onCheckedChange={(v) => props.onUpdate({ id: watch.id, notifyDigest: v })}
                aria-label="Toggle digest notifications"
              />
            </label>
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-muted-foreground">Push alerts</span>
              <Switch
                checked={watch.notifyPush}
                onCheckedChange={(v) => props.onUpdate({ id: watch.id, notifyPush: v })}
                aria-label="Toggle push notifications"
              />
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
