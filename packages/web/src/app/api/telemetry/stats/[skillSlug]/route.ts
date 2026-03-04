import { NextResponse } from "next/server";
import { validateToken } from "@claudefather/db/auth";
import { createDb } from "@claudefather/db/client";
import { skillInvocations, skillFeedback } from "@claudefather/db/schema";
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

  const [totalInvocations, uniqueUsers, recentFeedback, avgRating] =
    await Promise.all([
      db
        .select({ count: count() })
        .from(skillInvocations)
        .where(eq(skillInvocations.skillSlug, skillSlug))
        .then((r) => r[0]?.count ?? 0),

      db
        .selectDistinct({ userId: skillInvocations.userId })
        .from(skillInvocations)
        .where(eq(skillInvocations.skillSlug, skillSlug))
        .then((r) => r.length),

      db
        .select({
          rating: skillFeedback.rating,
          comment: skillFeedback.comment,
          createdAt: skillFeedback.createdAt,
        })
        .from(skillFeedback)
        .where(eq(skillFeedback.skillSlug, skillSlug))
        .orderBy(desc(skillFeedback.createdAt))
        .limit(10),

      db
        .select({
          avgRating: avg(skillFeedback.rating),
          totalRatings: count(),
        })
        .from(skillFeedback)
        .where(eq(skillFeedback.skillSlug, skillSlug))
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
