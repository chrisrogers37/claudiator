import Link from "next/link";

const STATUSES = [
  { value: "", label: "All", style: "text-gray-400" },
  { value: "new", label: "New", style: "text-gray-400" },
  { value: "categorized", label: "Categorized", style: "text-amber-400" },
  { value: "scored", label: "Scored", style: "text-cyan-400" },
  { value: "queued", label: "Queued", style: "text-green-400" },
  { value: "battling", label: "Battling", style: "text-cyan-400" },
  { value: "promoted", label: "Promoted", style: "text-green-400" },
  { value: "rejected", label: "Rejected", style: "text-red-400" },
];

interface IntakeStatusFilterProps {
  currentStatus: string;
}

export function IntakeStatusFilter({ currentStatus }: IntakeStatusFilterProps) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STATUSES.map((s) => {
        const isActive = currentStatus === s.value;
        const href = s.value
          ? `/arena/intake?status=${s.value}&page=1`
          : "/arena/intake";
        return (
          <Link
            key={s.value}
            href={href}
            className={`px-2.5 py-1 rounded font-mono text-xs transition-all border ${
              isActive
                ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-500"
                : `border-transparent hover:border-gray-700 hover:bg-gray-800/50 ${s.style}`
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
