import { createDb } from "@claudefather/db/client";
import {
  skills,
  skillVersions,
  userInstalledVersions,
  users,
} from "@claudefather/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { VersionHealthList } from "./version-health-list";

const db = createDb(process.env.DATABASE_URL!);

export default async function VersionsPage() {
  const allSkills = await db.select().from(skills);

  const healthData = await Promise.all(
    allSkills.map(async (skill) => {
      // Get latest version
      const [latest] = await db
        .select({ version: skillVersions.version })
        .from(skillVersions)
        .where(
          and(
            eq(skillVersions.skillId, skill.id),
            eq(skillVersions.isLatest, true)
          )
        );

      if (!latest) {
        return {
          skillId: skill.id,
          skillName: skill.name,
          skillSlug: skill.slug,
          latestVersion: null,
          totalUsers: 0,
          usersOnLatest: 0,
          driftPercent: 0,
          needsAttention: false,
          distribution: [],
          behindUsers: [],
        };
      }

      // Get all installed versions for this skill
      const installed = await db
        .select({
          userId: userInstalledVersions.userId,
          installedVersion: userInstalledVersions.installedVersion,
          githubUsername: users.githubUsername,
        })
        .from(userInstalledVersions)
        .innerJoin(users, eq(users.id, userInstalledVersions.userId))
        .where(eq(userInstalledVersions.skillSlug, skill.slug));

      // Build distribution
      const versionCounts = new Map<string, number>();
      for (const row of installed) {
        versionCounts.set(
          row.installedVersion,
          (versionCounts.get(row.installedVersion) ?? 0) + 1
        );
      }

      const distribution = Array.from(versionCounts.entries()).map(
        ([version, userCount]) => ({
          version,
          userCount,
          isLatest: version === latest.version,
        })
      );

      const totalUsers = installed.length;
      const usersOnLatest = installed.filter(
        (i) => i.installedVersion === latest.version
      ).length;
      const driftPercent =
        totalUsers > 0
          ? Math.round(((totalUsers - usersOnLatest) / totalUsers) * 100)
          : 0;

      const behindUsers = installed
        .filter((i) => i.installedVersion !== latest.version)
        .map((i) => ({
          userId: i.userId,
          githubUsername: i.githubUsername,
          currentVersion: i.installedVersion,
        }));

      return {
        skillId: skill.id,
        skillName: skill.name,
        skillSlug: skill.slug,
        latestVersion: latest.version,
        totalUsers,
        usersOnLatest,
        driftPercent,
        needsAttention: driftPercent > 50,
        distribution,
        behindUsers,
      };
    })
  );

  // Filter out skills with no users
  const withUsers = healthData.filter((h) => h.totalUsers > 0);

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-2xl text-green-400">Version Health</h1>
      <VersionHealthList versions={withUsers} />
    </div>
  );
}
