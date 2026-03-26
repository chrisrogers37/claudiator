import type { Db } from "./client.js";
import { skillVersions, skills } from "./schema.js";
import { eq, and } from "drizzle-orm";

interface PublishNewVersionParams {
  skillId: string;
  version: string;
  content: string;
  references?: Record<string, string> | null;
  changelog?: string | null;
  publishedBy: string;
}

interface PromoteVersionParams {
  skillId: string;
  versionId: string;
  changelog?: string;
}

function unsetLatestQuery(db: Db, skillId: string) {
  return db
    .update(skillVersions)
    .set({ isLatest: false })
    .where(and(eq(skillVersions.skillId, skillId), eq(skillVersions.isLatest, true)));
}

function touchSkillQuery(db: Db, skillId: string) {
  return db.update(skills).set({ updatedAt: new Date() }).where(eq(skills.id, skillId));
}

/**
 * Publish a new skill version, atomically unsetting the old latest and inserting the new one.
 * Uses db.batch() (neon-http doesn't support interactive transactions).
 */
export async function publishNewVersion(db: Db, params: PublishNewVersionParams) {
  const results = await db.batch([
    unsetLatestQuery(db, params.skillId),
    db.insert(skillVersions)
      .values({
        skillId: params.skillId,
        version: params.version,
        content: params.content,
        references: params.references ?? null,
        changelog: params.changelog ?? null,
        publishedBy: params.publishedBy,
        isLatest: true,
      })
      .returning({
        version: skillVersions.version,
        publishedAt: skillVersions.publishedAt,
      }),
    touchSkillQuery(db, params.skillId),
  ]);

  return results[1][0];
}

/**
 * Promote an existing version to latest, atomically unsetting the old latest.
 */
export async function promoteVersion(db: Db, params: PromoteVersionParams) {
  await db.batch([
    unsetLatestQuery(db, params.skillId),
    db.update(skillVersions)
      .set({
        isLatest: true,
        changelog: params.changelog ?? undefined,
        publishedAt: new Date(),
      })
      .where(eq(skillVersions.id, params.versionId)),
    touchSkillQuery(db, params.skillId),
  ]);
}
