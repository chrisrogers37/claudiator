import { createDb } from "@claudiator/db/client";
import {
  skillCategories,
  skills,
  arenaRankings,
  arenaEloHistory,
  battles,
  intakeCandidates,
} from "@claudiator/db/schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import { extractChallengerName } from "@/lib/arena/extract-challenger-name";
import { FightCard } from "../components/fight-card";
import { EloSparkline } from "../components/elo-sparkline";
import Link from "next/link";

function formatRelativeDate(date: Date): string {
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ expand?: string }>;
}) {
  const { expand } = await searchParams;
  const db = createDb(process.env.DATABASE_URL!);

  // ── Parallel queries: categories, rankings, recent battles ──────────────
  const [categories, rankings, recentBattles, eloHistory] = await Promise.all([
    db
      .select({
        id: skillCategories.id,
        domain: skillCategories.domain,
        fn: skillCategories.function,
        slug: skillCategories.slug,
        description: skillCategories.description,
        skillCount: sql<number>`count(${skills.id})::int`,
      })
      .from(skillCategories)
      .leftJoin(skills, eq(skills.categoryId, skillCategories.id))
      .groupBy(skillCategories.id)
      .orderBy(desc(sql`count(${skills.id})`)),
    db
      .select({
        skillId: arenaRankings.skillId,
        categoryId: arenaRankings.categoryId,
        skillName: skills.name,
        skillSlug: skills.slug,
        wins: arenaRankings.wins,
        losses: arenaRankings.losses,
        draws: arenaRankings.draws,
        winRate: arenaRankings.winRate,
        eloRating: arenaRankings.eloRating,
        title: arenaRankings.title,
        lastBattleAt: arenaRankings.lastBattleAt,
      })
      .from(arenaRankings)
      .innerJoin(skills, eq(arenaRankings.skillId, skills.id))
      .orderBy(desc(arenaRankings.eloRating)),
    db
      .select({
        id: battles.id,
        status: battles.status,
        verdict: battles.verdict,
        championSkillId: battles.championSkillId,
        championName: skills.name,
        challengerRawContent: intakeCandidates.rawContent,
        challengerPurpose: intakeCandidates.extractedPurpose,
        challengerSourceType: intakeCandidates.sourceType,
      })
      .from(battles)
      .innerJoin(skills, eq(battles.championSkillId, skills.id))
      .innerJoin(intakeCandidates, eq(battles.challengerId, intakeCandidates.id))
      .orderBy(desc(battles.createdAt))
      .limit(30),
    db
      .select({
        skillId: arenaEloHistory.skillId,
        eloAfter: arenaEloHistory.eloAfter,
        eloChange: arenaEloHistory.eloChange,
        outcome: arenaEloHistory.outcome,
      })
      .from(arenaEloHistory)
      .orderBy(asc(arenaEloHistory.createdAt)),
  ]);

  // ── Group ELO history by skill ───────────────────────────────────────────
  const eloHistoryBySkill = new Map<string, typeof eloHistory>();
  for (const entry of eloHistory) {
    const list = eloHistoryBySkill.get(entry.skillId) ?? [];
    list.push(entry);
    eloHistoryBySkill.set(entry.skillId, list);
  }

  // ── Group data in JS ────────────────────────────────────────────────────

  // rankingsByCategory: Map<categoryId, ranking[]>
  const rankingsByCategory = new Map<string, typeof rankings>();
  for (const r of rankings) {
    if (!r.categoryId) continue;
    const list = rankingsByCategory.get(r.categoryId) ?? [];
    list.push(r);
    rankingsByCategory.set(r.categoryId, list);
  }

  // Build a map of championSkillId -> categoryId from rankings
  const skillCategoryMap = new Map<string, string>();
  for (const r of rankings) {
    if (r.categoryId) {
      skillCategoryMap.set(r.skillId, r.categoryId);
    }
  }

  // battlesByCategory: Map<categoryId, battle[]>
  const battlesWithNames = recentBattles.map((b) => ({
    ...b,
    challengerName: extractChallengerName(
      b.challengerRawContent,
      b.challengerPurpose
    ),
    categoryId: skillCategoryMap.get(b.championSkillId) ?? null,
  }));

  const battlesByCategory = new Map<string, typeof battlesWithNames>();
  for (const b of battlesWithNames) {
    if (!b.categoryId) continue;
    const list = battlesByCategory.get(b.categoryId) ?? [];
    list.push(b);
    battlesByCategory.set(b.categoryId, list);
  }

  // ── Stats ───────────────────────────────────────────────────────────────
  const totalRankedSkills = rankings.length;
  const totalCategories = categories.length;
  const recentBattleCount = recentBattles.length;

  // Filter categories: show if skillCount > 0 or if they have battles
  const visibleCategories = categories.filter(
    (cat) =>
      cat.skillCount > 0 ||
      (battlesByCategory.get(cat.id)?.length ?? 0) > 0
  );

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-mono text-2xl text-yellow-500 mb-2">
          Leaderboard
        </h1>
        <div className="flex items-center gap-4 font-mono text-xs text-gray-500">
          <span>
            {totalRankedSkills} ranked skill
            {totalRankedSkills !== 1 ? "s" : ""}
          </span>
          <span className="text-gray-700">|</span>
          <span>
            {totalCategories} categor{totalCategories !== 1 ? "ies" : "y"}
          </span>
          <span className="text-gray-700">|</span>
          <span>
            {recentBattleCount} recent battle{recentBattleCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Category sections */}
      {visibleCategories.length === 0 ? (
        <p className="font-mono text-sm text-gray-500">
          No categories with ranked skills yet. Complete some battles first.
        </p>
      ) : (
        <div className="space-y-3">
          {visibleCategories.map((cat) => {
            const catRankings = rankingsByCategory.get(cat.id) ?? [];
            const catBattles = (battlesByCategory.get(cat.id) ?? []).slice(
              0,
              3
            );
            const champion = catRankings[0]; // already sorted by ELO desc

            return (
              <details
                key={cat.id}
                open={expand === cat.slug || undefined}
                className="group rounded-lg border border-gray-800 bg-[#161b22] overflow-hidden"
              >
                {/* Summary line */}
                <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer select-none hover:bg-gray-800/30 transition-colors list-none [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Expand indicator */}
                    <span className="font-mono text-xs text-gray-600 group-open:rotate-90 transition-transform shrink-0">
                      &gt;
                    </span>

                    {/* Domain badge */}
                    <span className="rounded bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 font-mono text-[10px] text-yellow-500 uppercase tracking-wider shrink-0">
                      {cat.domain}
                    </span>
                    <span className="font-mono text-xs text-gray-600 shrink-0">
                      /
                    </span>
                    {/* Function badge */}
                    <span className="rounded bg-gray-800 border border-gray-700 px-2 py-0.5 font-mono text-[10px] text-gray-400 uppercase tracking-wider shrink-0">
                      {cat.fn}
                    </span>

                    {/* Skill count */}
                    <span className="font-mono text-xs text-gray-500 shrink-0">
                      {cat.skillCount} skill{cat.skillCount !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Champion preview */}
                  <div className="flex items-center gap-2 shrink-0">
                    {champion ? (
                      <>
                        <span className="font-mono text-xs text-yellow-500 truncate max-w-[160px]">
                          {champion.skillName}
                        </span>
                        <span className="font-mono text-xs text-gray-500">
                          {Math.round(champion.eloRating)} ELO
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-xs text-gray-600">
                        no champion
                      </span>
                    )}
                  </div>
                </summary>

                {/* Expanded content */}
                <div className="border-t border-gray-800 px-5 py-4">
                  {/* Description */}
                  {cat.description && (
                    <p className="font-mono text-xs text-gray-400 mb-4">
                      {cat.description}
                    </p>
                  )}

                  {/* Mini leaderboard table */}
                  {catRankings.length > 0 ? (
                    <div className="rounded border border-gray-800 bg-[#0d1117] overflow-x-auto mb-4">
                      <table className="w-full min-w-[500px]">
                        <thead>
                          <tr className="border-b border-gray-800">
                            {["#", "Skill", "Title", "ELO", "Trend", "W/L/D", "Win %", ""].map(
                              (h) => (
                                <th
                                  key={h}
                                  className="px-3 py-2 text-left font-mono text-[10px] text-gray-500 uppercase tracking-wider"
                                >
                                  {h}
                                </th>
                              )
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {catRankings.map((r, i) => {
                            const rank = i + 1;
                            const isUndefeated =
                              r.losses === 0 && r.wins > 0;
                            const totalGames =
                              r.wins + r.losses + r.draws;

                            return (
                              <tr
                                key={r.skillId}
                                className="border-b border-gray-800/50 hover:bg-gray-800/20"
                              >
                                <td className="px-3 py-2 font-mono text-xs text-gray-500">
                                  {rank}
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <Link
                                      href={`/workshop/skills/${r.skillSlug}`}
                                      className="font-mono text-xs text-cyan-400 hover:underline"
                                    >
                                      {r.skillName}
                                    </Link>
                                    {isUndefeated && (
                                      <span className="rounded bg-yellow-500/10 border border-yellow-500/30 px-1 py-0.5 font-mono text-[9px] text-yellow-500 uppercase">
                                        undefeated
                                      </span>
                                    )}
                                  </div>
                                  {r.lastBattleAt && (
                                    <span className="font-mono text-[10px] text-gray-600 block">
                                      {formatRelativeDate(r.lastBattleAt)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs text-gray-400">
                                  {r.title || "--"}
                                </td>
                                <td className="px-3 py-2 font-mono text-xs text-gray-200">
                                  {Math.round(r.eloRating)}
                                </td>
                                <td className="px-3 py-2">
                                  <EloSparkline history={eloHistoryBySkill.get(r.skillId) ?? []} />
                                </td>
                                <td className="px-3 py-2 font-mono text-xs">
                                  <span className="text-green-400">
                                    {r.wins}
                                  </span>
                                  <span className="text-gray-600">/</span>
                                  <span className="text-red-400">
                                    {r.losses}
                                  </span>
                                  <span className="text-gray-600">/</span>
                                  <span className="text-gray-400">
                                    {r.draws}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-xs text-gray-200">
                                  {totalGames > 0
                                    ? `${(r.winRate * 100).toFixed(0)}%`
                                    : "--"}
                                </td>
                                <td className="px-3 py-2">
                                  <Link
                                    href={`/arena/battles?skill=${r.skillId}`}
                                    className="font-mono text-[10px] text-gray-600 hover:text-cyan-400 transition-colors"
                                  >
                                    battles
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="font-mono text-xs text-gray-600 mb-4">
                      No ranked skills in this category yet.
                    </p>
                  )}

                  {/* Recent battles for this category */}
                  {catBattles.length > 0 && (
                    <div>
                      <h3 className="font-mono text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                        Recent Battles
                      </h3>
                      <div className="space-y-2">
                        {catBattles.map((b) => (
                          <FightCard
                            key={b.id}
                            id={b.id}
                            championName={b.championName}
                            challengerName={b.challengerName}
                            status={b.status}
                            verdict={b.verdict}
                            compact
                            backPath="/arena/leaderboard"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
