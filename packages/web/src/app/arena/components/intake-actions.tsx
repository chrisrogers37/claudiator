"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";

interface IntakeActionsProps {
  candidateId: string;
  status: string;
}

export function IntakeActions({ candidateId, status }: IntakeActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  async function handleAction(action: string) {
    setLoading(true);
    setFeedback(null);
    clearTimeout(timerRef.current);
    try {
      let res: Response;
      if (action === "categorize") {
        res = await fetch(`/api/arena/intake/${candidateId}/categorize`, {
          method: "POST",
        });
      } else if (action === "score") {
        res = await fetch(`/api/arena/intake/${candidateId}/score`, {
          method: "POST",
        });
      } else {
        res = await fetch(`/api/arena/intake/${candidateId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "queued" }),
        });
      }
      setFeedback(res.ok ? "done" : "failed");
      timerRef.current = setTimeout(() => setFeedback(null), 2000);
      router.refresh();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
      setFeedback("failed");
      timerRef.current = setTimeout(() => setFeedback(null), 2000);
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
  };

  const btn = config[status];
  if (!btn) return null;

  return (
    <span className="inline-flex items-center gap-2">
      <button
        onClick={() => handleAction(btn.action)}
        disabled={loading}
        className="rounded border border-gray-700 bg-gray-800 px-2.5 py-1 font-mono text-xs text-gray-300 hover:bg-gray-700 hover:text-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "..." : btn.label}
      </button>
      {feedback && (
        <span
          className={`font-mono text-xs ${feedback === "done" ? "text-green-400" : "text-red-400"}`}
        >
          {feedback}
        </span>
      )}
    </span>
  );
}
