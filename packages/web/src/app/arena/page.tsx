import { createDb } from "@claudiator/db/client";
import {
  battles,
  intakeCandidates,
  skills,
} from "@claudiator/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { ArenaHero } from "./components/arena-hero";
import { FightCard } from "./components/fight-card";

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
      challengerRawContent: intakeCandidates.rawContent,
      challengerSourceType: intakeCandidates.sourceType,
      championName: skills.name,
      championSlug: skills.slug,
    })
    .from(battles)
    .innerJoin(intakeCandidates, eq(battles.challengerId, intakeCandidates.id))
    .innerJoin(skills, eq(battles.championSkillId, skills.id))
    .orderBy(desc(battles.createdAt))
    .limit(5);

  // Extract challenger names
  const battlesWithNames = recentBattles.map((b) => {
    const nameMatch = b.challengerRawContent.match(
      /^name:\s*["']?(.+?)["']?\s*$/m
    );
    return {
      ...b,
      challengerName:
        nameMatch?.[1] ||
        b.challengerPurpose?.slice(0, 40) ||
        b.challengerSourceType,
    };
  });

  // Featured battle: most recent active, or most recent complete
  const featured =
    battlesWithNames.find(
      (b) => b.status === "running" || b.status === "judging"
    ) || battlesWithNames[0];

  const stats = [
    { label: "Total Battles", value: statsResult.total, border: "border-l-gray-500" },
    { label: "Active", value: statsResult.active, border: "border-l-cyan-400", color: "text-cyan-400" },
    { label: "Champion Wins", value: statsResult.championWins, border: "border-l-yellow-500", color: "text-yellow-500" },
    { label: "Challenger Wins", value: statsResult.challengerWins, border: "border-l-orange-400", color: "text-orange-400" },
    { label: "Draws", value: statsResult.draws, border: "border-l-gray-500" },
  ];

  return (
    <>
      <ArenaHero />

      {/* Featured Battle */}
      {featured && (
        <div className="mb-8">
          <h2 className="font-mono text-xs text-gray-500 uppercase tracking-wider mb-3">
            Featured Battle
          </h2>
          <FightCard
            id={featured.id}
            championName={featured.championName}
            challengerName={featured.challengerName || "\u2014"}
            status={featured.status}
            verdict={featured.verdict}
          />
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-lg border border-gray-800 bg-[#161b22] p-4 border-l-2 ${stat.border}`}
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

      {/* Recent Results */}
      <h2 className="font-mono text-xs text-gray-500 uppercase tracking-wider mb-3">
        Recent Results
      </h2>

      {battlesWithNames.length === 0 ? (
        <p className="font-mono text-sm text-gray-500">
          No battles yet. Submit a candidate in the Intake queue to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {battlesWithNames.map((battle) => (
            <FightCard
              key={battle.id}
              id={battle.id}
              championName={battle.championName}
              challengerName={battle.challengerName || "\u2014"}
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
