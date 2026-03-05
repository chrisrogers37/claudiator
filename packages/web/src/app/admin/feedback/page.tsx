import { createDb } from "@claudefather/db/client";
import {
  skillFeedback,
  users,
  skills,
  skillVersions,
} from "@claudefather/db/schema";
import { eq, desc } from "drizzle-orm";
import { FeedbackList } from "./feedback-list";

const db = createDb(process.env.DATABASE_URL!);

export default async function FeedbackPage() {
  // Fetch all feedback with user info
  const feedback = await db
    .select({
      id: skillFeedback.id,
      skillSlug: skillFeedback.skillSlug,
      skillVersion: skillFeedback.skillVersion,
      userId: skillFeedback.userId,
      rating: skillFeedback.rating,
      comment: skillFeedback.comment,
      status: skillFeedback.status,
      resolvedByVersionId: skillFeedback.resolvedByVersionId,
      createdAt: skillFeedback.createdAt,
      githubUsername: users.githubUsername,
    })
    .from(skillFeedback)
    .innerJoin(users, eq(users.id, skillFeedback.userId))
    .orderBy(desc(skillFeedback.createdAt));

  // Look up skill names and resolved versions
  const enriched = await Promise.all(
    feedback.map(async (item) => {
      const [skill] = await db
        .select({ name: skills.name })
        .from(skills)
        .where(eq(skills.slug, item.skillSlug));

      let resolvedByVersion: string | null = null;
      if (item.resolvedByVersionId) {
        const [version] = await db
          .select({ version: skillVersions.version })
          .from(skillVersions)
          .where(eq(skillVersions.id, item.resolvedByVersionId));
        resolvedByVersion = version?.version ?? null;
      }

      return {
        id: item.id,
        skillSlug: item.skillSlug,
        skillName: skill?.name ?? item.skillSlug,
        githubUsername: item.githubUsername,
        rating: item.rating,
        comment: item.comment,
        status: item.status,
        resolvedByVersion,
        createdAt: item.createdAt.toISOString(),
      };
    })
  );

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-2xl text-green-400">Feedback Triage</h1>
      <FeedbackList feedback={enriched} />
    </div>
  );
}
