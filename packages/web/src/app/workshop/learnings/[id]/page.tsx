import { notFound } from "next/navigation";
import Link from "next/link";
import { createDb } from "@claudiator/db/client";
import { learnings, learningSkillLinks, skills } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ProposedChangeCard } from "./components/proposed-change-card";
import { LearningStatusActions } from "./components/learning-status-actions";

const db = createDb(process.env.DATABASE_URL!);

export default async function LearningDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [learning] = await db
    .select()
    .from(learnings)
    .where(eq(learnings.id, id))
    .limit(1);

  if (!learning) notFound();

  const links = await db
    .select({
      linkId: learningSkillLinks.id,
      skillSlug: learningSkillLinks.skillSlug,
      proposedChange: learningSkillLinks.proposedChange,
      linkStatus: learningSkillLinks.status,
      skillName: skills.name,
    })
    .from(learningSkillLinks)
    .innerJoin(skills, eq(learningSkillLinks.skillSlug, skills.slug))
    .where(eq(learningSkillLinks.learningId, id));

  const tags = learning.relevanceTags ?? [];

  return (
    <>
      <SectionHeader
        title={learning.title.toUpperCase()}
        subtitle={`Source: ${learning.sourceType} · Distilled ${learning.distilledAt.toLocaleDateString()}`}
        action={
          <div className="flex items-center gap-3">
            <LearningStatusActions
              id={learning.id}
              currentStatus={learning.status}
            />
            <Link
              href="/workshop/learnings"
              className="font-mono text-xs text-cyan-400 hover:text-cyan-300"
            >
              &larr; Learnings
            </Link>
          </div>
        }
      />

      {/* Source link */}
      {learning.sourceUrl && (
        <a
          href={learning.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300 mb-6"
        >
          View original source &rarr;
        </a>
      )}

      {/* Full content */}
      <Card variant="dashed" className="mb-8">
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {learning.fullContent || learning.summary}
          </ReactMarkdown>
        </div>
      </Card>

      {/* Relevance tags */}
      {tags.length > 0 && (
        <div className="flex gap-2 mb-8">
          {tags.map((tag) => (
            <Badge key={tag} label={tag} variant="cyan" />
          ))}
        </div>
      )}

      {/* Proposed skill changes */}
      {links.length > 0 && (
        <>
          <h3 className="font-mono text-sm uppercase tracking-widest mb-4 text-gray-500">
            Proposed Skill Changes
          </h3>
          <div className="space-y-4">
            {links.map((link) => (
              <ProposedChangeCard
                key={link.linkId}
                linkId={link.linkId}
                skillSlug={link.skillSlug}
                skillName={link.skillName}
                proposedChange={link.proposedChange}
                status={link.linkStatus}
                learningId={id}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
