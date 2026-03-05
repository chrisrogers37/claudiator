import { createDb } from "@claudefather/db/client";
import { activityEvents, users } from "@claudefather/db/schema";
import { eq, desc } from "drizzle-orm";
import { ActivityFeed } from "./activity-feed";

const db = createDb(process.env.DATABASE_URL!);

export default async function ActivityPage() {
  const events = await db
    .select({
      id: activityEvents.id,
      eventType: activityEvents.eventType,
      userId: activityEvents.userId,
      githubUsername: users.githubUsername,
      avatarUrl: users.avatarUrl,
      details: activityEvents.details,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.userId))
    .orderBy(desc(activityEvents.createdAt))
    .limit(200);

  const serialized = events.map((e) => ({
    ...e,
    createdAt: e.createdAt.toISOString(),
    details: e.details as Record<string, unknown>,
  }));

  return (
    <div className="space-y-6">
      <h1 className="font-mono text-2xl text-green-400">Activity Feed</h1>
      <ActivityFeed events={serialized} />
    </div>
  );
}
