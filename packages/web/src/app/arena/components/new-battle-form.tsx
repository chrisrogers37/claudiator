"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Champion {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  versionId: string;
  version: string;
}

interface Candidate {
  id: string;
  name: string;
  category: string | null;
  fightScore: number | null;
  sourceUrl: string | null;
}

export function NewBattleForm({
  champions,
  candidates,
}: {
  champions: Champion[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [championId, setChampionId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedChampion = champions.find((c) => c.id === championId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!championId || !candidateId) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/arena/battles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          championSkillId: championId,
          championVersionId: selectedChampion?.versionId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create battle");
        return;
      }

      const { id: battleId } = await res.json();

      // Auto-execute
      fetch(`/api/arena/battles/${battleId}/execute`, { method: "POST" });

      router.push(`/arena/${battleId}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-[#161b22] p-4">
      <h2 className="font-mono text-sm text-gray-400 uppercase tracking-wider mb-3">
        New Battle
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Champion picker */}
          <div>
            <label className="block font-mono text-xs text-yellow-500 mb-1">
              Champion (incumbent skill)
            </label>
            <select
              value={championId}
              onChange={(e) => setChampionId(e.target.value)}
              className="w-full rounded border border-gray-700 bg-[#0d1117] px-3 py-2 font-mono text-xs text-gray-200 focus:border-yellow-500 focus:outline-none"
            >
              <option value="">Select champion...</option>
              {champions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.category || "uncategorized"}) — v{c.version}
                </option>
              ))}
            </select>
          </div>

          {/* Challenger picker */}
          <div>
            <label className="block font-mono text-xs text-orange-400 mb-1">
              Challenger (intake candidate)
            </label>
            <select
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
              className="w-full rounded border border-gray-700 bg-[#0d1117] px-3 py-2 font-mono text-xs text-gray-200 focus:border-orange-400 focus:outline-none"
            >
              <option value="">Select challenger...</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.category || "uncategorized"}) — score: {c.fightScore ?? "—"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p className="font-mono text-xs text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !championId || !candidateId}
          className="rounded border border-green-700 bg-green-900/30 px-4 py-2 font-mono text-xs text-green-400 hover:bg-green-900/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Creating & Executing..." : "Create & Execute Battle"}
        </button>
      </form>
    </div>
  );
}
