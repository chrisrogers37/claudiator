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

/**
 * Publish a new skill version, atomically unsetting the old latest and inserting the new one.
 * Uses a batch transaction to prevent the skill from becoming invisible if the insert fails.
 */
export async function publishNewVersion(db: Db, params: PublishNewVersionParams) {
  return db.transaction(async (tx) => {
    // Unset current latest
    await tx
      .update(skillVersions)
      .set({ isLatest: false })
      .where(
        and(
          eq(skillVersions.skillId, params.skillId),
          eq(skillVersions.isLatest, true)
        )
      );

    // Insert new version as latest
    const [created] = await tx
      .insert(skillVersions)
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
      });

    // Update skill timestamp
    await tx
      .update(skills)
      .set({ updatedAt: new Date() })
      .where(eq(skills.id, params.skillId));

    return created;
  });
}

/**
 * Promote an existing version to latest, atomically unsetting the old latest.
 */
export async function promoteVersion(db: Db, params: PromoteVersionParams) {
  return db.transaction(async (tx) => {
    // Unset current latest
    await tx
      .update(skillVersions)
      .set({ isLatest: false })
      .where(
        and(
          eq(skillVersions.skillId, params.skillId),
          eq(skillVersions.isLatest, true)
        )
      );

    // Set the specified version as latest
    await tx
      .update(skillVersions)
      .set({
        isLatest: true,
        changelog: params.changelog || undefined,
        publishedAt: new Date(),
      })
      .where(eq(skillVersions.id, params.versionId));

    // Update skill timestamp
    await tx
      .update(skills)
      .set({ updatedAt: new Date() })
      .where(eq(skills.id, params.skillId));
  });
}
