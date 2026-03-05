import { createDb } from "@claudefather/db/client";
import {
  skills,
  skillVersions,
  skillInvocations,
  skillFeedback,
} from "@claudefather/db/schema";
import { sql, asc, desc, SQL } from "drizzle-orm";
import { SkillCard } from "./skill-card";

const db = createDb(process.env.DATABASE_URL!);

interface SkillGridProps {
  category?: string;
  sort: string;
  search?: string;
}

export async function SkillGrid({ category, sort, search }: SkillGridProps) {
  const conditions: SQL[] = [];
  if (category) {
    conditions.push(sql`${skills.category} = ${category}`);
  }
  if (search) {
    conditions.push(
      sql`(${skills.name} ILIKE ${"%" + search + "%"} OR ${skills.description} ILIKE ${"%" + search + "%"})`
    );
  }

  const whereClause =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : sql.join(conditions, sql` AND `);

  const results = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      description: skills.description,
      category: skills.category,
      currentVersion: sql<string | null>`(
        SELECT ${skillVersions.version}
        FROM ${skillVersions}
        WHERE ${skillVersions.skillId} = ${skills.id}
          AND ${skillVersions.isLatest} = true
        LIMIT 1
      )`,
      totalInvocations: sql<number>`COALESCE((
        SELECT COUNT(*)
        FROM ${skillInvocations}
        WHERE ${skillInvocations.skillSlug} = ${skills.slug}
      ), 0)::int`,
      avgRating: sql<number | null>`(
        SELECT AVG(${skillFeedback.rating})::numeric(3,1)
        FROM ${skillFeedback}
        WHERE ${skillFeedback.skillSlug} = ${skills.slug}
      )`,
      feedbackCount: sql<number>`COALESCE((
        SELECT COUNT(*)
        FROM ${skillFeedback}
        WHERE ${skillFeedback.skillSlug} = ${skills.slug}
      ), 0)::int`,
    })
    .from(skills)
    .where(whereClause)
    .orderBy(
      sort === "usage"
        ? desc(
            sql`COALESCE((SELECT COUNT(*) FROM ${skillInvocations} WHERE ${skillInvocations.skillSlug} = ${skills.slug}), 0)`
          )
        : sort === "rating"
          ? desc(
              sql`(SELECT AVG(${skillFeedback.rating}) FROM ${skillFeedback} WHERE ${skillFeedback.skillSlug} = ${skills.slug})`
            )
          : sort === "updated"
            ? desc(skills.updatedAt)
            : asc(skills.name)
    );

  if (results.length === 0) {
    return (
      <div className="text-center py-12 text-gray-600">
        <p className="font-mono">No skills found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {results.map((skill) => (
        <SkillCard
          key={skill.slug}
          slug={skill.slug}
          name={skill.name}
          description={skill.description}
          category={skill.category}
          currentVersion={skill.currentVersion}
          totalInvocations={skill.totalInvocations}
          avgRating={skill.avgRating ? Number(skill.avgRating) : null}
          feedbackCount={skill.feedbackCount}
        />
      ))}
    </div>
  );
}
