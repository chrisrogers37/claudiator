import { createDb } from "@claudiator/db/client";
import { sourceConfigs } from "@claudiator/db/schema";
import { eq, sql, and, isNull, or } from "drizzle-orm";
import { fetchSource } from "./fetchers";
import { detectChanges } from "./change-detection";
import { discoverSkillsFromRepo } from "./skill-discovery";

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

  // Separate skill repo sources from regular scraper sources
  const regularSources = sources.filter(s => s.sourceType !== "github_skill_repo");
  const skillRepoSources = sources.filter(s => s.sourceType === "github_skill_repo");

  for (const source of regularSources) {
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

  // Handle skill repo sources via discovery pipeline
  for (const source of skillRepoSources) {
    try {
      const discoveryResult = await discoverSkillsFromRepo(db, source.url, source.id);
      changesDetected += discoveryResult.discovered;
      for (const err of discoveryResult.errors) {
        errors.push({ name: source.name, error: err });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[pipeline] Failed skill discovery for ${source.name}:`, message);
      errors.push({ name: source.name, error: message });
    }
  }

  return {
    sourcesChecked: sources.length,
    changesDetected,
    errors,
  };
}
