import { notFound } from "next/navigation";
import { createDb } from "@claudefather/db/client";
import { skills, skillVersions } from "@claudefather/db/schema";
import { eq, and } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { SkillEditor } from "./components/skill-editor";
import { SkillSidebar } from "./components/skill-sidebar";

const db = createDb(process.env.DATABASE_URL!);

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [skill] = await db
    .select()
    .from(skills)
    .where(eq(skills.slug, slug))
    .limit(1);

  if (!skill) notFound();

  // Get latest published version
  const [latestVersion] = await db
    .select()
    .from(skillVersions)
    .where(
      and(eq(skillVersions.skillId, skill.id), eq(skillVersions.isLatest, true))
    )
    .limit(1);

  return (
    <>
      <SectionHeader
        title={`SKILL: ${skill.name.toUpperCase()}`}
        subtitle={skill.description}
      />

      <div className="flex gap-6">
        <main className="flex-1 min-w-0">
          <SkillEditor
            slug={slug}
            skillId={skill.id}
            initialContent={latestVersion?.content ?? ""}
            currentVersion={latestVersion?.version ?? null}
          />
        </main>

        <aside className="w-72 flex-shrink-0">
          <SkillSidebar slug={slug} skill={skill} />
        </aside>
      </div>
    </>
  );
}
