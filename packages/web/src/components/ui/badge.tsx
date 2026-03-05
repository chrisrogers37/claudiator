type BadgeVariant = "green" | "amber" | "red" | "cyan" | "muted";

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  green: "bg-green-400/10 text-green-400",
  amber: "bg-amber-400/10 text-amber-400",
  red: "bg-red-400/10 text-red-400",
  cyan: "bg-cyan-400/10 text-cyan-400",
  muted: "bg-gray-500/10 text-gray-500",
};

export function Badge({ label, variant = "muted" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wider ${variantClasses[variant]}`}
    >
      {label}
    </span>
  );
}
