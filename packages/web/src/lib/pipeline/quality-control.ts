import type { Db } from "@claudefather/db/client";
import { learnings, sourceSnapshots } from "@claudefather/db/schema";
import { eq, and, sql, lt } from "drizzle-orm";

interface QualityControlResult {
  dismissed: number;
  snapshotsPruned: number;
}

export async function runQualityControl(
  db: Db
): Promise<QualityControlResult> {
  // 1. Auto-dismiss stale learnings (>90 days in 'new' status with no action)
  const ninetyDaysAgo = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000
  );

  const staleResult = await db
    .update(learnings)
    .set({ status: "dismissed", updatedAt: new Date() })
    .where(
      and(
        eq(learnings.status, "new"),
        lt(learnings.distilledAt, ninetyDaysAgo)
      )
    )
    .returning({ id: learnings.id });

  // 2. Prune old snapshots — keep only last 30 per source
  const pruneResult = await db.execute(sql`
    DELETE FROM source_snapshots
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY source_config_id ORDER BY fetched_at DESC
        ) AS rn
        FROM source_snapshots
      ) ranked
      WHERE rn > 30
    )
  `);

  return {
    dismissed: staleResult.length,
    snapshotsPruned: Number(pruneResult.rowCount ?? 0),
  };
}
