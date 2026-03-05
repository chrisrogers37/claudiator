const STATUS_STYLES: Record<string, string> = {
  current: "bg-green-900/30 text-green-400",
  stale: "bg-amber-900/30 text-amber-400",
  critical: "bg-red-900/30 text-red-400",
  never: "bg-gray-800 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  current: "Current",
  stale: ">7 days",
  critical: ">30 days",
  never: "Never synced",
};

export function SyncStatusBadge({
  status,
  date,
}: {
  status: string;
  date: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`rounded-full px-2 py-0.5 font-mono text-xs ${STATUS_STYLES[status] ?? STATUS_STYLES.never}`}
      >
        {STATUS_LABELS[status] ?? status}
      </span>
      {date && (
        <span className="text-xs text-gray-500">
          {new Date(date).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}
