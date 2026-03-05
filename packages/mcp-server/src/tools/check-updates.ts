import type { DbClient } from "../lib/db.js";
import { skills, skillVersions, userSkillPins } from "@claudefather/db/schema";
import { eq, and, notInArray, inArray } from "drizzle-orm";

interface InstalledSkill {
  slug: string;
  version: string;
}

function computeBumpType(
  installed: string,
  latest: string
): "MAJOR" | "MINOR" | "PATCH" {
  const [iMaj, iMin] = installed.split(".").map(Number);
  const [lMaj, lMin] = latest.split(".").map(Number);
  if (lMaj !== iMaj) return "MAJOR";
  if (lMin !== iMin) return "MINOR";
  return "PATCH";
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
          text: JSON.stringify({
            updates: [],
            new_skills: [],
            removed_skills: [],
            pinned_skills: [],
            up_to_date: [],
          }),
        },
      ],
    };
  }

  const installedSlugs = args.installed.map((s) => s.slug);
  const installedMap = new Map(args.installed.map((s) => [s.slug, s.version]));

  // Fetch all registry skills with their latest versions
  const registrySkills = await db
    .select({
      slug: skills.slug,
      description: skills.description,
      latestVersion: skillVersions.version,
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

  const registrySlugs = registrySkills.map((s) => s.slug);

  // Fetch user's pins
  const pins = await db
    .select({
      slug: skills.slug,
      pinnedVersion: userSkillPins.pinnedVersion,
    })
    .from(userSkillPins)
    .innerJoin(skills, eq(skills.id, userSkillPins.skillId))
    .where(eq(userSkillPins.userId, user.id));

  const pinnedMap = new Map(pins.map((p) => [p.slug, p.pinnedVersion]));

  const updates: {
    slug: string;
    installed_version: string;
    latest_version: string;
    bump_type: string;
    changelog: string | null;
    is_pinned: boolean;
  }[] = [];

  const pinned_skills: {
    slug: string;
    installed_version: string;
    latest_version: string;
    pinned_at: string;
  }[] = [];

  const up_to_date: string[] = [];

  for (const regSkill of registrySkills) {
    const installedVersion = installedMap.get(regSkill.slug);
    if (installedVersion === undefined) continue; // handled as new_skills below

    if (pinnedMap.has(regSkill.slug)) {
      if (installedVersion !== regSkill.latestVersion) {
        pinned_skills.push({
          slug: regSkill.slug,
          installed_version: installedVersion,
          latest_version: regSkill.latestVersion,
          pinned_at: pinnedMap.get(regSkill.slug) ?? installedVersion,
        });
      } else {
        up_to_date.push(regSkill.slug);
      }
      continue;
    }

    if (installedVersion === regSkill.latestVersion) {
      up_to_date.push(regSkill.slug);
    } else {
      updates.push({
        slug: regSkill.slug,
        installed_version: installedVersion,
        latest_version: regSkill.latestVersion,
        bump_type: computeBumpType(installedVersion, regSkill.latestVersion),
        changelog: regSkill.changelog,
        is_pinned: false,
      });
    }
  }

  // New skills: in registry but not installed
  const new_skills = registrySkills
    .filter((s) => !installedMap.has(s.slug))
    .map((s) => ({
      slug: s.slug,
      latest_version: s.latestVersion,
      description: s.description,
    }));

  // Removed skills: installed but not in registry
  const removed_skills = installedSlugs
    .filter((slug) => !registrySlugs.includes(slug))
    .map((slug) => ({
      slug,
      installed_version: installedMap.get(slug)!,
    }));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          updates,
          new_skills,
          removed_skills,
          pinned_skills,
          up_to_date,
        }),
      },
    ],
  };
}
