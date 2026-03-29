import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RatingStars } from "@/components/ui/rating-stars";

interface SkillCardProps {
  slug: string;
  name: string;
  description: string;
  category: string;
  currentVersion: string | null;
  totalInvocations: number;
  avgRating: number | null;
  feedbackCount: number;
}

export function SkillCard({
  slug,
  name,
  description,
  category,
  currentVersion,
  totalInvocations,
  avgRating,
  feedbackCount,
}: SkillCardProps) {
  return (
    <Link href={`/workshop/skills/${slug}`}>
      <Card variant="interactive">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-mono text-sm font-semibold text-cyan-400">
            /{name}
          </h3>
          {currentVersion && (
            <Badge label={`v${currentVersion}`} variant="muted" />
          )}
        </div>

        <p className="text-sm mb-3 line-clamp-2 text-gray-500">
          {description}
        </p>

        <div className="flex items-center justify-between">
          <Badge
            label={category}
            variant="muted"
          />
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-gray-600">
              {totalInvocations.toLocaleString()} uses
            </span>
            {avgRating !== null && (
              <RatingStars rating={avgRating} size="sm" />
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
