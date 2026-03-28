import { createDb } from "@claudiator/db/client";
import {
  skillCategories,
  skills,
  arenaRankings,
} from "@claudiator/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import Link from "next/link";

export default async function CategoriesPage() {
  const db = createDb(process.env.DATABASE_URL!);

  // All categories ordered by skill count
  const categories = await db
    .select({
      id: skillCategories.id,
      domain: skillCategories.domain,
      function: skillCategories.function,
      description: skillCategories.description,
      slug: skillCategories.slug,
      skillCount: skillCategories.skillCount,
    })
    .from(skillCategories)
    .orderBy(desc(skillCategories.skillCount));

  // For each category, get the top-ranked skill (highest ELO)
  const topSkills = await db
    .select({
      categoryId: arenaRankings.categoryId,
      skillName: skills.name,
      eloRating: arenaRankings.eloRating,
    })
    .from(arenaRankings)
    .innerJoin(skills, eq(arenaRankings.skillId, skills.id))
    .where(
      sql`${arenaRankings.categoryId} is not null`
    )
    .orderBy(desc(arenaRankings.eloRating));

  // Build a map: categoryId -> top skill name
  const championMap = new Map<string, string>();
  for (const ts of topSkills) {
    if (ts.categoryId && !championMap.has(ts.categoryId)) {
      championMap.set(ts.categoryId, ts.skillName);
    }
  }

  return (
    <>
      <h1 className="font-mono text-2xl text-yellow-500 mb-2">Categories</h1>
      <p className="font-mono text-sm text-gray-500 mb-6">
        Skill domains and functions across the arena
      </p>

      {categories.length === 0 ? (
        <p className="font-mono text-sm text-gray-500">
          No categories yet. Categories are created when skills are submitted
          through intake.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => {
            const champion = championMap.get(cat.id);
            return (
              <Link
                key={cat.id}
                href={`/arena/categories/${cat.slug}`}
                className="group rounded-lg border border-gray-800 bg-[#161b22] p-5 hover:border-yellow-500/40 transition-colors"
              >
                {/* Domain / Function */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="rounded bg-yellow-500/10 border border-yellow-500/30 px-2 py-0.5 font-mono text-[10px] text-yellow-500 uppercase tracking-wider">
                    {cat.domain}
                  </span>
                  <span className="font-mono text-xs text-gray-600">/</span>
                  <span className="rounded bg-gray-800 border border-gray-700 px-2 py-0.5 font-mono text-[10px] text-gray-400 uppercase tracking-wider">
                    {cat.function}
                  </span>
                </div>

                {/* Description */}
                {cat.description && (
                  <p className="font-mono text-xs text-gray-400 mb-3 line-clamp-2">
                    {cat.description}
                  </p>
                )}

                {/* Footer: skill count + champion */}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-800/50">
                  <span className="font-mono text-xs text-gray-500">
                    {cat.skillCount} skill{cat.skillCount !== 1 ? "s" : ""}
                  </span>
                  {champion ? (
                    <span className="font-mono text-xs text-yellow-500 truncate ml-2">
                      {champion}
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-gray-600">
                      no champion
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
