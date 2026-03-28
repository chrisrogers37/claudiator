import type { Db } from "@claudiator/db/client";
import {
  intakeCandidates,
  battles,
  skills,
  skillVersions,
  arenaRankings,
} from "@claudiator/db/schema";
import { eq, and, desc, isNotNull } from "drizzle-orm";

const DEFAULT_BATTLE_CONFIG = {
  scenarioCount: 3,
  roundsPerScenario: 1,
  judgeCount: 5,
  winThreshold: 3,
};

export async function findNextMatch(
  db: Db
): Promise<{
  candidateId: string;
  championSkillId: string;
  championVersionId: string;
} | null> {
  // Find highest-scored queued candidate
  const [candidate] = await db
    .select()
    .from(intakeCandidates)
    .where(eq(intakeCandidates.status, "queued"))
    .orderBy(desc(intakeCandidates.fightScore))
    .limit(1);

  if (!candidate) return null;

  let championSkillId = candidate.matchedChampionSkillId;

  // If no matched champion but candidate has a category, find the highest-ELO skill in that category
  if (!championSkillId && candidate.categoryId) {
    const [topRanked] = await db
      .select({ skillId: arenaRankings.skillId })
      .from(arenaRankings)
      .innerJoin(skills, eq(skills.id, arenaRankings.skillId))
      .where(eq(skills.categoryId, candidate.categoryId))
      .orderBy(desc(arenaRankings.eloRating))
      .limit(1);

    if (!topRanked) {
      // No existing skills in this category — skip candidate
      return null;
    }
    championSkillId = topRanked.skillId;
  }

  if (!championSkillId) return null;

  // Get the champion's latest version
  const [version] = await db
    .select({ id: skillVersions.id })
    .from(skillVersions)
    .where(
      and(
        eq(skillVersions.skillId, championSkillId),
        eq(skillVersions.isLatest, true)
      )
    );

  if (!version) return null;

  return {
    candidateId: candidate.id,
    championSkillId,
    championVersionId: version.id,
  };
}

export async function createBattle(
  db: Db,
  candidateId: string,
  championSkillId: string,
  championVersionId: string,
  config?: Partial<typeof DEFAULT_BATTLE_CONFIG>,
  evolutionBattleId?: string
): Promise<string> {
  const battleConfig = { ...DEFAULT_BATTLE_CONFIG, ...config };

  // Mark candidate as battling
  await db
    .update(intakeCandidates)
    .set({ status: "battling", updatedAt: new Date() })
    .where(eq(intakeCandidates.id, candidateId));

  const [battle] = await db
    .insert(battles)
    .values({
      challengerId: candidateId,
      championSkillId,
      championVersionId,
      config: battleConfig,
      evolutionBattleId: evolutionBattleId ?? null,
    })
    .returning({ id: battles.id });

  console.log(`[arena] Created battle ${battle.id}: candidate ${candidateId} vs skill ${championSkillId}`);
  return battle.id;
}
