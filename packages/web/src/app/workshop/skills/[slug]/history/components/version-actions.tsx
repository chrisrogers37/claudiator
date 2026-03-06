"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface VersionActionsProps {
  slug: string;
  skillId: string;
  version: string;
  versionId: string;
  isLatest: boolean;
}

export function VersionActions({
  slug,
  skillId,
  version,
  versionId,
  isLatest,
}: VersionActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isRollingBack, setIsRollingBack] = useState(false);

  const compareParam = searchParams.get("compare") || "";
  const compareVersions = compareParam.split(",").filter(Boolean);
  const isSelected = compareVersions.includes(version);

  function toggleCompare() {
    const params = new URLSearchParams(searchParams.toString());
    let selected = [...compareVersions];

    if (isSelected) {
      selected = selected.filter((v) => v !== version);
    } else {
      if (selected.length >= 2) selected.shift();
      selected.push(version);
    }

    if (selected.length > 0) {
      params.set("compare", selected.join(","));
    } else {
      params.delete("compare");
    }

    router.push(`/workshop/skills/${slug}/history?${params.toString()}`);
  }

  async function handleRollback() {
    setIsRollingBack(true);
    try {
      await fetch(`/api/skills/${slug}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillId,
          rollbackFromVersionId: versionId,
        }),
      });
      router.refresh();
    } finally {
      setIsRollingBack(false);
    }
  }

  return (
    <>
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={toggleCompare}
          className="accent-cyan-400"
        />
        <span className="text-xs text-gray-600">Compare</span>
      </label>

      {!isLatest && (
        <button
          onClick={handleRollback}
          disabled={isRollingBack}
          className="text-xs font-mono px-2 py-1 rounded border border-amber-500 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
        >
          {isRollingBack ? "..." : "Rollback"}
        </button>
      )}
    </>
  );
}
