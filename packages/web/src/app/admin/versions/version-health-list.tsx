"use client";

import { useState } from "react";
import { VersionDistribution } from "@/components/admin/version-distribution";

interface VersionHealth {
  skillId: string;
  skillName: string;
  skillSlug: string;
  latestVersion: string | null;
  totalUsers: number;
  usersOnLatest: number;
  driftPercent: number;
  needsAttention: boolean;
  distribution: Array<{
    version: string;
    userCount: number;
    isLatest: boolean;
  }>;
  behindUsers: Array<{
    userId: string;
    githubUsername: string;
    currentVersion: string;
  }>;
}

export function VersionHealthList({
  versions,
}: {
  versions: VersionHealth[];
}) {
  const [nudging, setNudging] = useState<string | null>(null);

  async function handleNudge(skillSlug: string, userIds: string[]) {
    setNudging(skillSlug);
    await fetch("/api/admin/versions/nudge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillSlug, userIds }),
    });
    setNudging(null);
  }

  const sorted = [...versions].sort((a, b) => {
    if (a.needsAttention !== b.needsAttention)
      return a.needsAttention ? -1 : 1;
    return b.driftPercent - a.driftPercent;
  });

  if (sorted.length === 0) {
    return (
      <p className="font-mono text-sm text-gray-500">
        No version data yet. Users need to run check_updates first.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {sorted.map((skill) => (
        <div
          key={skill.skillId}
          className={`rounded-lg border p-4 ${
            skill.needsAttention
              ? "border-red-900/50 bg-[#161b22]"
              : "border-gray-800 bg-[#161b22]"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-mono text-sm font-medium text-gray-200">
                {skill.skillName}
              </h3>
              <p className="font-mono text-xs text-gray-500">
                Latest: {skill.latestVersion} &middot;{" "}
                {skill.usersOnLatest}/{skill.totalUsers} on latest &middot;{" "}
                <span
                  className={
                    skill.driftPercent > 50
                      ? "text-red-400"
                      : skill.driftPercent > 0
                        ? "text-amber-400"
                        : "text-green-400"
                  }
                >
                  {skill.driftPercent}% drift
                </span>
              </p>
            </div>
            {skill.behindUsers.length > 0 && (
              <button
                onClick={() =>
                  handleNudge(
                    skill.skillSlug,
                    skill.behindUsers.map((u) => u.userId)
                  )
                }
                disabled={nudging === skill.skillSlug}
                className="rounded bg-cyan-700 px-3 py-1.5 font-mono text-xs text-white hover:bg-cyan-600 disabled:opacity-50"
              >
                {nudging === skill.skillSlug
                  ? "Sending..."
                  : `Nudge ${skill.behindUsers.length} users`}
              </button>
            )}
          </div>

          <VersionDistribution distribution={skill.distribution} />

          {skill.behindUsers.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-mono text-xs text-gray-500">
                {skill.behindUsers.length} users behind
              </summary>
              <ul className="mt-1 space-y-1 pl-4 font-mono text-xs text-gray-400">
                {skill.behindUsers.map((u) => (
                  <li key={u.userId}>
                    {u.githubUsername} — on {u.currentVersion}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
