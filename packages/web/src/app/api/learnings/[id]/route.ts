import { NextResponse } from "next/server";
import { createDb } from "@claudiator/db/client";
import { learnings, learningSkillLinks, skills } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [learning] = await db
    .select()
    .from(learnings)
    .where(eq(learnings.id, id))
    .limit(1);

  if (!learning) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const links = await db
    .select({
      linkId: learningSkillLinks.id,
      skillSlug: learningSkillLinks.skillSlug,
      proposedChange: learningSkillLinks.proposedChange,
      status: learningSkillLinks.status,
      skillName: skills.name,
    })
    .from(learningSkillLinks)
    .innerJoin(skills, eq(learningSkillLinks.skillSlug, skills.slug))
    .where(eq(learningSkillLinks.learningId, id));

  return NextResponse.json({ ...learning, skillLinks: links });
}
