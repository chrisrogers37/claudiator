import { createHash } from "crypto";
import { createDb } from "@claudiator/db/client";
import { sourceSnapshots } from "@claudiator/db/schema";
import { eq, desc } from "drizzle-orm";

export async function detectChanges(
  db: ReturnType<typeof createDb>,
  sourceConfigId: string,
  content: string
): Promise<boolean> {
  const contentHash = createHash("sha256").update(content).digest("hex");

  // Get most recent snapshot for this source
  const [prev] = await db
    .select({ contentHash: sourceSnapshots.contentHash })
    .from(sourceSnapshots)
    .where(eq(sourceSnapshots.sourceConfigId, sourceConfigId))
    .orderBy(desc(sourceSnapshots.fetchedAt))
    .limit(1);

  // Store new snapshot
  await db.insert(sourceSnapshots).values({
    sourceConfigId,
    contentHash,
    rawContent: content,
  });

  // First fetch ever, or content changed
  if (!prev) return true;
  return prev.contentHash !== contentHash;
}
