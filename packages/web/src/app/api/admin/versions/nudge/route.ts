import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDb } from "@claudiator/db/client";
import {
  activityEvents,
  userInstalledVersions,
  skills,
  skillVersions,
} from "@claudiator/db/schema";
import { eq, and, ne } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = (session as any).role;
  const adminUserId = (session as any).userId;
  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { skillSlug } = await request.json();
  if (!skillSlug) {
    return NextResponse.json(
      { error: "skillSlug is required" },
      { status: 400 }
    );
  }

  // Find the latest version for this skill
  const [skill] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(eq(skills.slug, skillSlug));

  if (!skill) {
    return NextResponse.json(
      { error: "Skill not found" },
      { status: 404 }
    );
  }

  const [latest] = await db
    .select({ version: skillVersions.version })
    .from(skillVersions)
    .where(
      and(eq(skillVersions.skillId, skill.id), eq(skillVersions.isLatest, true))
    );

  if (!latest) {
    return NextResponse.json(
      { error: "No latest version found" },
      { status: 404 }
    );
  }

  // Find users not on the latest version
  const outdatedUsers = await db
    .select({ userId: userInstalledVersions.userId })
    .from(userInstalledVersions)
    .where(
      and(
        eq(userInstalledVersions.skillSlug, skillSlug),
        ne(userInstalledVersions.installedVersion, latest.version)
      )
    );

  // Log a nudge event per user
  for (const user of outdatedUsers) {
    await db.insert(activityEvents).values({
      userId: user.userId,
      eventType: "version_nudge",
      skillSlug,
      details: {
        nudgedBy: adminUserId,
        latestVersion: latest.version,
      },
    });
  }

  return NextResponse.json({
    nudged: outdatedUsers.length,
    skillSlug,
    latestVersion: latest.version,
  });
}
