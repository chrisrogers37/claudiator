import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDb } from "@claudiator/db/client";
import { skillVersions, skills } from "@claudiator/db/schema";
import { publishNewVersion, promoteVersion } from "@claudiator/db/publish";
import { eq, and } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

// POST /api/skills/:slug/publish — publish a draft or rollback to an old version
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const userId = (session as any).userId as string;

  // Get the skill
  const [skill] = await db
    .select()
    .from(skills)
    .where(eq(skills.slug, slug))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  if (body.rollbackFromVersionId) {
    // Rollback: copy old version content into a new version and mark as latest
    const [oldVersion] = await db
      .select()
      .from(skillVersions)
      .where(eq(skillVersions.id, body.rollbackFromVersionId))
      .limit(1);

    if (!oldVersion) {
      return NextResponse.json(
        { error: "Version not found" },
        { status: 404 }
      );
    }

    // Get current latest to derive next semver
    const [currentLatest] = await db
      .select()
      .from(skillVersions)
      .where(
        and(
          eq(skillVersions.skillId, skill.id),
          eq(skillVersions.isLatest, true)
        )
      )
      .limit(1);

    const nextVersion = bumpMinor(currentLatest?.version ?? "0.0.0");

    // Atomically unset old latest, insert new version, update skill timestamp
    await publishNewVersion(db, {
      skillId: skill.id,
      version: nextVersion,
      content: oldVersion.content,
      references: oldVersion.references,
      changelog: `Rollback to v${oldVersion.version}`,
      publishedBy: userId,
    });

    return NextResponse.json({ ok: true, version: nextVersion });
  }

  if (body.versionId) {
    // Atomically promote a specific version (draft) to latest
    await promoteVersion(db, {
      skillId: skill.id,
      versionId: body.versionId,
      changelog: body.changelog,
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json(
    { error: "Provide versionId or rollbackFromVersionId" },
    { status: 400 }
  );
}

function bumpMinor(version: string): string {
  const parts = version.split(".");
  if (parts.length !== 3) return "0.1.0";
  const minor = parseInt(parts[1], 10);
  return `${parts[0]}.${isNaN(minor) ? 1 : minor + 1}.0`;
}
