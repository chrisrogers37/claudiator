import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface LearningCardProps {
  learning: {
    id: string;
    title: string;
    summary: string;
    sourceType: string;
    sourceUrl: string | null;
    relevanceTags: string[] | null;
    distilledAt: Date;
    status: string;
    affectedSkillCount: number;
  };
}

const sourceIcons: Record<string, string> = {
  blog: "📝",
  docs: "📚",
  changelog: "📋",
  community: "💬",
};

const statusVariant: Record<string, "green" | "amber" | "cyan" | "muted"> = {
  new: "cyan",
  reviewed: "amber",
  applied: "green",
  dismissed: "muted",
};

export function LearningCard({ learning }: LearningCardProps) {
  const tags = learning.relevanceTags ?? [];

  return (
    <Link href={`/workshop/learnings/${learning.id}`}>
      <Card variant="interactive">
        {/* Header: source icon + type badge + status */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {sourceIcons[learning.sourceType] || "📄"}
            </span>
            <Badge label={learning.sourceType} />
          </div>
          <Badge
            label={learning.status}
            variant={statusVariant[learning.status] || "muted"}
          />
        </div>

        {/* Title */}
        <h3 className="font-mono text-sm font-semibold text-gray-200 mb-1">
          {learning.title}
        </h3>

        {/* Summary — truncated */}
        <p className="text-xs text-gray-500 line-clamp-3 mb-3">
          {learning.summary}
        </p>

        {/* Footer: tags + affected skills count */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 flex-wrap">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 rounded bg-cyan-400/5 text-cyan-400"
              >
                {tag}
              </span>
            ))}
          </div>
          {learning.affectedSkillCount > 0 && (
            <span className="text-xs font-mono text-amber-400">
              {learning.affectedSkillCount} skill
              {learning.affectedSkillCount > 1 ? "s" : ""} affected
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
