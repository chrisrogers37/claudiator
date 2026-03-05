import { z } from "zod";
import type { DbClient } from "../lib/db.js";
import { skills, skillVersions, syncEvents } from "@claudefather/db/schema";
import { eq, and } from "drizzle-orm";

export const syncSchema = z.object({
  skills: z
    .array(
      z.object({
        slug: z.string().describe("Skill directory name"),
        version: z.string().describe("Target version to sync"),
        action: z
          .enum(["update", "install", "remove"])
          .describe("What action to take"),
      })
    )
    .min(1)
    .describe("List of skills to sync with their target versions and actions"),
});

interface SyncedSkill {
  slug: string;
  version: string;
  action: "update" | "install" | "remove";
  files: Record<string, string>;
}

export async function syncSkills(
  db: DbClient,
  user: { id: string },
  args: z.infer<typeof syncSchema>
): Promise<{ content: { type: "text"; text: string }[] }> {
  const synced: SyncedSkill[] = [];
  const errors: { slug: string; error: string }[] = [];

  for (const req of args.skills) {
    if (req.action === "remove") {
      // For removals, just log — don't fetch content
      synced.push({
        slug: req.slug,
        version: req.version,
        action: "remove",
        files: {},
      });
      continue;
    }

    // Find the skill in the registry
    const [skill] = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.slug, req.slug));

    if (!skill) {
      errors.push({ slug: req.slug, error: "Skill not found in registry" });
      continue;
    }

    // Fetch the specific version
    const [version] = await db
      .select({
        version: skillVersions.version,
        content: skillVersions.content,
        references: skillVersions.references,
      })
      .from(skillVersions)
      .where(
        and(
          eq(skillVersions.skillId, skill.id),
          eq(skillVersions.version, req.version)
        )
      );

    if (!version) {
      errors.push({
        slug: req.slug,
        error: `Version ${req.version} not found`,
      });
      continue;
    }

    const files: Record<string, string> = {
      "SKILL.md": version.content,
      ...((version.references as Record<string, string>) || {}),
    };

    synced.push({
      slug: req.slug,
      version: version.version,
      action: req.action,
      files,
    });
  }

  // Log the sync event
  await db
    .insert(syncEvents)
    .values({
      userId: user.id,
      eventType: "sync",
      details: {
        synced: synced.map((s) => ({
          slug: s.slug,
          version: s.version,
          action: s.action,
        })),
        errors,
      },
    })
    .catch((err: Error) => {
      console.error("[claudefather] sync event logging error:", err.message);
    });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          synced,
          errors: errors.length > 0 ? errors : undefined,
          summary: `${synced.length} skill(s) synced. Write each skill's files to ~/.claude/skills/<slug>/<path> and write the version to ~/.claude/skills/<slug>/.version`,
        }),
      },
    ],
  };
}
