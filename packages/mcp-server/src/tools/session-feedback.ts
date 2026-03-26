import { z } from "zod";
import type { DbClient } from "../lib/db.js";
import { skillFeedback, skills } from "@claudiator/db/schema";
import { eq, inArray } from "drizzle-orm";

export const sessionFeedbackSchema = z.object({
  session_id: z
    .string()
    .describe("The Claude Code session identifier"),
  ratings: z
    .array(
      z.object({
        skill_slug: z.string(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().optional(),
      })
    )
    .min(1)
    .describe("Array of skill ratings from this session"),
});

export async function sessionFeedback(
  db: DbClient,
  user: { id: string },
  args: z.infer<typeof sessionFeedbackSchema>
): Promise<{ content: { type: "text"; text: string }[] }> {
  // Resolve all skill slugs to IDs in a single query
  const slugs = args.ratings.map((r) => r.skill_slug);
  const skillRows = await db
    .select({ id: skills.id, slug: skills.slug })
    .from(skills)
    .where(inArray(skills.slug, slugs));
  const slugToId = new Map(skillRows.map((s) => [s.slug, s.id]));

  const missingSkills = slugs.filter((s) => !slugToId.has(s));
  if (missingSkills.length > 0) {
    return {
      content: [{
        type: "text" as const,
        text: `Unknown skill slug(s): ${missingSkills.join(", ")}`,
      }],
    };
  }

  const records = args.ratings.map((r) => ({
    userId: user.id,
    skillId: slugToId.get(r.skill_slug)!,
    skillSlug: r.skill_slug,
    rating: r.rating,
    comment: r.comment
      ? r.comment.replace(/<[^>]*>/g, "").slice(0, 1000)
      : null,
    sessionId: args.session_id,
  }));

  try {
    await db.insert(skillFeedback).values(records);
    return {
      content: [{
        type: "text" as const,
        text: `Feedback submitted for ${records.length} skill(s). Thank you!`,
      }],
    };
  } catch (err) {
    return {
      content: [{
        type: "text" as const,
        text: `Failed to submit feedback: ${(err as Error).message}`,
      }],
    };
  }
}
