import { createDb } from "@claudiator/db/client";
import {
  battles,
  intakeCandidates,
  skills,
  skillVersions,
  skillCategories,
} from "@claudiator/db/schema";
import { eq, desc, and, sql, count, type SQL } from "drizzle-orm";
import Link from "next/link";
import { extractChallengerName } from "@/lib/arena/extract-challenger-name";
import { NewBattleForm } from "../components/new-battle-form";
import { formatCategoryLabel } from "@/lib/format-category";
import { FightCard } from "../components/fight-card";
import { Pagination } from "../components/pagination";

const PAGE_SIZE = 20;

export default async function BattlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; skill?: string }>;
}) {
  const { page: pageParam, skill: skillParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const db = createDb(process.env.DATABASE_URL!);

  // Build filter conditions
  const battleFilter: SQL | undefined = skillParam
    ? eq(battles.championSkillId, skillParam)
    : undefined;

  // Parallel queries: count, battles, champions, candidates
  const [countResult, allBattles, championsRaw, rawCandidates] = await Promise.all([
    battleFilter
      ? db.select({ total: count() }).from(battles).where(battleFilter)
      : db.select({ total: count() }).from(battles),
    db
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
      .where(battleFilter)
      .orderBy(desc(battles.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
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
    .orderBy(skills.name),
    db
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
      .orderBy(desc(intakeCandidates.fightScore)),
  ]);

  const [{ total }] = countResult;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const battlesWithNames = allBattles.map((b) => ({
    ...b,
    challengerName: extractChallengerName(b.challengerRawContent, b.challengerPurpose, b.challengerSourceUrl || "\u2014"),
  }));

  const champions = championsRaw.map(({ categoryDomain, categoryFunction, ...rest }) => ({
    ...rest,
    category: formatCategoryLabel(categoryDomain, categoryFunction, null),
  }));

  const candidates = rawCandidates.map((c) => ({
    id: c.id,
    name: extractChallengerName(c.rawContent, c.extractedPurpose, c.sourceUrl || c.id),
    category: formatCategoryLabel(c.categoryDomain, c.categoryFunction, null),
    fightScore: c.fightScore,
    sourceUrl: c.sourceUrl,
  }));

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

      {skillParam && (
        <div className="mb-4 flex items-center gap-2">
          <span className="font-mono text-xs text-gray-500">
            Filtered by skill
          </span>
          <Link href="/arena/battles" className="font-mono text-xs text-cyan-400 hover:underline">
            clear
          </Link>
        </div>
      )}

      {battlesWithNames.length === 0 ? (
        <p className="font-mono text-sm text-gray-500">
          No battles yet. Create one above or submit candidates via Intake.
        </p>
      ) : (
        <>
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
                backPath="/arena/battles"
              />
            ))}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/arena/battles"
          />
        </>
      )}
    </>
  );
}
