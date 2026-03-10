"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface IntakeActionsProps {
  candidateId: string;
  status: string;
}

export function IntakeActions({ candidateId, status }: IntakeActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAction(action: string) {
    setLoading(true);
    try {
      if (action === "categorize") {
        await fetch(`/api/arena/intake/${candidateId}/categorize`, {
          method: "POST",
        });
      } else if (action === "score") {
        await fetch(`/api/arena/intake/${candidateId}/score`, {
          method: "POST",
        });
      } else if (action === "queue") {
        await fetch(`/api/arena/intake/${candidateId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "queued" }),
        });
      } else if (action === "create-battle") {
        await fetch(`/api/arena/battles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidateId }),
        });
      }
      router.refresh();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    } finally {
      setLoading(false);
    }
  }

  if (
    status === "battling" ||
    status === "promoted" ||
    status === "rejected" ||
    status === "dismissed"
  ) {
    return null;
  }

  const config: Record<string, { label: string; action: string }> = {
    new: { label: "Categorize", action: "categorize" },
    categorized: { label: "Score", action: "score" },
    scored: { label: "Queue for Battle", action: "queue" },
    queued: { label: "Create Battle", action: "create-battle" },
  };

  const btn = config[status];
  if (!btn) return null;

  return (
    <button
      onClick={() => handleAction(btn.action)}
      disabled={loading}
      className="rounded border border-gray-700 bg-gray-800 px-2.5 py-1 font-mono text-xs text-gray-300 hover:bg-gray-700 hover:text-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? "..." : btn.label}
    </button>
  );
}
