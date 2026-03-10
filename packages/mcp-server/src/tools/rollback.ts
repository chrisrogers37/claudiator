import { z } from "zod";
import type { DbClient } from "../lib/db.js";
import { skills, skillVersions, activityEvents } from "@claudiator/db/schema";
import { eq, and, desc, lt } from "drizzle-orm";

export const rollbackSchema = z.object({
  skill_slug: z.string().describe("The skill's directory name"),
  target_version: z
    .string()
    .describe("Semver string or 'previous' for one version back"),
});

export async function rollback(
  db: DbClient,
  user: { id: string },
  args: z.infer<typeof rollbackSchema>
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

  // Get current latest version
  const [currentLatest] = await db
    .select({ version: skillVersions.version })
    .from(skillVersions)
    .where(
      and(
        eq(skillVersions.skillId, skill.id),
        eq(skillVersions.isLatest, true)
      )
    );

  let targetVersion:
    | {
        version: string;
        content: string;
        references: Record<string, string> | null;
      }
    | undefined;

  if (args.target_version === "previous") {
    // Find the version just before the current latest
    if (!currentLatest) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `No versions found for '${args.skill_slug}'`,
            }),
          },
        ],
      };
    }

    const [prev] = await db
      .select({
        version: skillVersions.version,
        content: skillVersions.content,
        references: skillVersions.references,
      })
      .from(skillVersions)
      .where(
        and(
          eq(skillVersions.skillId, skill.id),
          lt(skillVersions.publishedAt, new Date())
        )
      )
      .orderBy(desc(skillVersions.publishedAt))
      .offset(1)
      .limit(1);

    if (!prev) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `No previous version found for '${args.skill_slug}'. Only one version exists.`,
            }),
          },
        ],
      };
    }

    targetVersion = prev;
  } else {
    // Find the specific version
    const [specific] = await db
      .select({
        version: skillVersions.version,
        content: skillVersions.content,
        references: skillVersions.references,
      })
      .from(skillVersions)
      .where(
        and(
          eq(skillVersions.skillId, skill.id),
          eq(skillVersions.version, args.target_version)
        )
      );

    if (!specific) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `Version '${args.target_version}' not found for '${args.skill_slug}'`,
            }),
          },
        ],
      };
    }

    targetVersion = specific;
  }

  const files: Record<string, string> = {
    "SKILL.md": targetVersion.content,
    ...(targetVersion.references || {}),
  };

  // Log the rollback event
  await db
    .insert(activityEvents)
    .values({
      userId: user.id,
      eventType: "rollback",
      details: {
        slug: args.skill_slug,
        from_version: currentLatest?.version ?? "unknown",
        to_version: targetVersion.version,
      },
    })
    .catch((err: Error) => {
      console.error("[claudiator] rollback event logging error:", err.message);
    });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          slug: args.skill_slug,
          version: targetVersion.version,
          previous_version: currentLatest?.version ?? null,
          files,
        }),
      },
    ],
  };
}
