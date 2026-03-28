import { NextRequest, NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { intakeCandidates } from "@claudiator/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");

  const conditions = [];
  if (status) {
    conditions.push(eq(intakeCandidates.status, status as any));
  }
  if (category) {
    conditions.push(eq(intakeCandidates.category, category));
  }

  const items = await db
    .select()
    .from(intakeCandidates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(intakeCandidates.createdAt))
    .limit(100);

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

  const userId = (session as any).userId;
  const { sourceType, sourceUrl, rawContent } = await request.json();

  if (!sourceType || !rawContent) {
    return NextResponse.json(
      { error: "sourceType and rawContent are required" },
      { status: 400 }
    );
  }

  // Check for duplicates via sourceUrl
  if (sourceUrl) {
    const [existing] = await db
      .select({ id: intakeCandidates.id })
      .from(intakeCandidates)
      .where(eq(intakeCandidates.sourceUrl, sourceUrl))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        { error: "Duplicate: a candidate with this sourceUrl already exists", existingId: existing.id },
        { status: 409 }
      );
    }
  }

  const [candidate] = await db
    .insert(intakeCandidates)
    .values({
      sourceType,
      sourceUrl: sourceUrl || null,
      rawContent,
      submittedBy: userId,
    })
    .returning();

  return NextResponse.json(candidate, { status: 201 });
}
