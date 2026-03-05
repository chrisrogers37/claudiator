"use client";

import { SortableTable } from "@/components/admin/sortable-table";

interface SkillMetric {
  id: string;
  name: string;
  slug: string;
  latestVersion: string;
  invocations7d: number;
  invocations30d: number;
  invocationsTotal: number;
  uniqueUsers7d: number;
  uniqueUsers30d: number;
  averageRating: number | null;
  feedbackCount: number;
  isDead: boolean;
  isProblem: boolean;
}

const columns = [
  {
    key: "name",
    label: "Skill",
    sortable: false,
    render: (skill: SkillMetric) => (
      <div className="flex items-center gap-2">
        <span className="text-gray-200">{skill.name}</span>
        {skill.isDead && (
          <span className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-xs text-gray-500">
            dead
          </span>
        )}
        {skill.isProblem && (
          <span className="rounded bg-red-900/30 px-1.5 py-0.5 font-mono text-xs text-red-400">
            low rating
          </span>
        )}
      </div>
    ),
  },
  { key: "invocations7d", label: "7d", sortable: true },
  { key: "invocations30d", label: "30d", sortable: true },
  { key: "invocationsTotal", label: "Total", sortable: true },
  { key: "uniqueUsers7d", label: "7d Users", sortable: true },
  { key: "uniqueUsers30d", label: "30d Users", sortable: true },
  {
    key: "averageRating",
    label: "Rating",
    sortable: true,
    render: (skill: SkillMetric) =>
      skill.averageRating !== null
        ? `${skill.averageRating.toFixed(1)} / 5`
        : "\u2014",
  },
  { key: "feedbackCount", label: "Feedback", sortable: true },
];

export function SkillsTable({ skills }: { skills: SkillMetric[] }) {
  return (
    <SortableTable
      data={skills}
      columns={columns}
      defaultSort="invocations30d"
      defaultDir="desc"
    />
  );
}
