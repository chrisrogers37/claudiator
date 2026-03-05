import { z } from "zod";
import type { DbClient } from "../lib/db.js";
import { skillFeedback, activityEvents } from "@claudefather/db/schema";

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
  const records = args.ratings.map((r) => ({
    userId: user.id,
    skillSlug: r.skill_slug,
    rating: r.rating,
    comment: r.comment
      ? r.comment.replace(/<[^>]*>/g, "").slice(0, 1000)
      : null,
    sessionId: args.session_id,
  }));

  try {
    await db.insert(skillFeedback).values(records);

    // Log feedback activity events (fire-and-forget)
    const feedbackEvents = records.map((r) => ({
      userId: user.id,
      eventType: "feedback" as const,
      details: {
        skillSlug: r.skillSlug,
        rating: r.rating,
        sessionId: r.sessionId,
      },
    }));
    db.insert(activityEvents)
      .values(feedbackEvents)
      .catch((err: Error) => {
        console.error("[claudefather] feedback event logging error:", err.message);
      });

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
