import { cn } from "@/lib/utils";
import { Mic, Type, ScanLine, Globe, FormInput, Settings } from "lucide-react";

const METHOD_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  voice: { label: "Voice", color: "#D85A30", icon: Mic },
  text: { label: "Text", color: "#7F77DD", icon: Type },
  form: { label: "Form", color: "#378ADD", icon: FormInput },
  card_scan: { label: "Card Scan", color: "#1D9E75", icon: ScanLine },
  auto_scraper: { label: "Auto", color: "#888780", icon: Globe },
  system: { label: "System", color: "#888780", icon: Settings },
};

interface InputMethodBadgeProps {
  method: string | null | undefined;
  className?: string;
  showLabel?: boolean;
}

export function InputMethodBadge({
  method,
  className,
  showLabel = true,
}: InputMethodBadgeProps) {
  if (!method) return null;

  const config = METHOD_CONFIG[method] ?? {
    label: method,
    color: "#888780",
    icon: Settings,
  };
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
        className,
      )}
      style={{
        backgroundColor: `${config.color}18`,
        color: config.color,
        border: `1px solid ${config.color}30`,
      }}
    >
      <Icon className="h-3 w-3" />
      {showLabel && <span>{config.label}</span>}
    </span>
  );
}
