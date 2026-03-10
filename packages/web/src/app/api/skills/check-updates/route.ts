import { NextResponse } from "next/server";
import { validateToken } from "@claudiator/db/auth";
import { createDb } from "@claudiator/db/client";
import { skills, skillVersions } from "@claudiator/db/schema";
import { eq, and } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export async function POST(request: Request) {
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

  const body = await request.json();
  const installed: { slug: string; version: string }[] = body.installed || [];

  const updates = [];

  for (const { slug, version } of installed) {
    const [latest] = await db
      .select({
        version: skillVersions.version,
        changelog: skillVersions.changelog,
      })
      .from(skills)
      .innerJoin(
        skillVersions,
        and(
          eq(skillVersions.skillId, skills.id),
          eq(skillVersions.isLatest, true)
        )
      )
      .where(eq(skills.slug, slug));

    if (latest && latest.version !== version) {
      updates.push({
        slug,
        currentVersion: version,
        latestVersion: latest.version,
        changelog: latest.changelog,
      });
    }
  }

  return NextResponse.json(updates);
}
