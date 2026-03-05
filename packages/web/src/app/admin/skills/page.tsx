import { createDb } from "@claudefather/db/client";
import {
  skills,
  skillVersions,
  skillInvocations,
  skillFeedback,
} from "@claudefather/db/schema";
import { eq, and, gte, sql, count, avg } from "drizzle-orm";
import { SkillsTable } from "./skills-table";

const db = createDb(process.env.DATABASE_URL!);

export default async function SkillsPage() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const allSkills = await db
    .select()
    .from(skills);

  const enriched = await Promise.all(
    allSkills.map(async (skill) => {
      // Latest version
      const [latest] = await db
        .select({ version: skillVersions.version })
        .from(skillVersions)
        .where(
          and(
            eq(skillVersions.skillId, skill.id),
            eq(skillVersions.isLatest, true)
          )
        );

      // Invocation counts by time window (using skillSlug)
      const [inv7d] = await db
        .select({ cnt: count() })
        .from(skillInvocations)
        .where(
          and(
            eq(skillInvocations.skillSlug, skill.slug),
            gte(skillInvocations.invokedAt, sevenDaysAgo)
          )
        );

      const [inv30d] = await db
        .select({ cnt: count() })
        .from(skillInvocations)
        .where(
          and(
            eq(skillInvocations.skillSlug, skill.slug),
            gte(skillInvocations.invokedAt, thirtyDaysAgo)
          )
        );

      const [invTotal] = await db
        .select({ cnt: count() })
        .from(skillInvocations)
        .where(eq(skillInvocations.skillSlug, skill.slug));

      // Unique users
      const [users7d] = await db
        .select({
          cnt: sql<number>`count(distinct ${skillInvocations.userId})`,
        })
        .from(skillInvocations)
        .where(
          and(
            eq(skillInvocations.skillSlug, skill.slug),
            gte(skillInvocations.invokedAt, sevenDaysAgo)
          )
        );

      const [users30d] = await db
        .select({
          cnt: sql<number>`count(distinct ${skillInvocations.userId})`,
        })
        .from(skillInvocations)
        .where(
          and(
            eq(skillInvocations.skillSlug, skill.slug),
            gte(skillInvocations.invokedAt, thirtyDaysAgo)
          )
        );

      // Average rating
      const [rating] = await db
        .select({ avg: avg(skillFeedback.rating), cnt: count() })
        .from(skillFeedback)
        .where(eq(skillFeedback.skillSlug, skill.slug));

      const averageRating = rating?.avg ? Number(rating.avg) : null;
      const invocations30d = inv30d?.cnt ?? 0;

      return {
        id: skill.id,
        name: skill.name,
        slug: skill.slug,
        latestVersion: latest?.version ?? "—",
        invocations7d: inv7d?.cnt ?? 0,
        invocations30d,
        invocationsTotal: invTotal?.cnt ?? 0,
        uniqueUsers7d: Number(users7d?.cnt ?? 0),
        uniqueUsers30d: Number(users30d?.cnt ?? 0),
        averageRating,
        feedbackCount: rating?.cnt ?? 0,
        isDead: invocations30d === 0,
        isProblem: averageRating !== null && averageRating < 3.0,
      };
    })
  );

  const deadCount = enriched.filter((s) => s.isDead).length;
  const problemCount = enriched.filter((s) => s.isProblem).length;

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-2xl text-green-400">Skill Adoption</h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-800 bg-[#161b22] p-4">
          <div className="font-mono text-xs text-gray-500">Total Skills</div>
          <div className="font-mono text-2xl text-gray-200">
            {enriched.length}
          </div>
        </div>
        <div className="rounded-lg border border-red-900/50 bg-[#161b22] p-4">
          <div className="font-mono text-xs text-red-400">
            Dead (0 invocations 30d)
          </div>
          <div className="font-mono text-2xl text-red-400">{deadCount}</div>
        </div>
        <div className="rounded-lg border border-amber-900/50 bg-[#161b22] p-4">
          <div className="font-mono text-xs text-amber-400">
            Problem (rating &lt; 3.0)
          </div>
          <div className="font-mono text-2xl text-amber-400">
            {problemCount}
          </div>
        </div>
      </div>

      <SkillsTable skills={enriched} />
    </div>
  );
}
