import { createDb } from "@claudiator/db/client";
import {
  battles,
  intakeCandidates,
  skills,
  skillVersions,
  skillCategories,
} from "@claudiator/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { NewBattleForm } from "../components/new-battle-form";
import { formatCategoryLabel } from "@/lib/format-category";
import { FightCard } from "../components/fight-card";

export default async function BattlesPage() {
  const db = createDb(process.env.DATABASE_URL!);

  // All battles with related data
  const allBattles = await db
    .select({
      id: battles.id,
      status: battles.status,
      verdict: battles.verdict,
      championScore: battles.championScore,
      challengerScore: battles.challengerScore,
      totalLlmCalls: battles.totalLlmCalls,
      totalCostCents: battles.totalCostCents,
      startedAt: battles.startedAt,
      completedAt: battles.completedAt,
      createdAt: battles.createdAt,
      challengerPurpose: intakeCandidates.extractedPurpose,
      challengerRawContent: intakeCandidates.rawContent,
      challengerSourceUrl: intakeCandidates.sourceUrl,
      championName: skills.name,
      championSlug: skills.slug,
    })
    .from(battles)
    .innerJoin(intakeCandidates, eq(battles.challengerId, intakeCandidates.id))
    .innerJoin(skills, eq(battles.championSkillId, skills.id))
    .orderBy(desc(battles.createdAt));

  // Extract short names from YAML frontmatter for challengers
  const battlesWithNames = allBattles.map((b) => {
    const nameMatch = b.challengerRawContent.match(
      /^name:\s*["']?(.+?)["']?\s*$/m
    );
    return {
      ...b,
      challengerName:
        nameMatch?.[1] ||
        b.challengerPurpose?.slice(0, 40) ||
        b.challengerSourceUrl ||
        "\u2014",
    };
  });

  // Champion skills (skills with a latest version) for the new battle form
  const championsRaw = await db
    .select({
      id: skills.id,
      slug: skills.slug,
      name: skills.name,
      categoryDomain: skillCategories.domain,
      categoryFunction: skillCategories.function,
      versionId: skillVersions.id,
      version: skillVersions.version,
    })
    .from(skills)
    .innerJoin(
      skillVersions,
      and(
        eq(skillVersions.skillId, skills.id),
        eq(skillVersions.isLatest, true)
      )
    )
    .leftJoin(skillCategories, eq(skills.categoryId, skillCategories.id))
    .orderBy(skills.name);

  const champions = championsRaw.map(({ categoryDomain, categoryFunction, ...rest }) => ({
    ...rest,
    category: formatCategoryLabel(categoryDomain, categoryFunction, null),
  }));

  // Queued/scored candidates available for battle
  const rawCandidates = await db
    .select({
      id: intakeCandidates.id,
      sourceUrl: intakeCandidates.sourceUrl,
      extractedPurpose: intakeCandidates.extractedPurpose,
      rawContent: intakeCandidates.rawContent,
      categoryDomain: skillCategories.domain,
      categoryFunction: skillCategories.function,
      fightScore: intakeCandidates.fightScore,
      status: intakeCandidates.status,
    })
    .from(intakeCandidates)
    .leftJoin(skillCategories, eq(intakeCandidates.categoryId, skillCategories.id))
    .where(eq(intakeCandidates.status, "queued"))
    .orderBy(desc(intakeCandidates.fightScore));

  // Extract short name from YAML frontmatter
  const candidates = rawCandidates.map((c) => {
    const nameMatch = c.rawContent.match(/^name:\s*["']?(.+?)["']?\s*$/m);
    return {
      id: c.id,
      name: nameMatch?.[1] || c.extractedPurpose?.slice(0, 40) || c.sourceUrl || c.id,
      category: formatCategoryLabel(c.categoryDomain, c.categoryFunction, null),
      fightScore: c.fightScore,
      sourceUrl: c.sourceUrl,
    };
  });

  return (
    <>
      <h1 className="font-mono text-2xl text-yellow-500 mb-6">
        {"\u2694"} Battles
      </h1>

      {/* New Battle */}
      <NewBattleForm champions={champions} candidates={candidates} />

      {/* Battle List */}
      <h2 className="font-mono text-sm text-gray-400 uppercase tracking-wider mb-3 mt-8">
        All Battles
      </h2>

      {battlesWithNames.length === 0 ? (
        <p className="font-mono text-sm text-gray-500">
          No battles yet. Create one above or submit candidates via Intake.
        </p>
      ) : (
        <div className="space-y-3">
          {battlesWithNames.map((battle) => (
            <FightCard
              key={battle.id}
              id={battle.id}
              championName={battle.championName}
              challengerName={battle.challengerName}
              status={battle.status}
              verdict={battle.verdict}
              totalLlmCalls={battle.totalLlmCalls}
              totalCostCents={battle.totalCostCents}
            />
          ))}
        </div>
      )}
    </>
  );
}
