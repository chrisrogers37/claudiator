import type { Db } from "@claudiator/db/client";
import { arenaPipelineEvents } from "@claudiator/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function emitPipelineEvent(
  db: Db,
  entityType: "candidate" | "battle",
  entityId: string,
  phase: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  // Look up the most recent event for this entity to calculate durationMs
  const [previousEvent] = await db
    .select()
    .from(arenaPipelineEvents)
    .where(
      and(
        eq(arenaPipelineEvents.entityId, entityId),
        eq(arenaPipelineEvents.entityType, entityType)
      )
    )
    .orderBy(desc(arenaPipelineEvents.createdAt))
    .limit(1);

  const durationMs = previousEvent
    ? Date.now() - previousEvent.createdAt.getTime()
    : null;

  await db.insert(arenaPipelineEvents).values({
    entityType,
    entityId,
    phase,
    previousPhase: previousEvent?.phase ?? null,
    durationMs,
    metadata: metadata ?? {},
  });
}
