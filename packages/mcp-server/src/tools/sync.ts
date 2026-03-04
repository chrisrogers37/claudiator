import type { DbClient } from "../lib/db.js";
import { skills, skillVersions } from "@claudefather/db/schema";
import { eq, and } from "drizzle-orm";

interface SyncArgs {
  dryRun?: boolean;
  skills?: string[];
}

interface SyncedSkill {
  slug: string;
  version: string;
  action: "install" | "update";
  files: Record<string, string>;
}

export async function syncSkills(
  db: DbClient,
  user: { id: string },
  args: SyncArgs
): Promise<{ content: { type: "text"; text: string }[] }> {
  // Fetch all skills with their latest versions
  const allSkills = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      description: skills.description,
      version: skillVersions.version,
      content: skillVersions.content,
      references: skillVersions.references,
      changelog: skillVersions.changelog,
    })
    .from(skills)
    .innerJoin(
      skillVersions,
      and(
        eq(skillVersions.skillId, skills.id),
        eq(skillVersions.isLatest, true)
      )
    );

  // Filter to requested skills if specified
  const targetSkills = args.skills
    ? allSkills.filter((s) => args.skills!.includes(s.slug))
    : allSkills;

  if (targetSkills.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: args.skills
            ? `No matching skills found for: ${args.skills.join(", ")}`
            : "No skills available in the registry.",
        },
      ],
    };
  }

  if (args.dryRun) {
    // Return summary only, no content
    const summary = targetSkills.map(
      (s) => `  ${s.slug} v${s.version} — ${s.description}`
    );
    return {
      content: [{
        type: "text" as const,
        text: `=== Available Skills (${targetSkills.length}) ===\n${summary.join("\n")}`,
      }],
    };
  }

  // Return full content for Claude Code to write to disk
  const syncedSkills: SyncedSkill[] = targetSkills.map((s) => ({
    slug: s.slug,
    version: s.version,
    action: "install" as const,
    files: {
      "SKILL.md": s.content,
      ...(s.references as Record<string, string> || {}),
    },
  }));

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        skills: syncedSkills,
        summary: `${syncedSkills.length} skill(s) ready to write to ~/.claude/skills/`,
        instructions: "Write each skill's files to ~/.claude/skills/<slug>/<path> and write the version to ~/.claude/skills/<slug>/.version",
      }),
    }],
  };
}
