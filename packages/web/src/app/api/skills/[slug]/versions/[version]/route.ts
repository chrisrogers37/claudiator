import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDb } from "@claudiator/db/client";
import { skills, skillVersions } from "@claudiator/db/schema";
import { eq, and } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

// GET /api/skills/:slug/versions/:version — get a specific version's content
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; version: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, version } = await params;

  // Get skill ID from slug
  const [skill] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(eq(skills.slug, slug))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const [result] = await db
    .select()
    .from(skillVersions)
    .where(
      and(
        eq(skillVersions.skillId, skill.id),
        eq(skillVersions.version, version)
      )
    )
    .limit(1);

  if (!result) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
