import Link from "next/link";
import { createDb } from "@claudefather/db/client";
import { skillInvocations, skillFeedback } from "@claudefather/db/schema";
import { sql, eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RatingStars } from "@/components/ui/rating-stars";

const db = createDb(process.env.DATABASE_URL!);

interface SkillSidebarProps {
  slug: string;
  skill: {
    name: string;
    category: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

export async function SkillSidebar({ slug, skill }: SkillSidebarProps) {
  const [stats] = await db
    .select({
      totalInvocations: sql<number>`COALESCE(COUNT(${skillInvocations.id}), 0)::int`,
      weeklyInvocations: sql<number>`COALESCE(SUM(CASE WHEN ${skillInvocations.invokedAt} > NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END), 0)::int`,
    })
    .from(skillInvocations)
    .where(eq(skillInvocations.skillSlug, slug));

  const [feedbackStats] = await db
    .select({
      avgRating: sql<number | null>`AVG(${skillFeedback.rating})::numeric(3,1)`,
      feedbackCount: sql<number>`COUNT(${skillFeedback.id})::int`,
    })
    .from(skillFeedback)
    .where(eq(skillFeedback.skillSlug, slug));

  return (
    <div className="space-y-4">
      <Card variant="dashed">
        <h4 className="font-mono text-xs uppercase tracking-widest mb-3 text-gray-500">
          Statistics
        </h4>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">Total Uses</dt>
            <dd className="font-mono text-gray-200">
              {stats.totalInvocations}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">This Week</dt>
            <dd className="font-mono text-gray-200">
              {stats.weeklyInvocations}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Avg Rating</dt>
            <dd>
              {feedbackStats.avgRating ? (
                <RatingStars
                  rating={Number(feedbackStats.avgRating)}
                  size="sm"
                />
              ) : (
                <span className="text-gray-600">&mdash;</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Feedback</dt>
            <dd className="font-mono text-gray-200">
              {feedbackStats.feedbackCount}
            </dd>
          </div>
        </dl>
      </Card>

      <Card variant="dashed">
        <h4 className="font-mono text-xs uppercase tracking-widest mb-3 text-gray-500">
          Navigation
        </h4>
        <nav className="space-y-2">
          <Link
            href={`/workshop/skills/${slug}/history`}
            className="block px-3 py-2 rounded text-sm text-cyan-400 hover:bg-[#1c2333] transition-colors"
          >
            Version History
          </Link>
          <Link
            href={`/workshop/skills/${slug}/feedback`}
            className="block px-3 py-2 rounded text-sm text-cyan-400 hover:bg-[#1c2333] transition-colors"
          >
            Feedback ({feedbackStats.feedbackCount})
          </Link>
        </nav>
      </Card>

      <Card variant="dashed">
        <h4 className="font-mono text-xs uppercase tracking-widest mb-3 text-gray-500">
          Metadata
        </h4>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">Category</dt>
            <dd>
              <Badge label={skill.category} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Created</dt>
            <dd className="font-mono text-xs text-gray-500">
              {skill.createdAt.toLocaleDateString()}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Updated</dt>
            <dd className="font-mono text-xs text-gray-500">
              {skill.updatedAt.toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
