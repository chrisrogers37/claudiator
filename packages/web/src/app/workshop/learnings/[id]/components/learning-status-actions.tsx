"use client";

import { useRouter } from "next/navigation";

interface LearningStatusActionsProps {
  id: string;
  currentStatus: string;
}

export function LearningStatusActions({
  id,
  currentStatus,
}: LearningStatusActionsProps) {
  const router = useRouter();

  async function updateStatus(newStatus: string) {
    await fetch(`/api/learnings/${id}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    router.refresh();
  }

  if (currentStatus === "applied" || currentStatus === "dismissed") {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {currentStatus === "new" && (
        <button
          onClick={() => updateStatus("reviewed")}
          className="px-2 py-1 rounded text-xs font-mono text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 transition-colors"
        >
          Mark Reviewed
        </button>
      )}
      <button
        onClick={() => updateStatus("dismissed")}
        className="px-2 py-1 rounded text-xs font-mono text-gray-500 hover:text-gray-300 transition-colors"
      >
        Dismiss
      </button>
    </div>
  );
}
