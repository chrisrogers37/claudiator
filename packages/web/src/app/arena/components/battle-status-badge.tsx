const statusStyles: Record<string, string> = {
  pending: "bg-gray-800 text-gray-400",
  running: "bg-cyan-900/40 text-cyan-400 animate-pulse",
  judging: "bg-amber-900/40 text-amber-400",
  complete: "bg-green-900/40 text-green-400",
  failed: "bg-red-900/40 text-red-400",
  cancelled: "bg-gray-800 text-gray-500",
};

export function BattleStatusBadge({ status }: { status: string }) {
  const style = statusStyles[status] || statusStyles.pending;
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 font-mono text-xs ${style}`}
    >
      {status}
    </span>
  );
}
