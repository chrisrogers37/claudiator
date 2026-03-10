import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDb } from "@claudiator/db/client";
import { categorizeCandidate } from "@/lib/arena/intake";

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

  try {
    await categorizeCandidate(db, id);
    return NextResponse.json({ ok: true, candidateId: id });
  } catch (err) {
    console.error("[arena] categorize failed:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
