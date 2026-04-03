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
  // Find queued candidates ordered by fight score
  const candidates = await db
    .select()
    .from(intakeCandidates)
    .where(eq(intakeCandidates.status, "queued"))
    .orderBy(desc(intakeCandidates.fightScore))
    .limit(20);

  const versionCache = new Map<string, string>();

  for (const candidate of candidates) {
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

      if (topRanked) championSkillId = topRanked.skillId;
    }

    if (!championSkillId) continue;

    // Get the champion's latest version (cached — many candidates share the same champion)
    let versionId = versionCache.get(championSkillId);
    if (!versionId) {
      const [version] = await db
        .select({ id: skillVersions.id })
        .from(skillVersions)
        .where(
          and(
            eq(skillVersions.skillId, championSkillId),
            eq(skillVersions.isLatest, true)
          )
        );

      if (!version) continue;
      versionId = version.id;
      versionCache.set(championSkillId, versionId);
    }

    return {
      candidateId: candidate.id,
      championSkillId,
      championVersionId: versionId,
    };
  }

  return null;
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
