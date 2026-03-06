import { createDb } from "@claudefather/db/client";
import {
  userInstalledVersions,
  skills,
  skillVersions,
} from "@claudefather/db/schema";
import { sql, eq, and } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VersionBar } from "./components/version-bar";
import { NudgeButton } from "./components/nudge-button";

const db = createDb(process.env.DATABASE_URL!);

export default async function VersionHealthPage() {
  // Get all installed version data grouped by skill + version
  const versionData = await db
    .select({
      skillSlug: userInstalledVersions.skillSlug,
      installedVersion: userInstalledVersions.installedVersion,
      userCount: sql<number>`COUNT(*)::int`,
    })
    .from(userInstalledVersions)
    .groupBy(
      userInstalledVersions.skillSlug,
      userInstalledVersions.installedVersion
    )
    .orderBy(userInstalledVersions.skillSlug);

  if (versionData.length === 0) {
    return (
      <>
        <SectionHeader
          title="VERSION HEALTH"
          subtitle="Track version drift across your team"
        />
        <div className="text-center py-16 text-gray-600">
          <p className="font-mono text-sm">No version data yet</p>
          <p className="text-xs mt-1">
            Data populates when users run check_updates via the MCP server
          </p>
        </div>
      </>
    );
  }

  // Get latest versions for all skills
  const latestVersions = await db
    .select({
      slug: skills.slug,
      latestVersion: skillVersions.version,
    })
    .from(skills)
    .innerJoin(
      skillVersions,
      and(
        eq(skillVersions.skillId, skills.id),
        eq(skillVersions.isLatest, true)
      )
    );

  const latestMap = new Map(latestVersions.map((v) => [v.slug, v.latestVersion]));

  // Group version data by skill
  const skillGroups = new Map<
    string,
    { version: string; count: number; isLatest: boolean }[]
  >();

  for (const row of versionData) {
    const latest = latestMap.get(row.skillSlug);
    const entry = {
      version: row.installedVersion,
      count: row.userCount,
      isLatest: row.installedVersion === latest,
    };

    const existing = skillGroups.get(row.skillSlug) || [];
    existing.push(entry);
    skillGroups.set(row.skillSlug, existing);
  }

  return (
    <>
      <SectionHeader
        title="VERSION HEALTH"
        subtitle="Track version drift across your team"
      />

      <div className="space-y-3">
        {Array.from(skillGroups.entries()).map(([slug, versions]) => {
          const totalUsers = versions.reduce((s, v) => s + v.count, 0);
          const latestUsers = versions
            .filter((v) => v.isLatest)
            .reduce((s, v) => s + v.count, 0);
          const driftPct =
            totalUsers > 0
              ? Math.round(((totalUsers - latestUsers) / totalUsers) * 100)
              : 0;

          return (
            <Card key={slug}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-cyan-400">
                    {slug}
                  </span>
                  {driftPct > 0 && (
                    <Badge
                      label={`${driftPct}% drift`}
                      variant={driftPct > 50 ? "red" : "amber"}
                    />
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-gray-500">
                    {latestUsers}/{totalUsers} on latest
                  </span>
                  {driftPct > 0 && <NudgeButton skillSlug={slug} />}
                </div>
              </div>
              <VersionBar segments={versions} />
              <div className="flex gap-4 mt-2">
                {versions.map((v) => (
                  <span
                    key={v.version}
                    className={`font-mono text-xs ${
                      v.isLatest ? "text-green-400" : "text-gray-500"
                    }`}
                  >
                    {v.version}: {v.count}
                  </span>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
