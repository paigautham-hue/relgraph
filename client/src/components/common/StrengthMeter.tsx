import { cn } from "@/lib/utils";

interface StrengthMeterProps {
  score: number;
  label?: string;
  className?: string;
}

const STRENGTH_LEVELS = [
  { max: 20, label: "Dormant", color: "var(--strength-dormant)" },
  { max: 40, label: "Acquaintance", color: "var(--strength-acquaintance)" },
  { max: 60, label: "Active", color: "var(--strength-active)" },
  { max: 80, label: "Strong", color: "var(--strength-strong)" },
  { max: 100, label: "Champion", color: "var(--strength-champion)" },
] as const;

function getStrengthLevel(score: number) {
  return STRENGTH_LEVELS.find((l) => score <= l.max) ?? STRENGTH_LEVELS[4];
}

export function StrengthMeter({ score, label, className }: StrengthMeterProps) {
  const level = getStrengthLevel(score);
  const displayLabel = label ?? level.label;
  const clampedScore = Math.max(0, Math.min(100, score));

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">
            {displayLabel}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {clampedScore}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${clampedScore}%`,
              backgroundColor: level.color,
            }}
          />
        </div>
      </div>
    </div>
  );
}
