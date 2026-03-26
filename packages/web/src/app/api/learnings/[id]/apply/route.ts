import { NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { learningSkillLinks, learnings, skills } from "@claudiator/db/schema";
import { eq, and } from "drizzle-orm";
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
  const { skillSlug, action } = await request.json();

  if (!["applied", "rejected"].includes(action)) {
    return NextResponse.json(
      { error: 'action must be "applied" or "rejected"' },
      { status: 400 }
    );
  }

  const [skill] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(eq(skills.slug, skillSlug))
    .limit(1);

  if (!skill) {
    return NextResponse.json(
      { error: "Skill not found" },
      { status: 404 }
    );
  }

  await db
    .update(learningSkillLinks)
    .set({ status: action, updatedAt: new Date() })
    .where(
      and(
        eq(learningSkillLinks.learningId, id),
        eq(learningSkillLinks.skillId, skill.id)
      )
    );

  // If all links for this learning are resolved, update learning status
  const pendingLinks = await db
    .select({ id: learningSkillLinks.id })
    .from(learningSkillLinks)
    .where(
      and(
        eq(learningSkillLinks.learningId, id),
        eq(learningSkillLinks.status, "pending")
      )
    );

  if (pendingLinks.length === 0) {
    const appliedLinks = await db
      .select({ id: learningSkillLinks.id })
      .from(learningSkillLinks)
      .where(
        and(
          eq(learningSkillLinks.learningId, id),
          eq(learningSkillLinks.status, "applied")
        )
      );

    const newStatus = appliedLinks.length > 0 ? "applied" : "dismissed";
    await db
      .update(learnings)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(learnings.id, id));
  }

  return NextResponse.json({ ok: true });
}
