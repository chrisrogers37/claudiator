import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { runScraperJob } from "@/lib/pipeline/scraper";
import { triggerDistillation } from "@/lib/pipeline/distillation";
import { createDb } from "@claudefather/db/client";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.SCRAPER_ENABLED === "false") {
    return NextResponse.json({ ok: true, skipped: true, reason: "disabled" });
  }

  try {
    const db = createDb(process.env.DATABASE_URL!);
    const result = await runScraperJob(db);

    // Trigger distillation for changed sources
    let distillations = 0;
    if (result.changedSources.length > 0) {
      const anthropic = new Anthropic();

      for (const source of result.changedSources) {
        try {
          await triggerDistillation(
            db,
            {
              sourceConfigId: source.sourceConfigId,
              name: source.name,
              url: source.url,
              sourceType: source.sourceType,
              content: source.content,
              previousContent: source.previousContent,
            },
            anthropic
          );
          distillations++;
        } catch (err) {
          console.error(
            `[pipeline] Distillation failed for ${source.name}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,
      sourcesChecked: result.sourcesChecked,
      changesDetected: result.changesDetected,
      distillations,
      errors: result.errors,
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
