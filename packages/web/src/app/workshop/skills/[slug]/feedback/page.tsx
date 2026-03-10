import { notFound } from "next/navigation";
import Link from "next/link";
import { createDb } from "@claudiator/db/client";
import { skills, skillFeedback } from "@claudiator/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { RatingDistribution } from "./components/rating-distribution";
import { FeedbackList } from "./components/feedback-list";
import { FeedbackSortControls } from "./components/feedback-sort-controls";

const db = createDb(process.env.DATABASE_URL!);

export default async function SkillFeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const { slug } = await params;
  const { sort } = await searchParams;

  const skill = await db.query.skills.findFirst({
    where: eq(skills.slug, slug),
  });
  if (!skill) notFound();

  const distribution = await db
    .select({
      rating: skillFeedback.rating,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(skillFeedback)
    .where(eq(skillFeedback.skillSlug, slug))
    .groupBy(skillFeedback.rating)
    .orderBy(asc(skillFeedback.rating));

  const sortColumn =
    sort === "rating"
      ? desc(skillFeedback.rating)
      : desc(skillFeedback.createdAt);

  const entries = await db
    .select()
    .from(skillFeedback)
    .where(eq(skillFeedback.skillSlug, slug))
    .orderBy(sortColumn);

  return (
    <>
      <SectionHeader
        title={`FEEDBACK: ${skill.name.toUpperCase()}`}
        subtitle={`${entries.length} responses`}
        action={
          <Link
            href={`/workshop/skills/${slug}`}
            className="font-mono text-xs text-cyan-400 hover:text-cyan-300"
          >
            &larr; Back to skill
          </Link>
        }
      />

      <div className="mb-8">
        <RatingDistribution distribution={distribution} />
      </div>

      <FeedbackSortControls currentSort={sort || "date"} />

      <FeedbackList entries={entries} />
    </>
  );
}
