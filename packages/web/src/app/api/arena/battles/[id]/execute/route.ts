import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDb } from "@claudiator/db/client";
import { battles } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { executeBattle } from "@/lib/arena/executor";

const db = createDb(process.env.DATABASE_URL!);

export async function POST(
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

  const role = (session as any).role;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Idempotency guard — only execute pending battles
  const [battle] = await db
    .select({ status: battles.status })
    .from(battles)
    .where(eq(battles.id, id));

  if (!battle) {
    return NextResponse.json({ error: "Battle not found" }, { status: 404 });
  }

  if (battle.status !== "pending") {
    return NextResponse.json(
      { error: `Battle is already ${battle.status}`, battleId: id },
      { status: 409 }
    );
  }

  try {
    await executeBattle(db, id);
    return NextResponse.json({ ok: true, battleId: id });
  } catch (err) {
    console.error("[arena] execute battle failed:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
