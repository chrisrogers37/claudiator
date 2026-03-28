import { createDb } from "@claudiator/db/client";
import {
  skillCategories,
  skills,
  arenaRankings,
  battles,
  intakeCandidates,
} from "@claudiator/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { FightCard } from "../../components/fight-card";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = createDb(process.env.DATABASE_URL!);

  // Load category by slug
  const [category] = await db
    .select()
    .from(skillCategories)
    .where(eq(skillCategories.slug, slug))
    .limit(1);

  if (!category) return notFound();

  // Load all skills in this category with their rankings
  const categorySkills = await db
    .select({
      skillId: skills.id,
      skillName: skills.name,
      skillSlug: skills.slug,
      skillDescription: skills.description,
      wins: arenaRankings.wins,
      losses: arenaRankings.losses,
      draws: arenaRankings.draws,
      winRate: arenaRankings.winRate,
      eloRating: arenaRankings.eloRating,
      title: arenaRankings.title,
      lastBattleAt: arenaRankings.lastBattleAt,
    })
    .from(skills)
    .leftJoin(arenaRankings, eq(arenaRankings.skillId, skills.id))
    .where(eq(skills.categoryId, category.id))
    .orderBy(desc(sql`coalesce(${arenaRankings.eloRating}, 0)`));

  // Recent battles involving skills in this category
  const categorySkillIds = categorySkills.map((s) => s.skillId);

  let recentBattles: {
    id: string;
    status: string;
    verdict: string | null;
    championName: string;
    challengerName: string;
    createdAt: Date;
  }[] = [];

  if (categorySkillIds.length > 0) {
    const rawBattles = await db
      .select({
        id: battles.id,
        status: battles.status,
        verdict: battles.verdict,
        createdAt: battles.createdAt,
        championName: skills.name,
        challengerRawContent: intakeCandidates.rawContent,
        challengerPurpose: intakeCandidates.extractedPurpose,
        challengerSourceType: intakeCandidates.sourceType,
      })
      .from(battles)
      .innerJoin(skills, eq(battles.championSkillId, skills.id))
      .innerJoin(
        intakeCandidates,
        eq(battles.challengerId, intakeCandidates.id)
      )
      .where(
        sql`${battles.championSkillId} in ${categorySkillIds}`
      )
      .orderBy(desc(battles.createdAt))
      .limit(10);

    recentBattles = rawBattles.map((b) => {
      const nameMatch = b.challengerRawContent.match(
        /^name:\s*["']?(.+?)["']?\s*$/m
      );
      return {
        id: b.id,
        status: b.status,
        verdict: b.verdict,
        createdAt: b.createdAt,
        championName: b.championName,
        challengerName:
          nameMatch?.[1] ||
          b.challengerPurpose?.slice(0, 40) ||
          b.challengerSourceType,
      };
    });
  }

  return (
    <>
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/arena/categories"
          className="font-mono text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          &larr; Back to Categories
        </Link>
      </div>

      {/* Category Header */}
      <div className="rounded-lg border border-gray-800 bg-[#161b22] p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="rounded bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 font-mono text-xs text-yellow-500 uppercase tracking-wider">
            {category.domain}
          </span>
          <span className="font-mono text-sm text-gray-600">/</span>
          <span className="rounded bg-gray-800 border border-gray-700 px-2 py-0.5 font-mono text-xs text-gray-400 uppercase tracking-wider">
            {category.function}
          </span>
        </div>
        {category.description && (
          <p className="font-mono text-sm text-gray-400 mb-3">
            {category.description}
          </p>
        )}
        <p className="font-mono text-xs text-gray-500">
          {category.skillCount} skill{category.skillCount !== 1 ? "s" : ""}{" "}
          registered
        </p>
      </div>

      {/* Skill Leaderboard */}
      <h2 className="font-mono text-xs text-gray-500 uppercase tracking-wider mb-3">
        Skill Leaderboard
      </h2>

      <div className="rounded-lg border border-gray-800 bg-[#161b22] overflow-x-auto mb-8">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {["#", "Skill", "Title", "ELO", "W", "L", "D", "Win %"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left font-mono text-xs text-gray-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {categorySkills.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center font-mono text-sm text-gray-500"
                >
                  No skills in this category yet.
                </td>
              </tr>
            ) : (
              categorySkills.map((s, i) => {
                const rank = i + 1;
                const hasRanking = s.eloRating != null;
                const isUndefeated =
                  hasRanking && s.losses === 0 && (s.wins ?? 0) > 0;
                const totalGames =
                  (s.wins ?? 0) + (s.losses ?? 0) + (s.draws ?? 0);
                return (
                  <tr
                    key={s.skillId}
                    className="border-b border-gray-800/50 hover:bg-gray-800/20"
                  >
                    <td className="px-4 py-3 font-mono text-sm text-gray-400">
                      {rank}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/workshop/skills/${s.skillSlug}`}
                          className="font-mono text-sm text-cyan-400 hover:underline"
                        >
                          {s.skillName}
                        </Link>
                        {isUndefeated && (
                          <span className="rounded bg-yellow-500/10 border border-yellow-500/30 px-1.5 py-0.5 font-mono text-[10px] text-yellow-500 uppercase">
                            undefeated
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">
                      {s.title || "--"}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-200">
                      {hasRanking ? Math.round(s.eloRating!) : "--"}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-green-400">
                      {s.wins ?? 0}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-red-400">
                      {s.losses ?? 0}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-400">
                      {s.draws ?? 0}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-200">
                      {totalGames > 0
                        ? `${((s.winRate ?? 0) * 100).toFixed(0)}%`
                        : "--"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Recent Battles */}
      <h2 className="font-mono text-xs text-gray-500 uppercase tracking-wider mb-3">
        Recent Battles
      </h2>

      {recentBattles.length === 0 ? (
        <p className="font-mono text-sm text-gray-500">
          No battles in this category yet.
        </p>
      ) : (
        <div className="space-y-2">
          {recentBattles.map((battle) => (
            <FightCard
              key={battle.id}
              id={battle.id}
              championName={battle.championName}
              challengerName={battle.challengerName}
              status={battle.status}
              verdict={battle.verdict}
              compact
            />
          ))}
        </div>
      )}
    </>
  );
}
