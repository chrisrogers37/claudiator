import { NextResponse } from "next/server";
import { runScraperJob } from "@/lib/pipeline/scraper";
import { triggerDistillation } from "@/lib/pipeline/distillation";
import { createDb } from "@claudefather/db/client";
import { sourceConfigs, sourceSnapshots } from "@claudefather/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.SCRAPER_ENABLED === "false") {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  try {
    const databaseUrl = process.env.DATABASE_URL!;
    const result = await runScraperJob(databaseUrl);

    // Trigger distillation for changed sources
    let distillations = 0;
    if (result.changesDetected > 0) {
      const db = createDb(databaseUrl);

      // Get sources that were just checked and had changes
      // (the ones with snapshots created in the last minute)
      const recentSnapshots = await db
        .select({
          sourceConfigId: sourceSnapshots.sourceConfigId,
          rawContent: sourceSnapshots.rawContent,
          sourceName: sourceConfigs.name,
          sourceUrl: sourceConfigs.url,
          sourceType: sourceConfigs.sourceType,
        })
        .from(sourceSnapshots)
        .innerJoin(
          sourceConfigs,
          eq(sourceConfigs.id, sourceSnapshots.sourceConfigId)
        )
        .where(
          sql`${sourceSnapshots.fetchedAt} > NOW() - INTERVAL '2 minutes'`
        )
        .orderBy(desc(sourceSnapshots.fetchedAt));

      // Deduplicate by sourceConfigId (take most recent)
      const seen = new Set<string>();
      for (const snap of recentSnapshots) {
        if (seen.has(snap.sourceConfigId)) continue;
        seen.add(snap.sourceConfigId);

        try {
          await triggerDistillation(db, {
            sourceConfigId: snap.sourceConfigId,
            name: snap.sourceName,
            url: snap.sourceUrl,
            sourceType: snap.sourceType,
            content: snap.rawContent,
          });
          distillations++;
        } catch (err) {
          console.error(
            `[pipeline] Distillation failed for ${snap.sourceName}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,
      ...result,
      distillations,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[pipeline] Scraper job failed:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
