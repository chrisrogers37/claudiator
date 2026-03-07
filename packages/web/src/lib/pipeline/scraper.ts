import { createDb } from "@claudefather/db/client";
import { sourceConfigs } from "@claudefather/db/schema";
import { eq, sql, and, isNull, or } from "drizzle-orm";
import { fetchSource } from "./fetchers";
import { detectChanges } from "./change-detection";

interface ScrapeResult {
  sourcesChecked: number;
  changesDetected: number;
  errors: { name: string; error: string }[];
}

export async function runScraperJob(
  databaseUrl: string
): Promise<ScrapeResult> {
  const db = createDb(databaseUrl);

  // Find sources due for checking
  const sources = await db
    .select()
    .from(sourceConfigs)
    .where(
      and(
        eq(sourceConfigs.isActive, true),
        or(
          isNull(sourceConfigs.lastCheckedAt),
          and(
            eq(sourceConfigs.checkFrequency, "daily"),
            sql`${sourceConfigs.lastCheckedAt} < NOW() - INTERVAL '23 hours'`
          ),
          and(
            eq(sourceConfigs.checkFrequency, "weekly"),
            sql`${sourceConfigs.lastCheckedAt} < NOW() - INTERVAL '6 days 20 hours'`
          )
        )
      )
    );

  let changesDetected = 0;
  const errors: { name: string; error: string }[] = [];
  const changedSources: {
    id: string;
    name: string;
    url: string;
    sourceType: string;
    content: string;
  }[] = [];

  for (const source of sources) {
    try {
      const content = await fetchSource(
        source.url,
        source.sourceType,
        (source.fetchConfig as Record<string, string>) || {}
      );

      const hasChanged = await detectChanges(db, source.id, content);

      // Update last_checked_at
      await db
        .update(sourceConfigs)
        .set({ lastCheckedAt: new Date() })
        .where(eq(sourceConfigs.id, source.id));

      if (hasChanged) {
        changesDetected++;
        changedSources.push({
          id: source.id,
          name: source.name,
          url: source.url,
          sourceType: source.sourceType,
          content,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[pipeline] Failed to scrape ${source.name}:`, message);
      errors.push({ name: source.name, error: message });
    }
  }

  return {
    sourcesChecked: sources.length,
    changesDetected,
    errors,
  };
}
