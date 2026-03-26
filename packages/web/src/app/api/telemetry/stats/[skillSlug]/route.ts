import { NextResponse } from "next/server";
import { validateToken } from "@claudiator/db/auth";
import { createDb } from "@claudiator/db/client";
import { skillInvocations, skillFeedback, skills } from "@claudiator/db/schema";
import { eq, count, avg, desc } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ skillSlug: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
  }
  const validated = await validateToken(db, authHeader.slice(7));
  if (!validated) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { skillSlug } = await params;

  const [skill] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(eq(skills.slug, skillSlug))
    .limit(1);

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const [totalInvocations, uniqueUsers, recentFeedback, avgRating] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(skillInvocations)
        .where(eq(skillInvocations.skillId, skill.id))
        .then((r) => r[0]?.count ?? 0),

      db
        .selectDistinct({ userId: skillInvocations.userId })
        .from(skillInvocations)
        .where(eq(skillInvocations.skillId, skill.id))
        .then((r) => r.length),

      db
        .select({
          rating: skillFeedback.rating,
          comment: skillFeedback.comment,
          createdAt: skillFeedback.createdAt,
        })
        .from(skillFeedback)
        .where(eq(skillFeedback.skillId, skill.id))
        .orderBy(desc(skillFeedback.createdAt))
        .limit(10),

      db
        .select({
          avgRating: avg(skillFeedback.rating),
          totalRatings: count(),
        })
        .from(skillFeedback)
        .where(eq(skillFeedback.skillId, skill.id))
        .then((r) => r[0]),
    ]);

  return NextResponse.json({
    skill_slug: skillSlug,
    total_invocations: totalInvocations,
    unique_users: uniqueUsers,
    avg_rating: avgRating?.avgRating
      ? Number(Number(avgRating.avgRating).toFixed(1))
      : null,
    total_ratings: avgRating?.totalRatings ?? 0,
    recent_feedback: recentFeedback,
  });
}
