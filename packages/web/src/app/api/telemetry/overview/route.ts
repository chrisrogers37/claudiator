import { NextResponse } from "next/server";
import { validateToken } from "@claudefather/db/auth";
import { createDb } from "@claudefather/db/client";
import { skillInvocations, skillFeedback } from "@claudefather/db/schema";
import { count, desc, gte, avg, sql } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
  }
  const validated = await validateToken(db, authHeader.slice(7));
  if (!validated) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [topSkills, totalInvocations30d, activeUsers30d, lowestRated] =
    await Promise.all([
      db
        .select({
          skillSlug: skillInvocations.skillSlug,
          invocationCount: count(),
        })
        .from(skillInvocations)
        .where(gte(skillInvocations.invokedAt, thirtyDaysAgo))
        .groupBy(skillInvocations.skillSlug)
        .orderBy(desc(count()))
        .limit(10),

      db
        .select({ count: count() })
        .from(skillInvocations)
        .where(gte(skillInvocations.invokedAt, thirtyDaysAgo))
        .then((r) => r[0]?.count ?? 0),

      db
        .selectDistinct({ userId: skillInvocations.userId })
        .from(skillInvocations)
        .where(gte(skillInvocations.invokedAt, thirtyDaysAgo))
        .then((r) => r.length),

      db
        .select({
          skillSlug: skillFeedback.skillSlug,
          avgRating: avg(skillFeedback.rating),
          ratingCount: count(),
        })
        .from(skillFeedback)
        .groupBy(skillFeedback.skillSlug)
        .having(sql`count(*) >= 3`)
        .orderBy(avg(skillFeedback.rating))
        .limit(5),
    ]);

  return NextResponse.json({
    period: "30d",
    total_invocations: totalInvocations30d,
    active_users: activeUsers30d,
    top_skills: topSkills.map((s) => ({
      skill_slug: s.skillSlug,
      invocation_count: s.invocationCount,
    })),
    lowest_rated: lowestRated,
  });
}
