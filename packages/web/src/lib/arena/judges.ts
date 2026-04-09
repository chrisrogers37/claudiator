import type { Db } from "@claudiator/db/client";
import { battleJudgments } from "@claudiator/db/schema";
import { judgingPrompt, judgingUserPrompt } from "./prompts";
import { callLlm } from "./llm";
import type { ScoringRubric } from "./types";

export interface JudgmentResult {
  winner: "champion" | "challenger" | "draw";
  scores: {
    champion: Record<string, number> & { total: number };
    challenger: Record<string, number> & { total: number };
  };
  reasoning: string;
  confidence: number;
}

interface ScenarioInfo {
  description: string;
  projectContext: string;
  userPrompt: string;
}

export async function judgeRound(
  db: Db,
  roundId: string,
  judgeIndex: number,
  scenario: ScenarioInfo,
  championOutput: string,
  challengerOutput: string,
  battleId: string,
  rubric: ScoringRubric
): Promise<JudgmentResult> {
  const model = "claude-haiku-4-5-20251001";

  const { text, usage, latencyMs } = await callLlm({
    db,
    model,
    system: judgingPrompt(rubric),
    prompt: judgingUserPrompt(scenario, championOutput, challengerOutput),
    maxTokens: 1024,
    callType: "judge",
    battleId,
    parentEntityId: roundId,
    parentEntityType: "battle_round",
  });

  let result: JudgmentResult;
  try {
    result = JSON.parse(text);
  } catch {
    console.error(`[arena] Failed to parse judgment for round ${roundId}, judge ${judgeIndex}`);
    const fallbackScores: Record<string, number> & { total: number } = { total: 0 };
    for (const d of rubric.dimensions) {
      fallbackScores[d.key] = Math.floor(d.maxScore / 2);
    }
    fallbackScores.total = rubric.dimensions.length * Math.floor(rubric.dimensions[0].maxScore / 2);
    result = {
      winner: "draw",
      scores: { champion: { ...fallbackScores }, challenger: { ...fallbackScores } },
      reasoning: "Failed to parse judge response — defaulting to draw",
      confidence: 0,
    };
  }

  await db.insert(battleJudgments).values({
    roundId,
    judgeIndex,
    winnerId: result.winner,
    scores: result.scores,
    reasoning: result.reasoning,
    confidence: Math.max(0, Math.min(100, result.confidence)),
    model,
    latencyMs,
    inputTokens: usage.input,
    outputTokens: usage.output,
  });

  return result;
}

export function aggregateJudgments(
  judgments: JudgmentResult[]
): {
  verdict: "champion_wins" | "challenger_wins" | "draw";
  championScore: number;
  challengerScore: number;
} {
  let championWins = 0;
  let challengerWins = 0;
  let draws = 0;
  let totalChampionScore = 0;
  let totalChallengerScore = 0;

  for (const j of judgments) {
    if (j.winner === "champion") championWins++;
    else if (j.winner === "challenger") challengerWins++;
    else draws++;
    totalChampionScore += j.scores.champion.total;
    totalChallengerScore += j.scores.challenger.total;
  }

  const count = judgments.length || 1;

  let verdict: "champion_wins" | "challenger_wins" | "draw";
  if (championWins > challengerWins) verdict = "champion_wins";
  else if (challengerWins > championWins) verdict = "challenger_wins";
  else verdict = "draw";

  return {
    verdict,
    championScore: totalChampionScore / count,
    challengerScore: totalChallengerScore / count,
  };
}
