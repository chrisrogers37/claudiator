import { notFound } from "next/navigation";
import Link from "next/link";
import { createDb } from "@claudiator/db/client";
import { skills, skillVersions } from "@claudiator/db/schema";
import { eq, desc } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { Timeline } from "@/components/ui/timeline";
import { VersionCompare } from "./components/version-compare";
import { VersionActions } from "./components/version-actions";
import { Badge } from "@/components/ui/badge";

const db = createDb(process.env.DATABASE_URL!);

export default async function VersionHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ compare?: string }>;
}) {
  const { slug } = await params;
  const { compare } = await searchParams;

  const [skill] = await db
    .select()
    .from(skills)
    .where(eq(skills.slug, slug))
    .limit(1);

  if (!skill) notFound();

  const versions = await db
    .select()
    .from(skillVersions)
    .where(eq(skillVersions.skillId, skill.id))
    .orderBy(desc(skillVersions.publishedAt));

  // Parse compare param: "1.0.0,2.0.0"
  const compareVersions = compare
    ? compare.split(",").filter(Boolean)
    : null;

  const timelineEntries = versions.map((v) => ({
    id: v.id,
    label: `v${v.version}`,
    timestamp: v.publishedAt.toLocaleDateString(),
    description: v.changelog || undefined,
    isActive: v.isLatest,
    actions: (
      <div className="flex items-center gap-2">
        <VersionActions
          slug={slug}
          skillId={skill.id}
          version={v.version}
          versionId={v.id}
          isLatest={v.isLatest}
        />
        {v.isLatest && <Badge label="latest" variant="green" />}
      </div>
    ),
  }));

  return (
    <>
      <SectionHeader
        title={`VERSION HISTORY: ${skill.name.toUpperCase()}`}
        subtitle={`${versions.length} version${versions.length !== 1 ? "s" : ""}`}
        action={
          <Link
            href={`/workshop/skills/${slug}`}
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300"
          >
            &larr; Back to editor
          </Link>
        }
      />

      <div className="flex gap-8">
        <aside className="w-80 flex-shrink-0">
          <Timeline entries={timelineEntries} />
        </aside>

        <main className="flex-1 min-w-0">
          {compareVersions && compareVersions.length === 2 ? (
            <VersionCompare
              skillId={skill.id}
              versionA={compareVersions[0]}
              versionB={compareVersions[1]}
            />
          ) : (
            <div className="text-center py-12 text-gray-600">
              <p className="font-mono text-sm">
                Select two versions to compare
              </p>
              <p className="text-xs mt-1">
                Click &ldquo;Compare&rdquo; checkboxes on any two versions in
                the timeline
              </p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
