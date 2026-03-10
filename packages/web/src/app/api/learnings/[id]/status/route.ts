import { NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { learnings } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

const db = createDb(process.env.DATABASE_URL!);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { status } = await request.json();

  if (!["new", "reviewed", "applied", "dismissed"].includes(status)) {
    return NextResponse.json(
      { error: 'status must be "new", "reviewed", "applied", or "dismissed"' },
      { status: 400 }
    );
  }

  await db
    .update(learnings)
    .set({ status, updatedAt: new Date() })
    .where(eq(learnings.id, id));

  return NextResponse.json({ ok: true });
}
