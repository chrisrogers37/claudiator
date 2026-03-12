"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BattleExecuteButton({ battleId }: { battleId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleExecute() {
    setLoading(true);
    try {
      await fetch(`/api/arena/battles/${battleId}/execute`, { method: "POST" });
      router.refresh();
    } catch (err) {
      console.error("Execute failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExecute}
      disabled={loading}
      className="rounded border border-green-700 bg-green-900/30 px-3 py-1 font-mono text-xs text-green-400 hover:bg-green-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? "Executing..." : "Execute Battle"}
    </button>
  );
}
