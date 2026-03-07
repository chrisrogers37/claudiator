import { createHash } from "crypto";
import type { Db } from "@claudefather/db/client";
import { sourceSnapshots } from "@claudefather/db/schema";
import { eq, desc } from "drizzle-orm";

interface ChangeResult {
  changed: boolean;
  previousContent: string | null;
}

export async function detectChanges(
  db: Db,
  sourceConfigId: string,
  content: string
): Promise<ChangeResult> {
  const contentHash = createHash("sha256").update(content).digest("hex");

  // Get most recent snapshot for this source (include rawContent for distillation diff)
  const [prev] = await db
    .select({
      contentHash: sourceSnapshots.contentHash,
      rawContent: sourceSnapshots.rawContent,
    })
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

  if (!prev) return { changed: true, previousContent: null };
  return {
    changed: prev.contentHash !== contentHash,
    previousContent: prev.rawContent,
  };
}
