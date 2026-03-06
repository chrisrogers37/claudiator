import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDb } from "@claudefather/db/client";
import { skills, skillVersions } from "@claudefather/db/schema";
import { eq, desc } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

// GET /api/skills/:slug/versions — list all versions for a skill
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  // Get skill ID from slug
  const [skill] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(eq(skills.slug, slug))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const versions = await db
    .select({
      id: skillVersions.id,
      version: skillVersions.version,
      changelog: skillVersions.changelog,
      publishedAt: skillVersions.publishedAt,
      publishedBy: skillVersions.publishedBy,
      isLatest: skillVersions.isLatest,
    })
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.publishedAt));

  return NextResponse.json(versions);
}
