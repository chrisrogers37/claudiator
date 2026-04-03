import { createDb } from "@claudiator/db/client";
import {
  intakeCandidates,
  skills,
  skillCategories,
  battles,
} from "@claudiator/db/schema";
import { desc, eq, count, sql } from "drizzle-orm";
import { IntakeActions } from "../components/intake-actions";
import { CandidateSubmitForm } from "../components/candidate-submit-form";
import { IntakeStatusFilter } from "../components/intake-status-filter";
import { Pagination } from "../components/pagination";
import { formatCategoryLabel } from "@/lib/format-category";
import Link from "next/link";

const PAGE_SIZE = 25;

const STATUS_TEXT_COLOR: Record<string, string> = {
  new: "text-gray-400",
  categorized: "text-amber-400",
  scored: "text-cyan-400",
  queued: "text-green-400",
  battling: "text-cyan-400",
  promoted: "text-green-400",
  rejected: "text-red-400",
  dismissed: "text-gray-500",
};

const STATUS_BADGE: Record<string, string> = {
  new: "bg-gray-800 text-gray-400",
  categorized: "bg-amber-900/40 text-amber-400",
  scored: "bg-cyan-900/40 text-cyan-400",
  queued: "bg-green-900/40 text-green-400",
  battling: "bg-cyan-900/40 text-cyan-400 animate-pulse",
  promoted: "bg-green-900/40 text-green-400",
  rejected: "bg-red-900/40 text-red-400",
  dismissed: "bg-gray-800 text-gray-500",
};

export default async function IntakePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status, page: pageParam } = await searchParams;
  const currentPage = Math.max(1, parseInt(pageParam || "1", 10) || 1);
  const db = createDb(process.env.DATABASE_URL!);

  const allStatuses = [
    "new",
    "categorized",
    "scored",
    "queued",
    "battling",
    "promoted",
    "rejected",
    "dismissed",
  ] as const;

  const whereClause = status
    ? eq(intakeCandidates.status, status as (typeof allStatuses)[number])
    : undefined;

  // ── Parallel queries: stats + candidates ──────────────────────────────────
  const [statusCounts, candidates] = await Promise.all([
    db
      .select({ status: intakeCandidates.status, count: count() })
      .from(intakeCandidates)
      .groupBy(intakeCandidates.status),
    db
      .select({
        id: intakeCandidates.id,
        sourceType: intakeCandidates.sourceType,
        sourceUrl: intakeCandidates.sourceUrl,
        extractedPurpose: intakeCandidates.extractedPurpose,
        fightScore: intakeCandidates.fightScore,
        status: intakeCandidates.status,
        createdAt: intakeCandidates.createdAt,
        categoryDomain: skillCategories.domain,
        categoryFunction: skillCategories.function,
        championName: skills.name,
      })
      .from(intakeCandidates)
      .leftJoin(skillCategories, eq(intakeCandidates.categoryId, skillCategories.id))
      .leftJoin(skills, eq(intakeCandidates.matchedChampionSkillId, skills.id))
      .where(whereClause)
      .orderBy(desc(intakeCandidates.createdAt))
      .limit(PAGE_SIZE)
      .offset((currentPage - 1) * PAGE_SIZE),
  ]);

  const countMap: Record<string, number> = {};
  for (const row of statusCounts) {
    countMap[row.status] = row.count;
  }
  const totalCandidates = allStatuses.reduce(
    (sum, s) => sum + (countMap[s] || 0),
    0
  );
  const totalRows = status ? (countMap[status] || 0) : totalCandidates;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  // ── Batch-load battle IDs for candidates in terminal statuses ──────────────
  const terminalIds = candidates
    .filter((c) => ["battling", "promoted", "rejected"].includes(c.status))
    .map((c) => c.id);
  const battleMap = new Map<string, string>();
  if (terminalIds.length > 0) {
    const battleLinks = await db
      .select({ challengerId: battles.challengerId, battleId: battles.id })
      .from(battles)
      .where(sql`${battles.challengerId} IN (${sql.join(terminalIds.map((id) => sql`${id}`), sql`, `)})`)
      .orderBy(desc(battles.createdAt));
    for (const b of battleLinks) {
      if (!battleMap.has(b.challengerId)) battleMap.set(b.challengerId, b.battleId);
    }
  }

  // ── Build searchParams for pagination links ────────────────────────────────
  const paginationParams: Record<string, string> = {};
  if (status) paginationParams.status = status;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-mono text-2xl text-yellow-500">Intake Queue</h1>
        <span className="font-mono text-xs text-gray-500">
          {totalCandidates} total candidates
        </span>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        {allStatuses.map((s) => {
          const n = countMap[s] || 0;
          const colorClass = STATUS_TEXT_COLOR[s] ?? "text-gray-500";
          return (
            <div
              key={s}
              className="rounded border border-gray-800 bg-[#161b22] px-3 py-1.5 font-mono text-xs"
            >
              <span className="text-gray-500">{s}:</span>{" "}
              <span className={colorClass}>{n}</span>
            </div>
          );
        })}
      </div>

      {/* Status Filter */}
      <div className="mb-4">
        <IntakeStatusFilter currentStatus={status || ""} />
      </div>

      <CandidateSubmitForm />

      {/* Candidates Table */}
      <div className="rounded-lg border border-gray-800 bg-[#161b22] overflow-x-auto mt-6">
        <table className="w-full min-w-[700px]">
          <thead>
            <tr className="border-b border-gray-800">
              {[
                "Status",
                "Source",
                "Purpose",
                "Category",
                "Champion",
                "Score",
                "Battle",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-mono text-xs text-gray-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center font-mono text-sm text-gray-500"
                >
                  {status
                    ? `No candidates with status "${status}".`
                    : "No candidates yet. Submit one above."}
                </td>
              </tr>
            ) : (
              candidates.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/20"
                >
                  {/* Status badge */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 font-mono text-xs ${STATUS_BADGE[c.status] ?? "bg-gray-800 text-gray-500"}`}
                    >
                      {c.status}
                    </span>
                  </td>

                  {/* Source (truncated URL) */}
                  <td className="px-4 py-3 font-mono text-xs text-cyan-400 max-w-[160px] truncate">
                    {c.sourceUrl ? (
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        title={c.sourceUrl}
                      >
                        {c.sourceUrl.length > 40
                          ? c.sourceUrl.slice(0, 40) + "..."
                          : c.sourceUrl}
                      </a>
                    ) : (
                      <span className="text-gray-600">--</span>
                    )}
                  </td>

                  {/* Purpose (truncated) */}
                  <td
                    className="px-4 py-3 font-mono text-xs text-gray-300 max-w-[200px] truncate"
                    title={c.extractedPurpose || undefined}
                  >
                    {c.extractedPurpose || "--"}
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    {formatCategoryLabel(
                      c.categoryDomain,
                      c.categoryFunction,
                      "\u2014"
                    )}
                  </td>

                  {/* Champion */}
                  <td className="px-4 py-3 font-mono text-xs text-yellow-500">
                    {c.championName || "\u2014"}
                  </td>

                  {/* Score */}
                  <td className="px-4 py-3 font-mono text-xs text-gray-200">
                    {c.fightScore != null ? c.fightScore : "\u2014"}
                  </td>

                  {/* Battle link */}
                  <td className="px-4 py-3 font-mono text-xs">
                    {battleMap.get(c.id) ? (
                      <Link
                        href={`/arena/${battleMap.get(c.id)}`}
                        className="text-cyan-400 hover:underline"
                      >
                        View
                      </Link>
                    ) : (
                      <span className="text-gray-600">\u2014</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <IntakeActions candidateId={c.id} status={c.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        basePath="/arena/intake"
        searchParams={paginationParams}
      />
    </>
  );
}
