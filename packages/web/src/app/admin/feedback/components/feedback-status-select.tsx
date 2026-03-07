"use client";

import { useRouter } from "next/navigation";

interface FeedbackStatusSelectProps {
  feedbackId: string;
  currentStatus: string;
}

const statuses = ["new", "acknowledged", "in_progress", "resolved"] as const;

export function FeedbackStatusSelect({
  feedbackId,
  currentStatus,
}: FeedbackStatusSelectProps) {
  const router = useRouter();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    if (newStatus === currentStatus) return;

    await fetch(`/api/admin/feedback/${feedbackId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    router.refresh();
  }

  return (
    <select
      value={currentStatus}
      onChange={handleChange}
      className="bg-[#0d1117] border border-gray-700 rounded px-2 py-1 font-mono text-xs text-gray-300 focus:border-cyan-500 focus:outline-none"
    >
      {statuses.map((s) => (
        <option key={s} value={s}>
          {s.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}
