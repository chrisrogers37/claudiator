import { NextRequest, NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { arenaRankings, skills, skillCategories } from "@claudiator/db/schema";
import { desc, eq } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  if (process.env.ARENA_ENABLED === "false") {
    return NextResponse.json({ error: "Arena disabled" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const query = db
    .select({
      id: arenaRankings.id,
      skillId: arenaRankings.skillId,
      categoryDomain: skillCategories.domain,
      categoryFunction: skillCategories.function,
      wins: arenaRankings.wins,
      losses: arenaRankings.losses,
      draws: arenaRankings.draws,
      winRate: arenaRankings.winRate,
      eloRating: arenaRankings.eloRating,
      title: arenaRankings.title,
      lastBattleAt: arenaRankings.lastBattleAt,
      updatedAt: arenaRankings.updatedAt,
      skillName: skills.name,
      skillSlug: skills.slug,
      skillDescription: skills.description,
    })
    .from(arenaRankings)
    .innerJoin(skills, eq(arenaRankings.skillId, skills.id))
    .leftJoin(skillCategories, eq(arenaRankings.categoryId, skillCategories.id));

  if (category) {
    query.where(eq(arenaRankings.categoryId, category));
  }

  const items = await query.orderBy(desc(arenaRankings.eloRating)).limit(100);

  return NextResponse.json(items);
}
