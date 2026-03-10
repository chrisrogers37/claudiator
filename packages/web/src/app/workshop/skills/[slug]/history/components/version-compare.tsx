import { createDb } from "@claudiator/db/client";
import { skillVersions } from "@claudiator/db/schema";
import { eq, and } from "drizzle-orm";
import { DiffViewer } from "@/components/workshop/diff-viewer";

const db = createDb(process.env.DATABASE_URL!);

interface VersionCompareProps {
  skillId: string;
  versionA: string;
  versionB: string;
}

export async function VersionCompare({
  skillId,
  versionA,
  versionB,
}: VersionCompareProps) {
  const [a, b] = await Promise.all([
    db
      .select()
      .from(skillVersions)
      .where(
        and(
          eq(skillVersions.skillId, skillId),
          eq(skillVersions.version, versionA)
        )
      )
      .limit(1)
      .then((r) => r[0]),
    db
      .select()
      .from(skillVersions)
      .where(
        and(
          eq(skillVersions.skillId, skillId),
          eq(skillVersions.version, versionB)
        )
      )
      .limit(1)
      .then((r) => r[0]),
  ]);

  if (!a || !b) {
    return (
      <p className="text-red-400 font-mono text-sm">Version not found</p>
    );
  }

  // Order by publish date so older is on the left
  const [older, newer] =
    a.publishedAt < b.publishedAt ? [a, b] : [b, a];

  return (
    <div className="rounded-lg border border-gray-800 overflow-hidden">
      <DiffViewer
        oldContent={older.content}
        newContent={newer.content}
        oldLabel={`v${older.version}`}
        newLabel={`v${newer.version}`}
      />
    </div>
  );
}
