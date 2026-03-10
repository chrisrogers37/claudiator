import { NextRequest, NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { battles, intakeCandidates, skills } from "@claudiator/db/schema";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { createBattle } from "@/lib/arena/matchmaker";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  if (process.env.ARENA_ENABLED === "false") {
    return NextResponse.json({ error: "Arena disabled" }, { status: 503 });
  }

  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const query = db
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
      challengerCategory: intakeCandidates.category,
      challengerExtractedPurpose: intakeCandidates.extractedPurpose,
      championSkillName: skills.name,
      championSkillSlug: skills.slug,
    })
    .from(battles)
    .innerJoin(intakeCandidates, eq(battles.challengerId, intakeCandidates.id))
    .innerJoin(skills, eq(battles.championSkillId, skills.id));

  if (status) {
    query.where(eq(battles.status, status as any));
  }

  const items = await query.orderBy(desc(battles.createdAt));

  return NextResponse.json(items);
}

export async function POST(request: NextRequest) {
  if (process.env.ARENA_ENABLED === "false") {
    return NextResponse.json({ error: "Arena disabled" }, { status: 503 });
  }

  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session as any).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { candidateId, championSkillId, championVersionId } =
    await request.json();

  if (!candidateId || !championSkillId || !championVersionId) {
    return NextResponse.json(
      { error: "candidateId, championSkillId, and championVersionId are required" },
      { status: 400 }
    );
  }

  try {
    const battleId = await createBattle(
      db,
      candidateId,
      championSkillId,
      championVersionId,
    );
    return NextResponse.json({ id: battleId }, { status: 201 });
  } catch (err) {
    console.error("[arena] create battle failed:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
