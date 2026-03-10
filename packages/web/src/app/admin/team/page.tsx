import Link from "next/link";
import { createDb } from "@claudiator/db/client";
import {
  users,
  activityEvents,
  skillInvocations,
  apiTokens,
} from "@claudiator/db/schema";
import { sql, desc, asc } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { SyncHealthBadge } from "./components/sync-health-badge";
import { OnboardingFunnel } from "./components/onboarding-funnel";
import { StatCard } from "../components/stat-card";

const db = createDb(process.env.DATABASE_URL!);

export default async function TeamOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const sortKey = sort === "active" ? "active" : sort === "invocations" ? "invocations" : "sync";

  const teamMembers = await db
    .select({
      id: users.id,
      githubUsername: users.githubUsername,
      displayName: users.displayName,
      role: users.role,
      createdAt: users.createdAt,
      lastSyncAt: sql<Date | null>`(
        SELECT MAX(created_at) FROM activity_events
        WHERE user_id = ${users.id} AND event_type = 'sync'
      )`,
      lastActiveAt: sql<Date | null>`(
        SELECT MAX(invoked_at) FROM skill_invocations
        WHERE user_id = ${users.id}
      )`,
      hasToken: sql<boolean>`EXISTS(
        SELECT 1 FROM api_tokens
        WHERE user_id = ${users.id} AND revoked_at IS NULL
      )`,
      totalInvocations: sql<number>`COALESCE((
        SELECT COUNT(*) FROM skill_invocations
        WHERE user_id = ${users.id}
      ), 0)::int`,
      skillCount: sql<number>`COALESCE((
        SELECT COUNT(DISTINCT skill_slug) FROM skill_invocations
        WHERE user_id = ${users.id}
      ), 0)::int`,
    })
    .from(users)
    .orderBy(
      sortKey === "active"
        ? desc(sql`(SELECT MAX(invoked_at) FROM skill_invocations WHERE user_id = ${users.id})`)
        : sortKey === "invocations"
          ? desc(sql`(SELECT COUNT(*) FROM skill_invocations WHERE user_id = ${users.id})`)
          : desc(sql`(SELECT MAX(created_at) FROM activity_events WHERE user_id = ${users.id} AND event_type = 'sync')`)
    );

  // Compute funnel stats
  const totalUsers = teamMembers.length;
  const withToken = teamMembers.filter((u) => u.hasToken).length;
  const firstSync = teamMembers.filter((u) => u.lastSyncAt !== null).length;
  const active = teamMembers.filter((u) => {
    if (!u.lastActiveAt) return false;
    const daysSince =
      (Date.now() - new Date(u.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince < 7;
  }).length;

  return (
    <>
      <SectionHeader
        title="TEAM OVERVIEW"
        subtitle={`${totalUsers} registered users`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Users" value={totalUsers} />
        <StatCard label="With Token" value={withToken} variant="green" />
        <StatCard label="First Sync" value={firstSync} variant="amber" />
        <StatCard label="Active (7d)" value={active} variant="green" />
      </div>

      <OnboardingFunnel
        totalUsers={totalUsers}
        withToken={withToken}
        firstSync={firstSync}
        active={active}
      />

      <div className="flex items-center gap-2 mt-6 mb-4">
        <span className="font-mono text-xs text-gray-600">Sort:</span>
        {[
          { value: "sync", label: "Last sync" },
          { value: "active", label: "Last active" },
          { value: "invocations", label: "Invocations" },
        ].map((opt) => (
          <Link
            key={opt.value}
            href={
              opt.value === "sync"
                ? "/admin/team"
                : `/admin/team?sort=${opt.value}`
            }
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              sortKey === opt.value
                ? "bg-cyan-500/10 text-cyan-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        {teamMembers.map((user) => (
          <Card key={user.id}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-cyan-400">
                  {user.githubUsername}
                </span>
                {user.displayName && (
                  <span className="text-xs text-gray-500">
                    {user.displayName}
                  </span>
                )}
                {user.role === "admin" && (
                  <span className="text-xs font-mono text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
                    admin
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="font-mono text-xs text-gray-600">
                  {user.totalInvocations} inv / {user.skillCount} skills
                </span>
                <SyncHealthBadge lastSyncAt={user.lastSyncAt} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
