import Anthropic from "@anthropic-ai/sdk";
import type { Db } from "@claudiator/db/client";
import { battleJudgments } from "@claudiator/db/schema";
import { judgingPrompt, judgingUserPrompt } from "./prompts";

interface JudgmentResult {
  winner: "champion" | "challenger" | "draw";
  scores: {
    champion: { accuracy: number; completeness: number; style: number; efficiency: number; total: number };
    challenger: { accuracy: number; completeness: number; style: number; efficiency: number; total: number };
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
  challengerOutput: string
): Promise<JudgmentResult> {
  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: judgingPrompt(),
    messages: [
      {
        role: "user",
        content: judgingUserPrompt(scenario, championOutput, challengerOutput),
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let result: JudgmentResult;
  try {
    result = JSON.parse(text);
  } catch {
    console.error(`[arena] Failed to parse judgment for round ${roundId}, judge ${judgeIndex}`);
    result = {
      winner: "draw",
      scores: {
        champion: { accuracy: 12, completeness: 12, style: 12, efficiency: 12, total: 48 },
        challenger: { accuracy: 12, completeness: 12, style: 12, efficiency: 12, total: 48 },
      },
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
