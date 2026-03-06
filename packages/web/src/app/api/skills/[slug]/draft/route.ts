import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDb } from "@claudefather/db/client";
import { skillVersions } from "@claudefather/db/schema";
import { eq, and } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

// PUT /api/skills/:slug/draft — save or update a draft version
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const body = await request.json();
  const { content, skillId } = body;

  if (typeof content !== "string" || typeof skillId !== "string") {
    return NextResponse.json(
      { error: "content and skillId must be strings" },
      { status: 400 }
    );
  }

  const userId = (session as any).userId as string;

  // Get the latest version to derive next semver
  const [latest] = await db
    .select()
    .from(skillVersions)
    .where(
      and(
        eq(skillVersions.skillId, skillId),
        eq(skillVersions.isLatest, true)
      )
    )
    .limit(1);

  const nextVersion = bumpPatch(latest?.version ?? "0.0.0");

  // Create a new non-latest version as the draft
  // (drafts are versions where isLatest = false, not yet published)
  await db.insert(skillVersions).values({
    skillId,
    version: nextVersion,
    content,
    changelog: "Draft",
    publishedBy: userId,
    isLatest: false,
  });

  return NextResponse.json({ ok: true, version: nextVersion });
}

function bumpPatch(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) return "0.0.1";
  const patch = parseInt(parts[2], 10);
  return `${parts[0]}.${parts[1]}.${isNaN(patch) ? 1 : patch + 1}`;
}
