import { cn } from "@/lib/utils";

interface AvatarInitialsProps {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-lg",
} as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function hashStringToHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function AvatarInitials({
  name,
  size = "md",
  className,
}: AvatarInitialsProps) {
  const initials = getInitials(name);
  const hue = hashStringToHue(name);

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white",
        sizeClasses[size],
        className
      )}
      style={{
        backgroundColor: `oklch(0.55 0.12 ${hue})`,
      }}
      aria-label={name}
    >
      {initials}
    </div>
  );
}
