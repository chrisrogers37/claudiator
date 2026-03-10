import { createDb } from "@claudiator/db/client";
import {
  battles,
  intakeCandidates,
  skills,
} from "@claudiator/db/schema";
import { eq, sql, desc, or } from "drizzle-orm";
import Link from "next/link";
import { BattleStatusBadge } from "./components/battle-status-badge";

export default async function ArenaPage() {
  const db = createDb(process.env.DATABASE_URL!);

  // Quick stats
  const [statsResult] = await db
    .select({
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${battles.status} in ('running', 'judging'))::int`,
      championWins: sql<number>`count(*) filter (where ${battles.verdict} = 'champion_wins')::int`,
      challengerWins: sql<number>`count(*) filter (where ${battles.verdict} = 'challenger_wins')::int`,
      draws: sql<number>`count(*) filter (where ${battles.verdict} = 'draw')::int`,
    })
    .from(battles);

  // Recent battles (last 5) with challenger and champion info
  const recentBattles = await db
    .select({
      id: battles.id,
      status: battles.status,
      verdict: battles.verdict,
      championScore: battles.championScore,
      challengerScore: battles.challengerScore,
      createdAt: battles.createdAt,
      challengerPurpose: intakeCandidates.extractedPurpose,
      challengerSourceType: intakeCandidates.sourceType,
      championName: skills.name,
      championSlug: skills.slug,
    })
    .from(battles)
    .innerJoin(intakeCandidates, eq(battles.challengerId, intakeCandidates.id))
    .innerJoin(skills, eq(battles.championSkillId, skills.id))
    .orderBy(desc(battles.createdAt))
    .limit(5);

  return (
    <>
      <h1 className="font-mono text-2xl text-yellow-500 mb-6">Arena</h1>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        {[
          { label: "Total Battles", value: statsResult.total },
          { label: "Active", value: statsResult.active, color: "text-cyan-400" },
          { label: "Champion Wins", value: statsResult.championWins, color: "text-yellow-500" },
          { label: "Challenger Wins", value: statsResult.challengerWins, color: "text-orange-400" },
          { label: "Draws", value: statsResult.draws },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-gray-800 bg-[#161b22] p-4"
          >
            <p className="font-mono text-xs text-gray-500 uppercase tracking-wider">
              {stat.label}
            </p>
            <p
              className={`font-mono text-2xl mt-1 ${stat.color || "text-gray-200"}`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Recent Battles */}
      <h2 className="font-mono text-sm text-gray-400 uppercase tracking-wider mb-3">
        Recent Battles
      </h2>

      {recentBattles.length === 0 ? (
        <p className="font-mono text-sm text-gray-500">
          No battles yet. Submit a candidate in the Intake queue to get started.
        </p>
      ) : (
        <div className="space-y-3">
          {recentBattles.map((battle) => (
            <Link
              key={battle.id}
              href={`/arena/${battle.id}`}
              className="block rounded-lg border border-gray-800 bg-[#161b22] p-4 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-orange-400">
                    {battle.challengerPurpose || battle.challengerSourceType}
                  </span>
                  <span className="font-mono text-xs text-gray-600">vs</span>
                  <span className="font-mono text-sm text-yellow-500">
                    {battle.championName}
                  </span>
                </div>
                <BattleStatusBadge status={battle.status} />
              </div>

              {battle.verdict && (
                <div className="flex items-center gap-4 mt-2">
                  <span
                    className={`font-mono text-xs ${
                      battle.verdict === "champion_wins"
                        ? "text-yellow-500"
                        : battle.verdict === "challenger_wins"
                          ? "text-orange-400"
                          : "text-gray-400"
                    }`}
                  >
                    {battle.verdict.replace(/_/g, " ")}
                  </span>
                  {battle.championScore != null &&
                    battle.challengerScore != null && (
                      <span className="font-mono text-xs text-gray-500">
                        {battle.championScore.toFixed(1)} -{" "}
                        {battle.challengerScore.toFixed(1)}
                      </span>
                    )}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
