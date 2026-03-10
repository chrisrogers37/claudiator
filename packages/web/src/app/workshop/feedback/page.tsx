import Link from "next/link";
import { createDb } from "@claudiator/db/client";
import { skills, skillFeedback } from "@claudiator/db/schema";
import { sql, desc, asc } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RatingStars } from "@/components/ui/rating-stars";

const db = createDb(process.env.DATABASE_URL!);

export default async function FeedbackOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const sortOrder = sort === "count" ? "count" : sort === "skill" ? "skill" : "rating";

  const skillFeedbackList = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      category: skills.category,
      avgRating: sql<number>`AVG(${skillFeedback.rating})::numeric(3,1)`,
      feedbackCount: sql<number>`COUNT(${skillFeedback.id})::int`,
      latestFeedback: sql<Date>`MAX(${skillFeedback.createdAt})`,
    })
    .from(skills)
    .innerJoin(skillFeedback, sql`${skills.slug} = ${skillFeedback.skillSlug}`)
    .groupBy(skills.slug, skills.name, skills.category)
    .orderBy(
      sortOrder === "count"
        ? desc(sql`COUNT(${skillFeedback.id})`)
        : sortOrder === "skill"
          ? asc(skills.name)
          : asc(sql`AVG(${skillFeedback.rating})`)
    );

  return (
    <>
      <SectionHeader
        title="FEEDBACK TRIAGE"
        subtitle="All skills with feedback, sorted by worst ratings first"
        action={
          <Link
            href="/workshop"
            className="font-mono text-xs text-cyan-400 hover:text-cyan-300"
          >
            &larr; Workshop
          </Link>
        }
      />

      <div className="flex items-center gap-2 mb-6">
        <span className="font-mono text-xs text-gray-600">Sort:</span>
        {[
          { value: "rating", label: "Worst first" },
          { value: "count", label: "Most feedback" },
          { value: "skill", label: "Skill name" },
        ].map((opt) => (
          <Link
            key={opt.value}
            href={opt.value === "rating" ? "/workshop/feedback" : `/workshop/feedback?sort=${opt.value}`}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              sortOrder === opt.value
                ? "bg-cyan-500/10 text-cyan-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {skillFeedbackList.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <p className="font-mono text-sm">No feedback received yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {skillFeedbackList.map((sf) => (
            <Link key={sf.slug} href={`/workshop/skills/${sf.slug}/feedback`}>
              <Card variant="interactive">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-cyan-400">
                      /{sf.name}
                    </span>
                    <Badge label={sf.category} />
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-gray-600">
                      {sf.feedbackCount} responses
                    </span>
                    <RatingStars
                      rating={Number(sf.avgRating)}
                      size="sm"
                      showValue
                    />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
