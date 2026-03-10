import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDb } from "@claudiator/db/client";
import { battles } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { shouldEvolve, generateEvolvedVersion } from "@/lib/arena/evolution";

const db = createDb(process.env.DATABASE_URL!);

export async function POST(request: Request) {
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

  const { battleId } = await request.json();

  if (!battleId) {
    return NextResponse.json(
      { error: "battleId is required" },
      { status: 400 }
    );
  }

  try {
    const [battle] = await db
      .select()
      .from(battles)
      .where(eq(battles.id, battleId));

    if (!battle) {
      return NextResponse.json({ error: "Battle not found" }, { status: 404 });
    }

    if (battle.status !== "complete") {
      return NextResponse.json(
        { error: "Battle must be complete to evolve" },
        { status: 422 }
      );
    }

    const eligible = shouldEvolve(
      battle.championScore ?? 0,
      battle.challengerScore ?? 0,
      battle.verdict ?? ""
    );

    if (!eligible) {
      return NextResponse.json(
        { error: "Battle is not eligible for evolution (not close enough)" },
        { status: 422 }
      );
    }

    const evolutionBattleId = await generateEvolvedVersion(db, battleId);
    return NextResponse.json({
      ok: true,
      battleId,
      evolutionBattleId,
    });
  } catch (err) {
    console.error("[arena] evolution failed:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
