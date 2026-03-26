import Link from "next/link";
import { createDb } from "@claudiator/db/client";
import { skillFeedback, skills, users } from "@claudiator/db/schema";
import { sql, desc, asc, eq, and } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RatingStars } from "@/components/ui/rating-stars";
import { FeedbackStatusSelect } from "./components/feedback-status-select";

const db = createDb(process.env.DATABASE_URL!);

const STATUSES = ["all", "new", "acknowledged", "in_progress", "resolved"] as const;

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string }>;
}) {
  const { status, sort } = await searchParams;
  const statusFilter = STATUSES.includes(status as (typeof STATUSES)[number])
    ? (status as string)
    : "all";
  const sortKey = sort === "newest" ? "newest" : "rating";

  // Get status counts
  const statusCounts = await db
    .select({
      status: skillFeedback.status,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(skillFeedback)
    .groupBy(skillFeedback.status);

  const countMap: Record<string, number> = {};
  let total = 0;
  for (const row of statusCounts) {
    countMap[row.status] = row.count;
    total += row.count;
  }
  countMap["all"] = total;

  // Build conditions
  const conditions = [];
  if (statusFilter !== "all") {
    conditions.push(
      eq(
        skillFeedback.status,
        statusFilter as "new" | "acknowledged" | "in_progress" | "resolved"
      )
    );
  }

  const feedbackItems = await db
    .select({
      id: skillFeedback.id,
      rating: skillFeedback.rating,
      comment: skillFeedback.comment,
      skillSlug: skillFeedback.skillSlug,
      skillVersion: skillFeedback.skillVersion,
      status: skillFeedback.status,
      createdAt: skillFeedback.createdAt,
      skillName: skills.name,
      username: users.githubUsername,
    })
    .from(skillFeedback)
    .innerJoin(skills, eq(skillFeedback.skillId, skills.id))
    .innerJoin(users, eq(users.id, skillFeedback.userId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      sortKey === "newest"
        ? desc(skillFeedback.createdAt)
        : asc(skillFeedback.rating)
    )
    .limit(100);

  function buildHref(params: { status?: string; sort?: string }) {
    const parts: string[] = [];
    if (params.status && params.status !== "all")
      parts.push(`status=${params.status}`);
    if (params.sort && params.sort !== "rating")
      parts.push(`sort=${params.sort}`);
    return parts.length > 0
      ? `/admin/feedback?${parts.join("&")}`
      : "/admin/feedback";
  }

  const statusVariant: Record<string, "green" | "amber" | "red" | "cyan" | "muted"> = {
    new: "red",
    acknowledged: "amber",
    in_progress: "cyan",
    resolved: "green",
  };

  return (
    <>
      <SectionHeader
        title="FEEDBACK TRIAGE"
        subtitle="Review and manage user feedback across all skills"
      />

      <div className="flex items-center gap-2 mb-4">
        <span className="font-mono text-xs text-gray-600">Status:</span>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={buildHref({ status: s, sort: sortKey })}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              statusFilter === s
                ? "bg-cyan-500/10 text-cyan-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {s === "all"
              ? "All"
              : s.replace("_", " ").charAt(0).toUpperCase() +
                s.replace("_", " ").slice(1)}
            {countMap[s] !== undefined ? ` (${countMap[s]})` : ""}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-6">
        <span className="font-mono text-xs text-gray-600">Sort:</span>
        {[
          { value: "rating", label: "Worst first" },
          { value: "newest", label: "Newest" },
        ].map((opt) => (
          <Link
            key={opt.value}
            href={buildHref({ status: statusFilter, sort: opt.value })}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              sortKey === opt.value
                ? "bg-cyan-500/10 text-cyan-400"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      {feedbackItems.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <p className="font-mono text-sm">No feedback found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {feedbackItems.map((fb) => (
            <Card key={fb.id}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RatingStars rating={fb.rating} size="sm" />
                  <span className="font-mono text-sm text-cyan-400">
                    /{fb.skillName}
                  </span>
                  <Badge
                    label={fb.status.replace("_", " ")}
                    variant={statusVariant[fb.status] || "muted"}
                  />
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs text-gray-500">
                    {fb.username}
                  </span>
                  <span className="font-mono text-xs text-gray-600">
                    {new Date(fb.createdAt).toLocaleDateString()}
                  </span>
                  <FeedbackStatusSelect
                    feedbackId={fb.id}
                    currentStatus={fb.status}
                  />
                </div>
              </div>
              {fb.comment && (
                <p className="text-sm text-gray-400 mt-2">{fb.comment}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
