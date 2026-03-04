import { NextResponse } from "next/server";
import { validateToken } from "@claudefather/db/auth";
import { createDb } from "@claudefather/db/client";
import { skills, skillVersions } from "@claudefather/db/schema";
import { eq, and } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

// GET /api/skills — list all skills with their latest version content
// Authenticated via Bearer token
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const validated = await validateToken(db, token);
  if (!validated) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const results = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      description: skills.description,
      category: skills.category,
      version: skillVersions.version,
      content: skillVersions.content,
      references: skillVersions.references,
      publishedAt: skillVersions.publishedAt,
    })
    .from(skills)
    .innerJoin(
      skillVersions,
      and(
        eq(skillVersions.skillId, skills.id),
        eq(skillVersions.isLatest, true)
      )
    );

  return NextResponse.json(results);
}
