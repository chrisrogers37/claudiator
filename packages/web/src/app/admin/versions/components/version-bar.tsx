interface VersionSegment {
  version: string;
  count: number;
  isLatest: boolean;
}

interface VersionBarProps {
  segments: VersionSegment[];
}

export function VersionBar({ segments }: VersionBarProps) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return null;

  return (
    <div className="flex h-5 rounded overflow-hidden gap-px">
      {segments.map((seg) => {
        const pct = (seg.count / total) * 100;
        return (
          <div
            key={seg.version}
            className={`${seg.isLatest ? "bg-green-400" : "bg-gray-600"} relative group`}
            style={{ width: `${pct}%`, minWidth: pct > 0 ? "4px" : "0" }}
            title={`${seg.version}: ${seg.count} users (${Math.round(pct)}%)`}
          />
        );
      })}
    </div>
  );
}
