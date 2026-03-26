import { z } from "zod";
import type { DbClient } from "../lib/db.js";
import { skills, skillVersions } from "@claudiator/db/schema";
import { publishNewVersion } from "@claudiator/db/publish";
import { eq, and } from "drizzle-orm";

export const publishSchema = z.object({
  skill_slug: z.string().describe("The skill's directory name"),
  version: z
    .string()
    .optional()
    .describe("Explicit semver string for the new version"),
  bump_type: z
    .enum(["patch", "minor", "major"])
    .optional()
    .describe(
      "Auto-bump from current latest. Ignored if 'version' is provided."
    ),
  changelog: z
    .string()
    .optional()
    .describe("Human-readable changelog entry for this version"),
  files: z
    .record(z.string())
    .describe(
      "Map of relative file paths to content. Must include 'SKILL.md'."
    ),
});

function bumpVersion(
  current: string,
  type: "patch" | "minor" | "major"
): string {
  const [maj, min, pat] = current.split(".").map(Number);
  switch (type) {
    case "major":
      return `${maj + 1}.0.0`;
    case "minor":
      return `${maj}.${min + 1}.0`;
    case "patch":
      return `${maj}.${min}.${pat + 1}`;
  }
}

export async function publish(
  db: DbClient,
  user: { id: string; role: string },
  args: z.infer<typeof publishSchema>
): Promise<{ content: { type: "text"; text: string }[] }> {
  // Admin check
  if (user.role !== "admin") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "Publishing requires admin privileges",
          }),
        },
      ],
    };
  }

  if (!args.files["SKILL.md"]) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "files must include 'SKILL.md'",
          }),
        },
      ],
    };
  }

  // Find or create the skill
  let [skill] = await db
    .select({ id: skills.id })
    .from(skills)
    .where(eq(skills.slug, args.skill_slug));

  if (!skill) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `Skill '${args.skill_slug}' not found in registry. Create it first.`,
          }),
        },
      ],
    };
  }

  // Get current latest version
  const [currentLatest] = await db
    .select({
      id: skillVersions.id,
      version: skillVersions.version,
    })
    .from(skillVersions)
    .where(
      and(
        eq(skillVersions.skillId, skill.id),
        eq(skillVersions.isLatest, true)
      )
    );

  // Determine the new version
  let newVersion: string;
  if (args.version) {
    newVersion = args.version;
  } else if (args.bump_type && currentLatest) {
    newVersion = bumpVersion(currentLatest.version, args.bump_type);
  } else if (args.bump_type && !currentLatest) {
    newVersion = "1.0.0";
  } else {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error:
              "Either 'version' or 'bump_type' must be provided",
          }),
        },
      ],
    };
  }

  // Split files into content and references
  const skillContent = args.files["SKILL.md"];
  const references: Record<string, string> = {};
  for (const [path, content] of Object.entries(args.files)) {
    if (path !== "SKILL.md") {
      references[path] = content;
    }
  }

  // Atomically unset old latest, insert new version, update skill timestamp
  const created = await publishNewVersion(db, {
    skillId: skill.id,
    version: newVersion,
    content: skillContent,
    references: Object.keys(references).length > 0 ? references : null,
    changelog: args.changelog ?? null,
    publishedBy: user.id,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          slug: args.skill_slug,
          version: created.version,
          previous_version: currentLatest?.version ?? null,
          changelog: args.changelog ?? null,
          published_at: created.publishedAt,
        }),
      },
    ],
  };
}
