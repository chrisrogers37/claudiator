interface StatCardProps {
  label: string;
  value: string | number;
  variant?: "default" | "red" | "amber" | "green";
}

const variantClasses: Record<string, string> = {
  default: "text-gray-200",
  red: "text-red-400",
  amber: "text-amber-400",
  green: "text-green-400",
};

export function StatCard({
  label,
  value,
  variant = "default",
}: StatCardProps) {
  return (
    <div className="rounded-lg border border-gray-800 bg-[#161b22] p-4">
      <p className="font-mono text-xs text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <p className={`font-mono text-2xl mt-1 ${variantClasses[variant]}`}>
        {value}
      </p>
    </div>
  );
}
