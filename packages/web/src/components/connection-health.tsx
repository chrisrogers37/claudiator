"use client";

import { useEffect, useState } from "react";

interface Token {
  id: string;
  name: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function ConnectionHealth() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tokens")
      .then((res) => res.json())
      .then(setTokens)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-gray-500 font-mono text-sm">Loading...</p>;
  }

  const activeTokens = tokens.filter((t) => !t.revokedAt);
  const totalCalls = activeTokens.reduce((sum, t) => sum + t.totalCalls, 0);
  const successfulCalls = activeTokens.reduce(
    (sum, t) => sum + t.successfulCalls,
    0
  );
  const failedCalls = activeTokens.reduce(
    (sum, t) => sum + t.failedCalls,
    0
  );
  const lastUsed = activeTokens
    .filter((t) => t.lastUsedAt)
    .sort(
      (a, b) =>
        new Date(b.lastUsedAt!).getTime() - new Date(a.lastUsedAt!).getTime()
    )[0];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="bg-[#161b22] border border-gray-700 rounded p-4">
        <p className="text-gray-500 font-mono text-xs mb-1">Active Keys</p>
        <p className="text-2xl font-mono text-green-400">
          {activeTokens.length}
        </p>
      </div>
      <div className="bg-[#161b22] border border-gray-700 rounded p-4">
        <p className="text-gray-500 font-mono text-xs mb-1">Total Calls</p>
        <p className="text-2xl font-mono text-gray-200">{totalCalls}</p>
      </div>
      <div className="bg-[#161b22] border border-gray-700 rounded p-4">
        <p className="text-gray-500 font-mono text-xs mb-1">Success Rate</p>
        <p className="text-2xl font-mono text-green-400">
          {totalCalls > 0
            ? `${Math.round((successfulCalls / totalCalls) * 100)}%`
            : "—"}
        </p>
      </div>
      <div className="bg-[#161b22] border border-gray-700 rounded p-4">
        <p className="text-gray-500 font-mono text-xs mb-1">Last Used</p>
        <p className="text-sm font-mono text-gray-400">
          {lastUsed?.lastUsedAt
            ? new Date(lastUsed.lastUsedAt).toLocaleDateString()
            : "Never"}
        </p>
      </div>
    </div>
  );
}
