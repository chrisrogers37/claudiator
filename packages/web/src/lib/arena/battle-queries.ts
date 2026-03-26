import type { Db } from "@claudiator/db/client";
import {
  battles,
  battleScenarios,
  battleRounds,
  battleJudgments,
  skills,
  intakeCandidates,
} from "@claudiator/db/schema";
import { eq, inArray, asc } from "drizzle-orm";

export async function getBattleDetail(db: Db, battleId: string) {
  // 1. Load battle with champion skill + challenger joins
  const [battle] = await db
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
      challengerId: battles.challengerId,
      championSkillId: battles.championSkillId,
      championVersionId: battles.championVersionId,
      challengerSourceType: intakeCandidates.sourceType,
      challengerSourceUrl: intakeCandidates.sourceUrl,
      challengerRawContent: intakeCandidates.rawContent,
      challengerCategory: intakeCandidates.category,
      challengerExtractedPurpose: intakeCandidates.extractedPurpose,
      championSkillName: skills.name,
      championSkillSlug: skills.slug,
    })
    .from(battles)
    .innerJoin(intakeCandidates, eq(battles.challengerId, intakeCandidates.id))
    .innerJoin(skills, eq(battles.championSkillId, skills.id))
    .where(eq(battles.id, battleId))
    .limit(1);

  if (!battle) return null;

  // 2. Load scenarios
  const scenarios = await db
    .select()
    .from(battleScenarios)
    .where(eq(battleScenarios.battleId, battleId))
    .orderBy(asc(battleScenarios.scenarioIndex));

  // 3. Load all rounds
  const rounds = await db
    .select()
    .from(battleRounds)
    .where(eq(battleRounds.battleId, battleId))
    .orderBy(asc(battleRounds.roundIndex));

  // 4. Load ALL judgments in one query using inArray
  const roundIds = rounds.map((r) => r.id);
  let judgments: (typeof battleJudgments.$inferSelect)[] = [];
  if (roundIds.length > 0) {
    judgments = await db
      .select()
      .from(battleJudgments)
      .where(inArray(battleJudgments.roundId, roundIds))
      .orderBy(asc(battleJudgments.judgeIndex));
  }

  // 5. Group judgments by roundId in JavaScript
  const judgmentsByRound = new Map<
    string,
    (typeof battleJudgments.$inferSelect)[]
  >();
  for (const j of judgments) {
    const arr = judgmentsByRound.get(j.roundId) || [];
    arr.push(j);
    judgmentsByRound.set(j.roundId, arr);
  }

  // 6. Nest rounds under scenarios, judgments under rounds
  const scenariosWithRounds = scenarios.map((scenario) => {
    const scenarioRounds = rounds
      .filter((r) => r.scenarioId === scenario.id)
      .map((round) => ({
        ...round,
        judgments: judgmentsByRound.get(round.id) || [],
      }));

    return {
      ...scenario,
      rounds: scenarioRounds,
    };
  });

  return {
    ...battle,
    scenarios: scenariosWithRounds,
  };
}
