interface RatingDistributionProps {
  distribution: { rating: number; count: number }[];
}

const barColors = ["#ff4444", "#ff8844", "#d4a017", "#88cc44", "#00ff41"];

export function RatingDistribution({ distribution }: RatingDistributionProps) {
  const data = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: distribution.find((d) => d.rating === rating)?.count || 0,
  }));
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="rounded-lg p-4 bg-[#161b22] border border-dashed border-gray-700">
      <h4 className="font-mono text-xs uppercase tracking-widest mb-4 text-gray-500">
        Rating Distribution
      </h4>
      <div className="space-y-2">
        {data.map((d, idx) => (
          <div key={d.rating} className="flex items-center gap-3">
            <span className="font-mono text-xs w-14 text-right text-gray-500">
              {d.rating} star{d.rating > 1 ? "s" : ""}
            </span>
            <div className="flex-1 h-5 rounded bg-[#0d1117]">
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${(d.count / maxCount) * 100}%`,
                  backgroundColor: barColors[idx],
                  minWidth: d.count > 0 ? "4px" : "0",
                }}
              />
            </div>
            <span className="font-mono text-xs w-8 text-gray-600">
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
