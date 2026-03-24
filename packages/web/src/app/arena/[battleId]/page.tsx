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
import { BattleExecuteButton } from "../components/battle-execute-button";
import { JudgeCard } from "../components/judge-card";

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
      challengerRawContent: intakeCandidates.rawContent,
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

  // Extract short name from YAML frontmatter
  const challengerNameMatch = battle.challengerRawContent.match(
    /^name:\s*["']?(.+?)["']?\s*$/m
  );
  const challengerName =
    challengerNameMatch?.[1] ||
    battle.challengerPurpose?.slice(0, 40) ||
    battle.challengerSourceType;

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

  // Count votes
  let champVotes = 0,
    challVotes = 0,
    drawVotes = 0;
  for (const j of judgments) {
    if (j.winnerId === "champion") champVotes++;
    else if (j.winnerId === "challenger") challVotes++;
    else drawVotes++;
  }
  const totalVotes = champVotes + challVotes + drawVotes;

  const difficultyPill: Record<string, string> = {
    easy: "bg-green-900/40 text-green-400 border-green-400/30",
    medium: "bg-amber-900/40 text-amber-400 border-amber-400/30",
    hard: "bg-red-900/40 text-red-400 border-red-400/30",
  };

  return (
    <>
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/arena"
          className="font-mono text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          &larr; Back to Arena
        </Link>
      </div>

      {/* A. Matchup Header */}
      <div className="relative rounded-lg border border-gray-800 bg-[#161b22] overflow-hidden mb-6">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-gradient-to-r from-orange-400/5 via-transparent to-yellow-500/5 pointer-events-none" />

        <div className="relative p-6">
          {/* Status badge top-right */}
          <div className="absolute top-4 right-4 flex items-center gap-3">
            <BattleStatusBadge status={battle.status} />
            {battle.status === "pending" && (
              <BattleExecuteButton battleId={battle.id} />
            )}
          </div>

          <div className="flex items-center justify-between gap-6">
            {/* Challenger (left) */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-8 rounded-full bg-orange-400" />
                <span className="font-mono text-xs text-gray-500 uppercase tracking-wider">
                  Challenger
                </span>
              </div>
              <p className="font-mono text-lg text-orange-400 truncate pl-3">
                {challengerName}
              </p>
              {battle.challengerPurpose && challengerNameMatch && (
                <p className="font-mono text-xs text-gray-500 mt-1 pl-3 truncate">
                  {battle.challengerPurpose}
                </p>
              )}
            </div>

            {/* VS Center */}
            <div className="shrink-0 text-center px-4">
              <span className="font-mono text-2xl md:text-3xl font-bold text-gray-600">
                VS
              </span>
            </div>

            {/* Champion (right) */}
            <div className="flex-1 min-w-0 text-right">
              <div className="flex items-center gap-2 justify-end mb-1">
                <span className="font-mono text-xs text-gray-500 uppercase tracking-wider">
                  Champion
                </span>
                <div className="w-1 h-8 rounded-full bg-yellow-500" />
              </div>
              <Link
                href={`/workshop/skills/${battle.championSlug}`}
                className="font-mono text-lg text-yellow-500 hover:underline truncate block pr-3"
              >
                {battle.championName}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* B. Visual Scoreboard */}
      {battle.verdict && (
        <div className="mb-6 space-y-4 animate-verdict-reveal">
          {/* Proportional vote bar */}
          {totalVotes > 0 && (
            <div className="flex items-center gap-3">
              <span className="font-mono text-2xl text-yellow-500 w-10 text-right shrink-0">
                {champVotes}
              </span>
              <div className="flex-1 h-3 rounded-full overflow-hidden bg-gray-800 flex">
                {champVotes > 0 && (
                  <div
                    className="bg-yellow-500 h-full transition-all"
                    style={{
                      width: `${(champVotes / totalVotes) * 100}%`,
                    }}
                  />
                )}
                {drawVotes > 0 && (
                  <div
                    className="bg-gray-600 h-full transition-all"
                    style={{
                      width: `${(drawVotes / totalVotes) * 100}%`,
                    }}
                  />
                )}
                {challVotes > 0 && (
                  <div
                    className="bg-orange-400 h-full transition-all"
                    style={{
                      width: `${(challVotes / totalVotes) * 100}%`,
                    }}
                  />
                )}
              </div>
              <span className="font-mono text-2xl text-orange-400 w-10 shrink-0">
                {challVotes}
              </span>
            </div>
          )}

          {/* Avg scores */}
          {battle.championScore != null && battle.challengerScore != null && (
            <p className="font-mono text-xs text-gray-500 text-center">
              Avg point scores: champion{" "}
              {battle.championScore.toFixed(1)} / challenger{" "}
              {battle.challengerScore.toFixed(1)}
            </p>
          )}

          {/* Verdict banner */}
          <div
            className={`rounded-lg border px-4 py-3 font-mono text-sm text-center ${
              battle.verdict === "champion_wins"
                ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-500"
                : battle.verdict === "challenger_wins"
                  ? "border-orange-400/30 bg-orange-400/10 text-orange-400"
                  : "border-gray-700 bg-gray-800/50 text-gray-400"
            }`}
          >
            Verdict: {battle.verdict.replace(/_/g, " ")} ({champVotes}-
            {challVotes}
            {drawVotes > 0 ? `-${drawVotes}` : ""})
          </div>
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
                      className={`font-mono text-xs rounded-full border px-2 py-0.5 ${
                        difficultyPill[scenario.difficulty] ||
                        "bg-gray-800 text-gray-400 border-gray-700"
                      }`}
                    >
                      {scenario.difficulty}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-gray-500">
                    {scenarioRounds.length} round
                    {scenarioRounds.length !== 1 ? "s" : ""}
                  </span>
                </summary>

                <div className="border-t border-gray-800 px-4 py-3">
                  <p className="font-mono text-xs text-gray-400 mb-2">
                    {scenario.description}
                  </p>
                  <div className="rounded border border-gray-800 bg-[#0d1117] p-3 mb-4 space-y-2">
                    <div>
                      <p className="font-mono text-xs text-cyan-400 mb-1">
                        Project Context
                      </p>
                      <p className="font-mono text-xs text-gray-400 whitespace-pre-wrap">
                        {scenario.projectContext}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-xs text-cyan-400 mb-1">
                        User Prompt
                      </p>
                      <p className="font-mono text-xs text-gray-300 whitespace-pre-wrap">
                        {scenario.userPrompt}
                      </p>
                    </div>
                  </div>

                  {scenarioRounds.map((round) => {
                    const roundJudgments =
                      judgmentsByRound.get(round.id) || [];
                    return (
                      <div key={round.id} className="mb-6 last:mb-0">
                        <div className="border-t border-gray-800 pt-4 mb-3">
                          <h4 className="font-mono text-xs text-gray-500 uppercase tracking-wider">
                            Round {round.roundIndex + 1}
                          </h4>
                        </div>

                        {/* Outputs side by side */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                          <div>
                            <p className="font-mono text-xs text-yellow-500 mb-1">
                              Champion Output
                            </p>
                            <pre className="rounded border-l-2 border-yellow-500/40 border border-gray-800 bg-[#0d1117] p-3 font-mono text-xs text-gray-300 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                              <code>{round.championOutput}</code>
                            </pre>
                          </div>
                          <div>
                            <p className="font-mono text-xs text-orange-400 mb-1">
                              Challenger Output
                            </p>
                            <pre className="rounded border-l-2 border-orange-400/40 border border-gray-800 bg-[#0d1117] p-3 font-mono text-xs text-gray-300 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                              <code>{round.challengerOutput}</code>
                            </pre>
                          </div>
                        </div>

                        {/* C. Judge Verdict Cards */}
                        {roundJudgments.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                                <JudgeCard
                                  key={j.id}
                                  judgeIndex={j.judgeIndex}
                                  winnerId={j.winnerId}
                                  confidence={j.confidence}
                                  scores={scores}
                                  reasoning={j.reasoning}
                                />
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
