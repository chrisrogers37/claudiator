import { NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import {
  battles,
  battleScenarios,
  battleRounds,
  battleJudgments,
  intakeCandidates,
  skills,
} from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.ARENA_ENABLED === "false") {
    return NextResponse.json({ error: "Arena disabled" }, { status: 503 });
  }

  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Get battle with challenger and champion info
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
    .where(eq(battles.id, id))
    .limit(1);

  if (!battle) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get scenarios
  const scenarios = await db
    .select()
    .from(battleScenarios)
    .where(eq(battleScenarios.battleId, id));

  // Get rounds
  const rounds = await db
    .select()
    .from(battleRounds)
    .where(eq(battleRounds.battleId, id));

  // Get judgments for all rounds
  const roundIds = rounds.map((r) => r.id);
  let judgments: (typeof battleJudgments.$inferSelect)[] = [];
  if (roundIds.length > 0) {
    const allJudgments = await Promise.all(
      roundIds.map((roundId) =>
        db
          .select()
          .from(battleJudgments)
          .where(eq(battleJudgments.roundId, roundId))
      )
    );
    judgments = allJudgments.flat();
  }

  // Nest rounds under scenarios, judgments under rounds
  const scenariosWithRounds = scenarios.map((scenario) => {
    const scenarioRounds = rounds
      .filter((r) => r.scenarioId === scenario.id)
      .map((round) => ({
        ...round,
        judgments: judgments.filter((j) => j.roundId === round.id),
      }));

    return {
      ...scenario,
      rounds: scenarioRounds,
    };
  });

  return NextResponse.json({
    ...battle,
    scenarios: scenariosWithRounds,
  });
}
