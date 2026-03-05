import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createDb } from "@claudefather/db/client";
import { activityEvents, skills } from "@claudefather/db/schema";
import { eq } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  const session = await auth();
  if (!(session as any)?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(session as any).isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { skillSlug, userIds } = (await request.json()) as {
    skillSlug: string;
    userIds: string[];
  };

  if (!skillSlug || !userIds?.length) {
    return NextResponse.json(
      { error: "skillSlug and userIds[] are required" },
      { status: 400 }
    );
  }

  // Verify skill exists
  const [skill] = await db
    .select({ id: skills.id, name: skills.name })
    .from(skills)
    .where(eq(skills.slug, skillSlug));

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  // Record nudge events (one per user)
  const nudgeEvents = userIds.map((userId) => ({
    eventType: "version_nudge" as const,
    userId,
    details: {
      skillSlug,
      nudgedBy: (session as any).userId,
    },
  }));

  await db.insert(activityEvents).values(nudgeEvents);

  return NextResponse.json({
    success: true,
    nudgedCount: userIds.length,
    skillName: skill.name,
  });
}
