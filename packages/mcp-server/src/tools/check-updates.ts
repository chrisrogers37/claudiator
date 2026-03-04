import type { DbClient } from "../lib/db.js";
import { skills, skillVersions } from "@claudefather/db/schema";
import { eq, and } from "drizzle-orm";

interface InstalledSkill {
  slug: string;
  version: string;
}

export async function checkUpdates(
  db: DbClient,
  user: { id: string },
  args: { installed: InstalledSkill[] }
): Promise<{ content: { type: "text"; text: string }[] }> {
  if (!args.installed || args.installed.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: "No installed skills provided. Pass your installed skill versions to check for updates.",
        },
      ],
    };
  }

  const updates: {
    slug: string;
    currentVersion: string;
    latestVersion: string;
    changelog: string | null;
  }[] = [];

  for (const { slug, version } of args.installed) {
    const [latest] = await db
      .select({
        version: skillVersions.version,
        changelog: skillVersions.changelog,
      })
      .from(skills)
      .innerJoin(
        skillVersions,
        and(
          eq(skillVersions.skillId, skills.id),
          eq(skillVersions.isLatest, true)
        )
      )
      .where(eq(skills.slug, slug));

    if (latest && latest.version !== version) {
      updates.push({
        slug,
        currentVersion: version,
        latestVersion: latest.version,
        changelog: latest.changelog,
      });
    }
  }

  if (updates.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `All ${args.installed.length} installed skills are up to date.`,
        },
      ],
    };
  }

  const lines = [
    `${updates.length} update(s) available:`,
    "",
    ...updates.map((u) => {
      const changeNote = u.changelog ? ` — ${u.changelog}` : "";
      return `  ${u.slug}: ${u.currentVersion} → ${u.latestVersion}${changeNote}`;
    }),
    "",
    "Run claudefather_sync to apply updates.",
  ];

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
