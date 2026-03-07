"use client";

import { useRouter } from "next/navigation";

interface NudgeButtonProps {
  skillSlug: string;
}

export function NudgeButton({ skillSlug }: NudgeButtonProps) {
  const router = useRouter();

  async function handleNudge() {
    await fetch("/api/admin/versions/nudge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillSlug }),
    });
    router.refresh();
  }

  return (
    <button
      onClick={handleNudge}
      className="px-2 py-1 rounded text-xs font-mono text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 transition-colors"
    >
      Nudge
    </button>
  );
}
