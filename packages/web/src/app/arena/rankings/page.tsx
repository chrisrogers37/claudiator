import { createDb } from "@claudiator/db/client";
import { arenaRankings, skills, skillCategories } from "@claudiator/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";

export default async function RankingsPage() {
  const db = createDb(process.env.DATABASE_URL!);

  const rankings = await db
    .select({
      id: arenaRankings.id,
      skillId: arenaRankings.skillId,
      categoryDomain: skillCategories.domain,
      categoryFunction: skillCategories.function,
      wins: arenaRankings.wins,
      losses: arenaRankings.losses,
      draws: arenaRankings.draws,
      winRate: arenaRankings.winRate,
      eloRating: arenaRankings.eloRating,
      title: arenaRankings.title,
      lastBattleAt: arenaRankings.lastBattleAt,
      skillName: skills.name,
      skillSlug: skills.slug,
    })
    .from(arenaRankings)
    .innerJoin(skills, eq(arenaRankings.skillId, skills.id))
    .leftJoin(skillCategories, eq(arenaRankings.categoryId, skillCategories.id))
    .orderBy(desc(arenaRankings.eloRating));

  return (
    <>
      <h1 className="font-mono text-2xl text-yellow-500 mb-6">Rankings</h1>

      <div className="rounded-lg border border-gray-800 bg-[#161b22] overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {[
                "#",
                "Skill",
                "Title",
                "ELO",
                "W",
                "L",
                "D",
                "Win %",
                "Last Battle",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-mono text-xs text-gray-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rankings.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-8 text-center font-mono text-sm text-gray-500"
                >
                  No rankings yet. Complete some battles first.
                </td>
              </tr>
            ) : (
              rankings.map((r, i) => {
                const rank = i + 1;
                const isUndefeated = r.losses === 0 && r.wins > 0;
                const totalGames = r.wins + r.losses + r.draws;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/20"
                  >
                    <td className="px-4 py-3 font-mono text-sm text-gray-400">
                      {rank}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/workshop/skills/${r.skillSlug}`}
                          className="font-mono text-sm text-cyan-400 hover:underline"
                        >
                          {r.skillName}
                        </Link>
                        {isUndefeated && (
                          <span className="rounded bg-yellow-500/10 border border-yellow-500/30 px-1.5 py-0.5 font-mono text-[10px] text-yellow-500 uppercase">
                            undefeated
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">
                      {r.title || "--"}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-200">
                      {Math.round(r.eloRating)}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-green-400">
                      {r.wins}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-red-400">
                      {r.losses}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-400">
                      {r.draws}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-200">
                      {totalGames > 0
                        ? `${(r.winRate * 100).toFixed(0)}%`
                        : "--"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {r.lastBattleAt
                        ? new Date(r.lastBattleAt).toLocaleDateString()
                        : "--"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
