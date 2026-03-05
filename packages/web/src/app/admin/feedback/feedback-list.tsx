"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

interface FeedbackItem {
  id: string;
  skillSlug: string;
  skillName: string;
  githubUsername: string;
  rating: number;
  comment: string | null;
  status: string;
  resolvedByVersion: string | null;
  createdAt: string;
}

const STATUS_OPTIONS = ["new", "acknowledged", "in_progress", "resolved"] as const;

const STATUS_STYLES: Record<string, string> = {
  new: "bg-cyan-900/30 text-cyan-400",
  acknowledged: "bg-amber-900/30 text-amber-400",
  in_progress: "bg-purple-900/30 text-purple-400",
  resolved: "bg-green-900/30 text-green-400",
};

export function FeedbackList({ feedback }: { feedback: FeedbackItem[] }) {
  const router = useRouter();
  const [filterStatus, setFilterStatus] = useState("");
  const [sortBy, setSortBy] = useState<"createdAt" | "rating">("createdAt");

  const filtered = useMemo(() => {
    let items = feedback;
    if (filterStatus) {
      items = items.filter((f) => f.status === filterStatus);
    }
    if (sortBy === "rating") {
      items = [...items].sort((a, b) => a.rating - b.rating);
    }
    return items;
  }, [feedback, filterStatus, sortBy]);

  async function updateStatus(feedbackId: string, newStatus: string) {
    await fetch(`/api/admin/feedback/${feedbackId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    router.refresh();
  }

  return (
    <>
      <div className="flex gap-4">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded border border-gray-700 bg-[#161b22] px-3 py-1.5 font-mono text-sm text-gray-300"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ")}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "createdAt" | "rating")}
          className="rounded border border-gray-700 bg-[#161b22] px-3 py-1.5 font-mono text-sm text-gray-300"
        >
          <option value="createdAt">Most recent</option>
          <option value="rating">Worst rated</option>
        </select>
      </div>

      <div className="space-y-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-gray-800 bg-[#161b22] p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-gray-200">
                    {item.skillName}
                  </span>
                  <span className="font-mono text-xs text-gray-500">
                    {"\u2605".repeat(item.rating)}
                    {"\u2606".repeat(5 - item.rating)}
                  </span>
                </div>
                {item.comment && (
                  <p className="mt-1 text-sm text-gray-400">{item.comment}</p>
                )}
                <p className="mt-1 font-mono text-xs text-gray-600">
                  {item.githubUsername} &middot;{" "}
                  {new Date(item.createdAt).toLocaleDateString()}
                  {item.resolvedByVersion && (
                    <> &middot; Resolved in v{item.resolvedByVersion}</>
                  )}
                </p>
              </div>
              <select
                value={item.status}
                onChange={(e) => updateStatus(item.id, e.target.value)}
                className={`rounded px-2 py-1 font-mono text-xs ${STATUS_STYLES[item.status] ?? ""}`}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center font-mono text-sm text-gray-500">
            No feedback matching filters.
          </p>
        )}
      </div>
    </>
  );
}
