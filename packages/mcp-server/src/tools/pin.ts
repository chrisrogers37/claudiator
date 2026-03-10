import { z } from "zod";
import type { DbClient } from "../lib/db.js";
import {
  skills,
  skillVersions,
  userSkillPins,
  activityEvents,
} from "@claudiator/db/schema";
import { eq, and } from "drizzle-orm";

export const pinSchema = z.object({
  skill_slug: z.string().describe("The skill's directory name"),
  version: z
    .string()
    .optional()
    .describe(
      "Semver string to pin to. If omitted, pins to user's current installed version (requires a pin record to exist or defaults to latest)."
    ),
});

export async function pin(
  db: DbClient,
  user: { id: string },
  args: z.infer<typeof pinSchema>
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

  // Get the latest version for reference
  const [latest] = await db
    .select({ version: skillVersions.version })
    .from(skillVersions)
    .where(
      and(
        eq(skillVersions.skillId, skill.id),
        eq(skillVersions.isLatest, true)
      )
    );

  const pinnedVersion = args.version ?? latest?.version ?? "0.0.0";

  // Upsert the pin record
  const [existing] = await db
    .select({ id: userSkillPins.id })
    .from(userSkillPins)
    .where(
      and(
        eq(userSkillPins.userId, user.id),
        eq(userSkillPins.skillId, skill.id)
      )
    );

  if (existing) {
    await db
      .update(userSkillPins)
      .set({ pinnedVersion })
      .where(eq(userSkillPins.id, existing.id));
  } else {
    await db.insert(userSkillPins).values({
      userId: user.id,
      skillId: skill.id,
      pinnedVersion,
    });
  }

  // Log pin event
  await db
    .insert(activityEvents)
    .values({
      userId: user.id,
      eventType: "pin",
      details: {
        slug: args.skill_slug,
        pinned_version: pinnedVersion,
        latest_version: latest?.version ?? null,
      },
    })
    .catch((err: Error) => {
      console.error("[claudiator] pin event logging error:", err.message);
    });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          slug: args.skill_slug,
          pinned_version: pinnedVersion,
          latest_version: latest?.version ?? null,
        }),
      },
    ],
  };
}
