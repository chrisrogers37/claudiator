import { createDb } from "@claudefather/db/client";
import {
  users,
  apiTokens,
  skillInvocations,
  activityEvents,
  userInstalledVersions,
} from "@claudefather/db/schema";
import { eq, sql, countDistinct, count } from "drizzle-orm";
import { OnboardingFunnel } from "@/components/admin/onboarding-funnel";
import { TeamTable } from "./team-table";

const db = createDb(process.env.DATABASE_URL!);

export default async function TeamPage() {
  const allUsers = await db.select().from(users);

  const enriched = await Promise.all(
    allUsers.map(async (user) => {
      // Last sync (from activity_events)
      const [lastSync] = await db
        .select({ maxDate: sql<string>`max(${activityEvents.createdAt})` })
        .from(activityEvents)
        .where(eq(activityEvents.userId, user.id));

      // Last active (from skill_invocations)
      const [lastActive] = await db
        .select({ maxDate: sql<string>`max(${skillInvocations.invokedAt})` })
        .from(skillInvocations)
        .where(eq(skillInvocations.userId, user.id));

      // Has token
      const [tokenInfo] = await db
        .select({ cnt: count() })
        .from(apiTokens)
        .where(eq(apiTokens.userId, user.id));

      // Installed skill count
      const [skillCount] = await db
        .select({ cnt: countDistinct(userInstalledVersions.skillSlug) })
        .from(userInstalledVersions)
        .where(eq(userInstalledVersions.userId, user.id));

      // Total invocations
      const [invocations] = await db
        .select({ cnt: count() })
        .from(skillInvocations)
        .where(eq(skillInvocations.userId, user.id));

      const lastSyncAt = lastSync?.maxDate ?? null;
      const lastActiveAt = lastActive?.maxDate ?? null;
      const hasToken = (tokenInfo?.cnt ?? 0) > 0;

      // Compute sync status
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      let syncStatus: "current" | "stale" | "critical" | "never" = "never";
      if (lastSyncAt) {
        const age = now - new Date(lastSyncAt).getTime();
        if (age > thirtyDays) syncStatus = "critical";
        else if (age > sevenDays) syncStatus = "stale";
        else syncStatus = "current";
      }

      const onboardingComplete = !!(
        user.githubUsername &&
        hasToken &&
        lastSyncAt
      );

      return {
        id: user.id,
        githubUsername: user.githubUsername,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt.toISOString(),
        lastSyncAt,
        lastActiveAt,
        skillCount: skillCount?.cnt ?? 0,
        totalInvocations: invocations?.cnt ?? 0,
        syncStatus,
        onboardingComplete,
        hasToken,
      };
    })
  );

  const funnel = {
    registered: enriched.length,
    tokenGenerated: enriched.filter((u) => u.hasToken).length,
    firstSync: enriched.filter((u) => u.lastSyncAt).length,
    fullyOnboarded: enriched.filter((u) => u.onboardingComplete).length,
  };

  return (
    <div className="space-y-8">
      <h1 className="font-mono text-2xl text-green-400">Team Overview</h1>
      <OnboardingFunnel funnel={funnel} />
      <TeamTable users={enriched} />
    </div>
  );
}
