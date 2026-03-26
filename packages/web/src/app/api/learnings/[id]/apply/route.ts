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

  // Resolve slug to skillId
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

  // Read all link state before batching (neon-http batch doesn't support
  // interactive reads, so we compute target state in JS first)
  const allLinks = await db
    .select({ skillId: learningSkillLinks.skillId, status: learningSkillLinks.status })
    .from(learningSkillLinks)
    .where(eq(learningSkillLinks.learningId, id));

  const updatedLinks = allLinks.map((link) =>
    link.skillId === skill.id ? { ...link, status: action } : link
  );
  const hasPending = updatedLinks.some((l) => l.status === "pending");
  const hasApplied = updatedLinks.some((l) => l.status === "applied");

  // Atomically update link status and (if all resolved) learning status.
  const updateLink = db
    .update(learningSkillLinks)
    .set({ status: action, updatedAt: new Date() })
    .where(
      and(
        eq(learningSkillLinks.learningId, id),
        eq(learningSkillLinks.skillId, skill.id)
      )
    );

  if (!hasPending) {
    const newStatus = hasApplied ? "applied" : "dismissed";
    await db.batch([
      updateLink,
      db.update(learnings)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(learnings.id, id)),
    ]);
  } else {
    await updateLink;
  }

  return NextResponse.json({ ok: true });
}
