import { NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { intakeCandidates } from "@claudiator/db/schema";
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

  const [candidate] = await db
    .select()
    .from(intakeCandidates)
    .where(eq(intakeCandidates.id, id))
    .limit(1);

  if (!candidate) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(candidate);
}

export async function PATCH(
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
  const { status } = await request.json();

  const validStatuses = [
    "new",
    "categorized",
    "scored",
    "queued",
    "battling",
    "promoted",
    "rejected",
    "dismissed",
  ] as const;

  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(intakeCandidates)
    .set({ status, updatedAt: new Date() })
    .where(eq(intakeCandidates.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}
