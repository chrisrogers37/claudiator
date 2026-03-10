import { createDb } from "@claudiator/db/client";
import {
  battles,
  intakeCandidates,
  skills,
  battleScenarios,
  battleRounds,
  battleJudgments,
} from "@claudiator/db/schema";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BattleStatusBadge } from "../components/battle-status-badge";

export default async function BattleDetailPage({
  params,
}: {
  params: Promise<{ battleId: string }>;
}) {
  const { battleId } = await params;
  const db = createDb(process.env.DATABASE_URL!);

  // Fetch battle with related data
  const battleRows = await db
    .select({
      id: battles.id,
      status: battles.status,
      verdict: battles.verdict,
      championScore: battles.championScore,
      challengerScore: battles.challengerScore,
      config: battles.config,
      evolutionBattleId: battles.evolutionBattleId,
      startedAt: battles.startedAt,
      completedAt: battles.completedAt,
      createdAt: battles.createdAt,
      challengerPurpose: intakeCandidates.extractedPurpose,
      challengerSourceType: intakeCandidates.sourceType,
      championName: skills.name,
      championSlug: skills.slug,
    })
    .from(battles)
    .innerJoin(intakeCandidates, eq(battles.challengerId, intakeCandidates.id))
    .innerJoin(skills, eq(battles.championSkillId, skills.id))
    .where(eq(battles.id, battleId))
    .limit(1);

  if (battleRows.length === 0) return notFound();
  const battle = battleRows[0];

  // Fetch scenarios
  const scenarios = await db
    .select()
    .from(battleScenarios)
    .where(eq(battleScenarios.battleId, battleId))
    .orderBy(asc(battleScenarios.scenarioIndex));

  // Fetch rounds
  const rounds = await db
    .select()
    .from(battleRounds)
    .where(eq(battleRounds.battleId, battleId))
    .orderBy(asc(battleRounds.roundIndex));

  // Fetch judgments for all rounds
  const roundIds = rounds.map((r) => r.id);
  let judgments: (typeof battleJudgments.$inferSelect)[] = [];
  if (roundIds.length > 0) {
    // Fetch all judgments for this battle's rounds
    const allJudgments = [];
    for (const rid of roundIds) {
      const j = await db
        .select()
        .from(battleJudgments)
        .where(eq(battleJudgments.roundId, rid))
        .orderBy(asc(battleJudgments.judgeIndex));
      allJudgments.push(...j);
    }
    judgments = allJudgments;
  }

  // Group rounds and judgments by scenario
  const roundsByScenario = new Map<string, (typeof rounds)>();
  for (const r of rounds) {
    const arr = roundsByScenario.get(r.scenarioId) || [];
    arr.push(r);
    roundsByScenario.set(r.scenarioId, arr);
  }

  const judgmentsByRound = new Map<string, typeof judgments>();
  for (const j of judgments) {
    const arr = judgmentsByRound.get(j.roundId) || [];
    arr.push(j);
    judgmentsByRound.set(j.roundId, arr);
  }

  const difficultyColor: Record<string, string> = {
    easy: "text-green-400",
    medium: "text-amber-400",
    hard: "text-red-400",
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/arena"
          className="font-mono text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          &larr; Back to Arena
        </Link>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <span className="font-mono text-lg text-orange-400">
            {battle.challengerPurpose || battle.challengerSourceType}
          </span>
          <span className="font-mono text-sm text-gray-600">vs</span>
          <Link
            href={`/workshop/skills/${battle.championSlug}`}
            className="font-mono text-lg text-yellow-500 hover:underline"
          >
            {battle.championName}
          </Link>
        </div>
        <BattleStatusBadge status={battle.status} />
      </div>

      {/* Scores */}
      {battle.championScore != null && battle.challengerScore != null && (
        <div className="flex items-center gap-6 mb-4">
          <div className="rounded-lg border border-gray-800 bg-[#161b22] px-4 py-3 text-center">
            <p className="font-mono text-xs text-gray-500">Champion</p>
            <p className="font-mono text-2xl text-yellow-500">
              {battle.championScore.toFixed(1)}
            </p>
          </div>
          <span className="font-mono text-gray-600">-</span>
          <div className="rounded-lg border border-gray-800 bg-[#161b22] px-4 py-3 text-center">
            <p className="font-mono text-xs text-gray-500">Challenger</p>
            <p className="font-mono text-2xl text-orange-400">
              {battle.challengerScore.toFixed(1)}
            </p>
          </div>
        </div>
      )}

      {/* Verdict Banner */}
      {battle.verdict && (
        <div
          className={`rounded-lg border px-4 py-3 mb-6 font-mono text-sm ${
            battle.verdict === "champion_wins"
              ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-500"
              : battle.verdict === "challenger_wins"
                ? "border-orange-400/30 bg-orange-400/10 text-orange-400"
                : "border-gray-700 bg-gray-800/50 text-gray-400"
          }`}
        >
          Verdict: {battle.verdict.replace(/_/g, " ")}
        </div>
      )}

      {/* Evolution link */}
      {battle.evolutionBattleId && (
        <div className="mb-6">
          <Link
            href={`/arena/${battle.evolutionBattleId}`}
            className="font-mono text-xs text-cyan-400 hover:underline"
          >
            View evolution battle &rarr;
          </Link>
        </div>
      )}

      {/* Scenarios */}
      {scenarios.length === 0 ? (
        <p className="font-mono text-sm text-gray-500">
          No scenarios generated yet.
        </p>
      ) : (
        <div className="space-y-6">
          {scenarios.map((scenario) => {
            const scenarioRounds = roundsByScenario.get(scenario.id) || [];
            return (
              <details
                key={scenario.id}
                className="rounded-lg border border-gray-800 bg-[#161b22]"
              >
                <summary className="cursor-pointer px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-gray-200">
                      Scenario {scenario.scenarioIndex + 1}
                    </span>
                    <span
                      className={`font-mono text-xs ${difficultyColor[scenario.difficulty] || "text-gray-400"}`}
                    >
                      [{scenario.difficulty}]
                    </span>
                  </div>
                  <span className="font-mono text-xs text-gray-500">
                    {scenarioRounds.length} round
                    {scenarioRounds.length !== 1 ? "s" : ""}
                  </span>
                </summary>

                <div className="border-t border-gray-800 px-4 py-3">
                  <p className="font-mono text-xs text-gray-400 mb-4">
                    {scenario.description}
                  </p>

                  {scenarioRounds.map((round) => {
                    const roundJudgments =
                      judgmentsByRound.get(round.id) || [];
                    return (
                      <div
                        key={round.id}
                        className="mb-6 last:mb-0"
                      >
                        <h4 className="font-mono text-xs text-gray-500 uppercase tracking-wider mb-2">
                          Round {round.roundIndex + 1}
                        </h4>

                        {/* Outputs side by side */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                          <div>
                            <p className="font-mono text-xs text-yellow-500 mb-1">
                              Champion Output
                            </p>
                            <pre className="rounded border border-gray-800 bg-[#0d1117] p-3 font-mono text-xs text-gray-300 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                              <code>{round.championOutput}</code>
                            </pre>
                          </div>
                          <div>
                            <p className="font-mono text-xs text-orange-400 mb-1">
                              Challenger Output
                            </p>
                            <pre className="rounded border border-gray-800 bg-[#0d1117] p-3 font-mono text-xs text-gray-300 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                              <code>{round.challengerOutput}</code>
                            </pre>
                          </div>
                        </div>

                        {/* Judgments */}
                        {roundJudgments.length > 0 && (
                          <div className="space-y-2">
                            {roundJudgments.map((j) => {
                              const scores = j.scores as {
                                champion: {
                                  accuracy: number;
                                  completeness: number;
                                  style: number;
                                  efficiency: number;
                                  total: number;
                                };
                                challenger: {
                                  accuracy: number;
                                  completeness: number;
                                  style: number;
                                  efficiency: number;
                                  total: number;
                                };
                              };
                              return (
                                <div
                                  key={j.id}
                                  className="rounded border border-gray-800 bg-[#0d1117] p-3"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-mono text-xs text-gray-500">
                                      Judge {j.judgeIndex + 1}
                                    </span>
                                    <div className="flex items-center gap-3">
                                      <span
                                        className={`font-mono text-xs ${
                                          j.winnerId === "champion"
                                            ? "text-yellow-500"
                                            : j.winnerId === "challenger"
                                              ? "text-orange-400"
                                              : "text-gray-400"
                                        }`}
                                      >
                                        {j.winnerId}
                                      </span>
                                      <span className="font-mono text-xs text-gray-600">
                                        confidence: {j.confidence}%
                                      </span>
                                    </div>
                                  </div>

                                  {/* Scores breakdown */}
                                  <div className="grid grid-cols-2 gap-2 mb-2">
                                    <div className="font-mono text-xs">
                                      <span className="text-yellow-500/70">
                                        C:{" "}
                                      </span>
                                      <span className="text-gray-400">
                                        acc:{scores.champion.accuracy} comp:
                                        {scores.champion.completeness} sty:
                                        {scores.champion.style} eff:
                                        {scores.champion.efficiency} ={" "}
                                      </span>
                                      <span className="text-yellow-500">
                                        {scores.champion.total}
                                      </span>
                                    </div>
                                    <div className="font-mono text-xs">
                                      <span className="text-orange-400/70">
                                        X:{" "}
                                      </span>
                                      <span className="text-gray-400">
                                        acc:{scores.challenger.accuracy} comp:
                                        {scores.challenger.completeness} sty:
                                        {scores.challenger.style} eff:
                                        {scores.challenger.efficiency} ={" "}
                                      </span>
                                      <span className="text-orange-400">
                                        {scores.challenger.total}
                                      </span>
                                    </div>
                                  </div>

                                  <p className="font-mono text-xs text-gray-500">
                                    {j.reasoning}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
