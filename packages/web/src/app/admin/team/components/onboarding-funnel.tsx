interface OnboardingFunnelProps {
  totalUsers: number;
  withToken: number;
  firstSync: number;
  active: number;
}

export function OnboardingFunnel({
  totalUsers,
  withToken,
  firstSync,
  active,
}: OnboardingFunnelProps) {
  const steps = [
    { label: "Registered", count: totalUsers },
    { label: "Token Generated", count: withToken },
    { label: "First Sync", count: firstSync },
    { label: "Active (7d)", count: active },
  ];

  const max = Math.max(totalUsers, 1);

  return (
    <div className="rounded-lg border border-gray-800 bg-[#161b22] p-4">
      <p className="font-mono text-xs text-gray-500 uppercase tracking-wider mb-3">
        Onboarding Funnel
      </p>
      <div className="space-y-2">
        {steps.map((step) => {
          const pct = Math.round((step.count / max) * 100);
          return (
            <div key={step.label} className="flex items-center gap-3">
              <span className="font-mono text-xs text-gray-400 w-28 shrink-0">
                {step.label}
              </span>
              <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-cyan-500/60 h-full rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="font-mono text-xs text-gray-400 w-16 text-right">
                {step.count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
