import Link from "next/link";
import { createDb } from "@claudefather/db/client";
import { activityEvents, users } from "@claudefather/db/schema";
import { sql, desc, eq } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { EventRow } from "./components/event-row";

const db = createDb(process.env.DATABASE_URL!);

const EVENT_TYPES = [
  "all",
  "sync",
  "rollback",
  "pin",
  "unpin",
  "feedback",
  "token_generate",
  "token_rotate",
  "publish",
  "version_nudge",
  "feedback_status_change",
] as const;

export default async function ActivityFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const typeFilter = EVENT_TYPES.includes(type as (typeof EVENT_TYPES)[number])
    ? (type as string)
    : "all";

  const conditions =
    typeFilter !== "all"
      ? eq(activityEvents.eventType, typeFilter as any)
      : undefined;

  const events = await db
    .select({
      id: activityEvents.id,
      eventType: activityEvents.eventType,
      skillSlug: activityEvents.skillSlug,
      details: activityEvents.details,
      createdAt: activityEvents.createdAt,
      username: users.githubUsername,
    })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.userId))
    .where(conditions)
    .orderBy(desc(activityEvents.createdAt))
    .limit(100);

  return (
    <>
      <SectionHeader
        title="ACTIVITY FEED"
        subtitle="Recent events across the platform"
      />

      <div className="flex flex-wrap items-center gap-1 mb-6">
        <span className="font-mono text-xs text-gray-600 mr-1">Type:</span>
        {EVENT_TYPES.map((t) => (
          <Link
            key={t}
            href={
              t === "all" ? "/admin/activity" : `/admin/activity?type=${t}`
            }
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              typeFilter === t
                ? "bg-cyan-500/10 text-cyan-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t === "all"
              ? "All"
              : t.replace(/_/g, " ")}
          </Link>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <p className="font-mono text-sm">No activity yet</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-[#161b22] divide-y divide-gray-800/50">
          {events.map((event) => (
            <EventRow
              key={event.id}
              eventType={event.eventType}
              skillSlug={event.skillSlug}
              details={event.details as Record<string, unknown>}
              username={event.username}
              createdAt={event.createdAt}
            />
          ))}
        </div>
      )}
    </>
  );
}
