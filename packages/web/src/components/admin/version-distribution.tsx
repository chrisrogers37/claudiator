interface Distribution {
  version: string;
  userCount: number;
  isLatest: boolean;
}

export function VersionDistribution({
  distribution,
}: {
  distribution: Distribution[];
}) {
  const maxCount = Math.max(...distribution.map((d) => d.userCount), 1);

  const sorted = [...distribution].sort((a, b) => {
    if (a.isLatest) return -1;
    if (b.isLatest) return 1;
    return b.version.localeCompare(a.version, undefined, { numeric: true });
  });

  return (
    <div className="mt-3 space-y-1">
      {sorted.map((d) => {
        const widthPercent = (d.userCount / maxCount) * 100;
        return (
          <div
            key={d.version}
            className="flex items-center gap-2 font-mono text-xs"
          >
            <span className="w-16 text-right text-gray-500">
              v{d.version}
              {d.isLatest && " \u2713"}
            </span>
            <div className="flex-1">
              <div
                className={`h-4 rounded ${d.isLatest ? "bg-green-600" : "bg-gray-700"}`}
                style={{
                  width: `${widthPercent}%`,
                  minWidth: d.userCount > 0 ? "0.75rem" : "0",
                }}
              />
            </div>
            <span className="w-6 text-gray-500">{d.userCount}</span>
          </div>
        );
      })}
    </div>
  );
}
