import type { Db } from "@claudiator/db/client";
import {
  battles,
  battleRounds,
  battleJudgments,
  intakeCandidates,
  skillVersions,
} from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { evolutionPrompt } from "./prompts";
import { createBattle } from "./matchmaker";
import { callLlm } from "./llm";
import { emitPipelineEvent } from "./pipeline-events";

export function shouldEvolve(
  championScore: number,
  challengerScore: number,
  verdict: string
): boolean {
  // Evolve if the battle was close (within 10 points) or the challenger won
  const scoreDiff = Math.abs(championScore - challengerScore);
  return verdict === "challenger_wins" || scoreDiff <= 10;
}

export async function generateEvolvedVersion(
  db: Db,
  battleId: string
): Promise<string | null> {
  const [battle] = await db
    .select()
    .from(battles)
    .where(eq(battles.id, battleId));

  if (!battle) return null;

  await emitPipelineEvent(db, "battle", battleId, "evolving");

  // Get champion content
  const [championVersion] = await db
    .select({ content: skillVersions.content })
    .from(skillVersions)
    .where(eq(skillVersions.id, battle.championVersionId));

  // Get challenger content
  const [candidate] = await db
    .select({ rawContent: intakeCandidates.rawContent })
    .from(intakeCandidates)
    .where(eq(intakeCandidates.id, battle.challengerId));

  if (!championVersion || !candidate) return null;

  // Build battle results summary
  const rounds = await db
    .select()
    .from(battleRounds)
    .where(eq(battleRounds.battleId, battleId));

  let battleResultsSummary = `Verdict: ${battle.verdict}\n`;
  battleResultsSummary += `Champion Score: ${battle.championScore?.toFixed(1)}\n`;
  battleResultsSummary += `Challenger Score: ${battle.challengerScore?.toFixed(1)}\n\n`;

  for (const round of rounds) {
    const judgments = await db
      .select()
      .from(battleJudgments)
      .where(eq(battleJudgments.roundId, round.id));

    for (const j of judgments) {
      battleResultsSummary += `Judge ${j.judgeIndex}: ${j.winnerId} — ${j.reasoning}\n`;
    }
  }

  const prompt = evolutionPrompt(
    championVersion.content,
    candidate.rawContent,
    battleResultsSummary
  );

  const { text: evolvedContent } = await callLlm({
    db,
    model: "claude-sonnet-4-20250514",
    system: prompt.system,
    prompt: prompt.user,
    maxTokens: 8192,
    callType: "evolve",
    battleId,
  });

  if (!evolvedContent) return null;

  // Create a new intake candidate for the evolved version
  const [newCandidate] = await db
    .insert(intakeCandidates)
    .values({
      sourceType: "community_submission",
      rawContent: evolvedContent,
      extractedPurpose: `Evolved version from battle ${battleId}`,
      category: (await db.select().from(intakeCandidates).where(eq(intakeCandidates.id, battle.challengerId)))[0]?.category,
      matchedChampionSkillId: battle.championSkillId,
      fightScore: 75,
      status: "queued",
      metadata: { evolvedFromBattle: battleId },
    })
    .returning({ id: intakeCandidates.id });

  // Create an evolution battle
  const evolutionBattleId = await createBattle(
    db,
    newCandidate.id,
    battle.championSkillId,
    battle.championVersionId,
    undefined,
    battleId
  );

  await emitPipelineEvent(db, "battle", battleId, "evolved", {
    evolvedCandidateId: newCandidate.id,
    evolutionBattleId,
  });

  console.log(
    `[arena] Created evolved candidate ${newCandidate.id} and battle ${evolutionBattleId} from battle ${battleId}`
  );

  return evolutionBattleId;
}
