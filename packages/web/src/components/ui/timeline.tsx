import { ReactNode } from "react";

interface TimelineEntry {
  id: string;
  label: string;
  timestamp: string;
  description?: string;
  isActive?: boolean;
  actions?: ReactNode;
}

interface TimelineProps {
  entries: TimelineEntry[];
}

export function Timeline({ entries }: TimelineProps) {
  return (
    <div className="relative">
      <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-800" />

      <div className="space-y-4">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-4 relative">
            <div
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 flex-shrink-0 ${
                entry.isActive
                  ? "border-green-400 bg-green-400/10"
                  : "border-gray-700 bg-[#0d1117]"
              }`}
            >
              {entry.isActive && (
                <div className="w-2 h-2 rounded-full bg-green-400" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-gray-200">
                  {entry.label}
                </span>
                <span className="text-xs text-gray-600">{entry.timestamp}</span>
              </div>
              {entry.description && (
                <p className="text-sm mt-1 text-gray-500">
                  {entry.description}
                </p>
              )}
              {entry.actions && <div className="mt-2">{entry.actions}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
