import { z } from "zod";
import type { DbClient } from "../lib/db.js";
import {
  skills,
  skillVersions,
  userSkillPins,
  activityEvents,
} from "@claudiator/db/schema";
import { eq, and } from "drizzle-orm";

export const unpinSchema = z.object({
  skill_slug: z.string().describe("The skill's directory name"),
});

export async function unpin(
  db: DbClient,
  user: { id: string },
  args: z.infer<typeof unpinSchema>
): Promise<{ content: { type: "text"; text: string }[] }> {
  // Find the skill
  const [skill] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(eq(skills.slug, args.skill_slug));

  if (!skill) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `Skill '${args.skill_slug}' not found in registry`,
          }),
        },
      ],
    };
  }

  // Find existing pin
  const [existingPin] = await db
    .select({
      id: userSkillPins.id,
      pinnedVersion: userSkillPins.pinnedVersion,
    })
    .from(userSkillPins)
    .where(
      and(
        eq(userSkillPins.userId, user.id),
        eq(userSkillPins.skillId, skill.id)
      )
    );

  const wasPinnedAt = existingPin?.pinnedVersion ?? null;

  if (existingPin) {
    await db
      .delete(userSkillPins)
      .where(eq(userSkillPins.id, existingPin.id));
  }

  // Get the latest version
  const [latest] = await db
    .select({ version: skillVersions.version })
    .from(skillVersions)
    .where(
      and(
        eq(skillVersions.skillId, skill.id),
        eq(skillVersions.isLatest, true)
      )
    );

  // Log unpin event
  await db
    .insert(activityEvents)
    .values({
      userId: user.id,
      eventType: "unpin",
      details: {
        slug: args.skill_slug,
        was_pinned_at: wasPinnedAt,
        latest_version: latest?.version ?? null,
      },
    })
    .catch((err: Error) => {
      console.error("[claudiator] unpin event logging error:", err.message);
    });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          slug: args.skill_slug,
          was_pinned_at: wasPinnedAt,
          latest_version: latest?.version ?? null,
        }),
      },
    ],
  };
}
