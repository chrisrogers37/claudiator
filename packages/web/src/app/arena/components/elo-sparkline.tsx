interface EloSparklineProps {
  history: { eloAfter: number; outcome: string }[];
  width?: number;
  height?: number;
}

export function EloSparkline({ history, width = 80, height = 24 }: EloSparklineProps) {
  if (history.length < 2) return null;

  const values = history.map(h => h.eloAfter);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");

  const trending = values[values.length - 1] >= values[0];

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <polyline
        points={points}
        fill="none"
        stroke={trending ? "#4ade80" : "#f87171"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
