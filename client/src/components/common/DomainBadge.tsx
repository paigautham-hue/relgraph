import { Badge } from "@/components/ui/badge";

interface DomainBadgeProps {
  name: string;
  color: string;
  className?: string;
}

export function DomainBadge({ name, color, className }: DomainBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={className}
      style={{
        borderColor: color,
        color: color,
        backgroundColor: `${color}12`,
      }}
    >
      <span
        className="mr-1.5 inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </Badge>
  );
}
