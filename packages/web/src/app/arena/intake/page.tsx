import { createDb } from "@claudiator/db/client";
import { intakeCandidates, skillCategories } from "@claudiator/db/schema";
import { desc, eq } from "drizzle-orm";
import { IntakeActions } from "../components/intake-actions";
import { CandidateSubmitForm } from "../components/candidate-submit-form";

export default async function IntakePage() {
  const db = createDb(process.env.DATABASE_URL!);

  const candidates = await db
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
    })
    .from(intakeCandidates)
    .leftJoin(skillCategories, eq(intakeCandidates.categoryId, skillCategories.id))
    .orderBy(desc(intakeCandidates.createdAt));

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-mono text-2xl text-yellow-500">Intake Queue</h1>
      </div>

      <CandidateSubmitForm />

      {/* Candidates Table */}
      <div className="rounded-lg border border-gray-800 bg-[#161b22] overflow-x-auto mt-6">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              {["Source", "URL", "Purpose", "Category", "Fight Score", "Status", "Actions"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left font-mono text-xs text-gray-500 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center font-mono text-sm text-gray-500"
                >
                  No candidates yet. Submit one above.
                </td>
              </tr>
            ) : (
              candidates.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-gray-800/50 hover:bg-gray-800/20"
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-300">
                    {c.sourceType.replace(/_/g, " ")}
                  </td>
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
                  <td
                    className="px-4 py-3 font-mono text-xs text-gray-300 max-w-[200px] truncate"
                    title={c.extractedPurpose || undefined}
                  >
                    {c.extractedPurpose || "--"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    {c.categoryDomain && c.categoryFunction ? `${c.categoryDomain}/${c.categoryFunction}` : "--"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-200">
                    {c.fightScore != null ? c.fightScore : "--"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 font-mono text-xs ${
                        c.status === "new"
                          ? "bg-gray-800 text-gray-400"
                          : c.status === "categorized"
                            ? "bg-amber-900/40 text-amber-400"
                            : c.status === "scored"
                              ? "bg-cyan-900/40 text-cyan-400"
                              : c.status === "queued"
                                ? "bg-green-900/40 text-green-400"
                                : c.status === "battling"
                                  ? "bg-cyan-900/40 text-cyan-400 animate-pulse"
                                  : c.status === "promoted"
                                    ? "bg-green-900/40 text-green-400"
                                    : c.status === "rejected"
                                      ? "bg-red-900/40 text-red-400"
                                      : "bg-gray-800 text-gray-500"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <IntakeActions candidateId={c.id} status={c.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
