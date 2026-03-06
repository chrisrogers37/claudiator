"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ProposedChangeCardProps {
  linkId: string;
  skillSlug: string;
  skillName: string;
  proposedChange: string | null;
  status: string;
  learningId: string;
}

export function ProposedChangeCard({
  linkId,
  skillSlug,
  skillName,
  proposedChange,
  status,
  learningId,
}: ProposedChangeCardProps) {
  const router = useRouter();

  async function updateStatus(action: "applied" | "rejected") {
    await fetch(`/api/learnings/${learningId}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillSlug, action }),
    });
    router.refresh();
  }

  return (
    <Card variant="dashed">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm text-cyan-400">/{skillName}</span>
        <Badge
          label={status}
          variant={
            status === "applied"
              ? "green"
              : status === "rejected"
                ? "red"
                : "amber"
          }
        />
      </div>

      {proposedChange && (
        <p className="text-sm text-gray-500 mb-3">{proposedChange}</p>
      )}

      {status === "pending" && (
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              router.push(
                `/workshop/skills/${skillSlug}?applyLearning=${linkId}`
              )
            }
            className="px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider bg-amber-400/15 text-amber-400 border border-amber-400 hover:bg-amber-400/25 transition-colors"
          >
            Apply to Skill Editor
          </button>
          <button
            onClick={() => updateStatus("rejected")}
            className="px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 transition-colors"
          >
            Reject
          </button>
        </div>
      )}
    </Card>
  );
}
