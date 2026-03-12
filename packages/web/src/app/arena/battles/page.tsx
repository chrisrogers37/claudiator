import { createDb } from "@claudiator/db/client";
import {
  battles,
  intakeCandidates,
  skills,
  skillVersions,
} from "@claudiator/db/schema";
import { eq, desc, and } from "drizzle-orm";
import Link from "next/link";
import { BattleStatusBadge } from "../components/battle-status-badge";
import { NewBattleForm } from "../components/new-battle-form";

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
        "—",
    };
  });

  // Champion skills (skills with a latest version) for the new battle form
  const champions = await db
    .select({
      id: skills.id,
      slug: skills.slug,
      name: skills.name,
      category: skills.category,
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
    .orderBy(skills.name);

  // Queued/scored candidates available for battle
  const rawCandidates = await db
    .select({
      id: intakeCandidates.id,
      sourceUrl: intakeCandidates.sourceUrl,
      extractedPurpose: intakeCandidates.extractedPurpose,
      rawContent: intakeCandidates.rawContent,
      category: intakeCandidates.category,
      fightScore: intakeCandidates.fightScore,
      status: intakeCandidates.status,
    })
    .from(intakeCandidates)
    .where(eq(intakeCandidates.status, "queued"))
    .orderBy(desc(intakeCandidates.fightScore));

  // Extract short name from YAML frontmatter
  const candidates = rawCandidates.map((c) => {
    const nameMatch = c.rawContent.match(/^name:\s*["']?(.+?)["']?\s*$/m);
    return {
      id: c.id,
      name: nameMatch?.[1] || c.extractedPurpose?.slice(0, 40) || c.sourceUrl || c.id,
      category: c.category,
      fightScore: c.fightScore,
      sourceUrl: c.sourceUrl,
    };
  });

  return (
    <>
      <h1 className="font-mono text-2xl text-yellow-500 mb-6">Battles</h1>

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
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="text-left text-gray-500 uppercase tracking-wider">
                <th className="pb-2 pr-4">Champion</th>
                <th className="pb-2 pr-4">Challenger</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Verdict</th>
                <th className="pb-2 pr-4">Score</th>
                <th className="pb-2 pr-4">LLM Calls</th>
                <th className="pb-2 pr-4">Cost</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              {battlesWithNames.map((battle) => (
                <tr key={battle.id} className="border-t border-gray-800">
                  <td className="py-3 pr-4">
                    <span className="text-yellow-500">{battle.championName}</span>
                  </td>
                  <td className="py-3 pr-4 max-w-48 truncate">
                    <span className="text-orange-400">
                      {battle.challengerName}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <BattleStatusBadge status={battle.status} />
                  </td>
                  <td className="py-3 pr-4">
                    {battle.verdict ? (
                      <span
                        className={
                          battle.verdict === "champion_wins"
                            ? "text-yellow-500"
                            : battle.verdict === "challenger_wins"
                              ? "text-orange-400"
                              : "text-gray-400"
                        }
                      >
                        {battle.verdict.replace(/_/g, " ")}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {battle.championScore != null && battle.challengerScore != null ? (
                      <span className="text-gray-400">
                        {battle.championScore.toFixed(1)} - {battle.challengerScore.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {battle.totalLlmCalls != null ? (
                      <span className="text-gray-400">{battle.totalLlmCalls}</span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {battle.totalCostCents != null ? (
                      <span className="text-gray-400">
                        ${(battle.totalCostCents / 100).toFixed(3)}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="py-3">
                    <Link
                      href={`/arena/${battle.id}`}
                      className="text-cyan-400 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
