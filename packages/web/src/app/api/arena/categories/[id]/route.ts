import { createDb } from "@claudiator/db/client";
import { skillCategories } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if ((session as any)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { description, scoringRubric } = body;

  const db = createDb(process.env.DATABASE_URL!);

  if (scoringRubric) {
    if (!scoringRubric.dimensions || scoringRubric.dimensions.length !== 4) {
      return NextResponse.json(
        { error: "Rubric must have exactly 4 dimensions" },
        { status: 400 }
      );
    }
    for (const d of scoringRubric.dimensions) {
      if (!d.key || !d.label || !d.description || d.maxScore !== 25) {
        return NextResponse.json(
          { error: "Each dimension needs key, label, description, and maxScore=25" },
          { status: 400 }
        );
      }
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (description !== undefined) updates.description = description;
  if (scoringRubric !== undefined) updates.scoringRubric = scoringRubric;

  await db.update(skillCategories).set(updates).where(eq(skillCategories.id, id));

  return NextResponse.json({ ok: true });
}
