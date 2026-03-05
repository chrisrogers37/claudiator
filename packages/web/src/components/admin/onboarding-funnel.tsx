interface FunnelData {
  registered: number;
  tokenGenerated: number;
  firstSync: number;
  fullyOnboarded: number;
}

export function OnboardingFunnel({ funnel }: { funnel: FunnelData }) {
  const steps = [
    { label: "Registered", count: funnel.registered },
    { label: "Token generated", count: funnel.tokenGenerated },
    { label: "First sync", count: funnel.firstSync },
    { label: "Fully onboarded", count: funnel.fullyOnboarded },
  ];

  const maxCount = Math.max(funnel.registered, 1);

  return (
    <div className="rounded-lg border border-gray-800 bg-[#161b22] p-4">
      <h3 className="mb-3 font-mono text-sm text-gray-400">
        Onboarding Funnel
      </h3>
      <div className="space-y-2">
        {steps.map((step, idx) => {
          const widthPercent = (step.count / maxCount) * 100;
          return (
            <div key={idx} className="flex items-center gap-3">
              <div className="w-36 font-mono text-xs text-gray-500">
                {step.label}
              </div>
              <div className="flex-1">
                <div
                  className="h-5 rounded bg-green-600 transition-all"
                  style={{
                    width: `${widthPercent}%`,
                    minWidth: step.count > 0 ? "1.5rem" : "0",
                  }}
                />
              </div>
              <div className="w-8 text-right font-mono text-sm text-gray-300">
                {step.count}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
