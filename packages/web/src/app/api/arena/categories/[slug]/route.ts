import { NextRequest, NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import {
  skillCategories,
  skills,
  arenaRankings,
} from "@claudiator/db/schema";
import { eq, desc } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (process.env.ARENA_ENABLED === "false") {
    return NextResponse.json({ error: "Arena disabled" }, { status: 503 });
  }

  const { slug } = await params;

  const [category] = await db
    .select()
    .from(skillCategories)
    .where(eq(skillCategories.slug, slug))
    .limit(1);

  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  // Skills in this category with their rankings
  const categorySkills = await db
    .select({
      skillId: skills.id,
      skillName: skills.name,
      skillSlug: skills.slug,
      skillDescription: skills.description,
      wins: arenaRankings.wins,
      losses: arenaRankings.losses,
      draws: arenaRankings.draws,
      winRate: arenaRankings.winRate,
      eloRating: arenaRankings.eloRating,
      title: arenaRankings.title,
      lastBattleAt: arenaRankings.lastBattleAt,
    })
    .from(skills)
    .leftJoin(arenaRankings, eq(arenaRankings.skillId, skills.id))
    .where(eq(skills.categoryId, category.id))
    .orderBy(desc(arenaRankings.eloRating));

  return NextResponse.json({
    ...category,
    skills: categorySkills,
  });
}
