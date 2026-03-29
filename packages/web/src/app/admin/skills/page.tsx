import Link from "next/link";
import { createDb } from "@claudiator/db/client";
import { skills, skillInvocations, skillFeedback, skillCategories } from "@claudiator/db/schema";
import { sql, desc, asc, eq } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "../components/stat-card";

const db = createDb(process.env.DATABASE_URL!);

export default async function SkillAdoptionPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const sortKey =
    sort === "users" ? "users" : sort === "rating" ? "rating" : sort === "name" ? "name" : "invocations";

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const skillMetrics = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      categoryDomain: skillCategories.domain,
      categoryFunction: skillCategories.function,
      invocations7d: sql<number>`COALESCE((
        SELECT COUNT(*) FROM skill_invocations
        WHERE skill_slug = ${skills.slug} AND invoked_at >= ${d7.toISOString()}
      ), 0)::int`,
      invocations30d: sql<number>`COALESCE((
        SELECT COUNT(*) FROM skill_invocations
        WHERE skill_slug = ${skills.slug} AND invoked_at >= ${d30.toISOString()}
      ), 0)::int`,
      invocationsTotal: sql<number>`COALESCE((
        SELECT COUNT(*) FROM skill_invocations
        WHERE skill_slug = ${skills.slug}
      ), 0)::int`,
      uniqueUsers7d: sql<number>`COALESCE((
        SELECT COUNT(DISTINCT user_id) FROM skill_invocations
        WHERE skill_slug = ${skills.slug} AND invoked_at >= ${d7.toISOString()}
      ), 0)::int`,
      uniqueUsers30d: sql<number>`COALESCE((
        SELECT COUNT(DISTINCT user_id) FROM skill_invocations
        WHERE skill_slug = ${skills.slug} AND invoked_at >= ${d30.toISOString()}
      ), 0)::int`,
      avgRating: sql<number | null>`(
        SELECT AVG(rating)::numeric(3,1) FROM skill_feedback
        WHERE skill_slug = ${skills.slug}
      )`,
      feedbackCount: sql<number>`COALESCE((
        SELECT COUNT(*) FROM skill_feedback
        WHERE skill_slug = ${skills.slug}
      ), 0)::int`,
    })
    .from(skills)
    .leftJoin(skillCategories, eq(skills.categoryId, skillCategories.id))
    .orderBy(
      sortKey === "users"
        ? desc(sql`(SELECT COUNT(DISTINCT user_id) FROM skill_invocations WHERE skill_slug = ${skills.slug} AND invoked_at >= ${d30.toISOString()})`)
        : sortKey === "rating"
          ? asc(sql`(SELECT AVG(rating) FROM skill_feedback WHERE skill_slug = ${skills.slug})`)
          : sortKey === "name"
            ? asc(skills.name)
            : desc(sql`(SELECT COUNT(*) FROM skill_invocations WHERE skill_slug = ${skills.slug})`)
    );

  const totalSkills = skillMetrics.length;
  const deadSkills = skillMetrics.filter((s) => s.invocations30d === 0).length;
  const problemSkills = skillMetrics.filter(
    (s) => s.avgRating !== null && Number(s.avgRating) < 3.0
  ).length;

  return (
    <>
      <SectionHeader
        title="SKILL ADOPTION"
        subtitle="Usage metrics and health indicators for all registered skills"
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Skills" value={totalSkills} />
        <StatCard
          label="Dead (0 inv 30d)"
          value={deadSkills}
          variant={deadSkills > 0 ? "red" : "default"}
        />
        <StatCard
          label="Problem (< 3.0)"
          value={problemSkills}
          variant={problemSkills > 0 ? "amber" : "default"}
        />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="font-mono text-xs text-gray-600">Sort:</span>
        {[
          { value: "invocations", label: "Most used" },
          { value: "users", label: "Most users" },
          { value: "rating", label: "Worst rated" },
          { value: "name", label: "Name" },
        ].map((opt) => (
          <Link
            key={opt.value}
            href={
              opt.value === "invocations"
                ? "/admin/skills"
                : `/admin/skills?sort=${opt.value}`
            }
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              sortKey === opt.value
                ? "bg-cyan-500/10 text-cyan-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {skillMetrics.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <p className="font-mono text-sm">No skills registered yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {skillMetrics.map((skill) => {
            const isDead = skill.invocations30d === 0;
            const isProblem =
              skill.avgRating !== null && Number(skill.avgRating) < 3.0;
            return (
              <Card key={skill.slug}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-cyan-400">
                      /{skill.name}
                    </span>
                    <Badge label={skill.categoryDomain && skill.categoryFunction ? `${skill.categoryDomain}/${skill.categoryFunction}` : "uncategorized"} />
                    {isDead && <Badge label="dead" variant="red" />}
                    {isProblem && <Badge label="low rating" variant="amber" />}
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-mono text-xs text-gray-500">7d / 30d / total</p>
                      <p className="font-mono text-sm text-gray-300">
                        {skill.invocations7d} / {skill.invocations30d} / {skill.invocationsTotal}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs text-gray-500">users 30d</p>
                      <p className="font-mono text-sm text-gray-300">
                        {skill.uniqueUsers30d}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs text-gray-500">rating</p>
                      <p
                        className={`font-mono text-sm ${
                          isProblem ? "text-amber-400" : "text-gray-300"
                        }`}
                      >
                        {skill.avgRating !== null
                          ? Number(skill.avgRating).toFixed(1)
                          : "—"}
                        {skill.feedbackCount > 0 && (
                          <span className="text-gray-600 text-xs ml-1">
                            ({skill.feedbackCount})
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
