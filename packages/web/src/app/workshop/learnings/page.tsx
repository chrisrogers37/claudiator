import Link from "next/link";
import { createDb } from "@claudiator/db/client";
import { learnings } from "@claudiator/db/schema";
import { desc, eq, sql, and } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { LearningCard } from "./components/learning-card";

const db = createDb(process.env.DATABASE_URL!);

const STATUSES = ["all", "new", "reviewed", "applied", "dismissed"] as const;
const SOURCE_TYPES = ["all", "blog", "docs", "changelog", "community"] as const;

export default async function LearningsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string }>;
}) {
  const { status, source } = await searchParams;
  const statusFilter = STATUSES.includes(status as (typeof STATUSES)[number])
    ? (status as string)
    : "all";
  const sourceFilter = SOURCE_TYPES.includes(source as (typeof SOURCE_TYPES)[number])
    ? (source as string)
    : "all";

  const conditions = [];
  if (statusFilter !== "all") {
    conditions.push(eq(learnings.status, statusFilter as "new" | "reviewed" | "applied" | "dismissed"));
  }
  if (sourceFilter !== "all") {
    conditions.push(eq(learnings.sourceType, sourceFilter as "blog" | "docs" | "changelog" | "community"));
  }

  const items = await db
    .select({
      id: learnings.id,
      title: learnings.title,
      summary: learnings.summary,
      sourceUrl: learnings.sourceUrl,
      sourceType: learnings.sourceType,
      relevanceTags: learnings.relevanceTags,
      distilledAt: learnings.distilledAt,
      status: learnings.status,
      affectedSkillCount: sql<number>`COALESCE((
        SELECT COUNT(*) FROM learning_skill_links
        WHERE learning_id = ${learnings.id}
      ), 0)::int`,
    })
    .from(learnings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(learnings.distilledAt));

  const statusCounts = await db
    .select({
      status: learnings.status,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(learnings)
    .groupBy(learnings.status);

  const countMap: Record<string, number> = {};
  let total = 0;
  for (const row of statusCounts) {
    countMap[row.status] = row.count;
    total += row.count;
  }
  countMap["all"] = total;

  function buildHref(params: { status?: string; source?: string }) {
    const parts: string[] = [];
    if (params.status && params.status !== "all") parts.push(`status=${params.status}`);
    if (params.source && params.source !== "all") parts.push(`source=${params.source}`);
    return parts.length > 0 ? `/workshop/learnings?${parts.join("&")}` : "/workshop/learnings";
  }

  return (
    <>
      <SectionHeader
        title="LEARNINGS"
        subtitle="Distilled insights from external sources — review and apply to skills"
        action={
          <Link
            href="/workshop"
            className="font-mono text-xs text-cyan-400 hover:text-cyan-300"
          >
            &larr; Workshop
          </Link>
        }
      />

      {/* Status filter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="font-mono text-xs text-gray-600">Status:</span>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={buildHref({ status: s, source: sourceFilter })}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              statusFilter === s
                ? "bg-cyan-500/10 text-cyan-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            {countMap[s] !== undefined ? ` (${countMap[s]})` : ""}
          </Link>
        ))}
      </div>

      {/* Source type filter */}
      <div className="flex items-center gap-2 mb-6">
        <span className="font-mono text-xs text-gray-600">Source:</span>
        {SOURCE_TYPES.map((s) => (
          <Link
            key={s}
            href={buildHref({ status: statusFilter, source: s })}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              sourceFilter === s
                ? "bg-cyan-500/10 text-cyan-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
      </div>

      {/* Learnings grid */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-600">
          <p className="font-mono text-sm">No learnings yet</p>
          <p className="text-xs mt-1">
            The intelligence pipeline (Phase 06) will populate this view
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <LearningCard key={item.id} learning={item} />
          ))}
        </div>
      )}
    </>
  );
}
