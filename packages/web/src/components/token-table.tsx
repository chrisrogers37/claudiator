"use client";

import { useEffect, useState } from "react";

interface Token {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  createdAt: string;
}

export function TokenTable() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tokens")
      .then((res) => res.json())
      .then(setTokens)
      .finally(() => setLoading(false));
  }, []);

  const handleRevoke = async (id: string) => {
    const res = await fetch(`/api/tokens/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTokens((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, revokedAt: new Date().toISOString() } : t
        )
      );
    }
  };

  const handleRotate = async (id: string) => {
    const res = await fetch(`/api/tokens/${id}/rotate`, { method: "POST" });
    if (res.ok) {
      const newToken = await res.json();
      alert(`New token (copy now — shown once):\n\n${newToken.rawToken}`);
      // Refresh the list
      const listRes = await fetch("/api/tokens");
      setTokens(await listRes.json());
    }
  };

  if (loading) {
    return <p className="text-gray-500 font-mono text-sm">Loading tokens...</p>;
  }

  if (tokens.length === 0) {
    return (
      <p className="text-gray-500 font-mono text-sm">
        No API keys yet. Generate one to get started.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700 text-gray-400 font-mono text-xs">
            <th className="text-left py-2 pr-4">Name</th>
            <th className="text-left py-2 pr-4">Prefix</th>
            <th className="text-left py-2 pr-4">Status</th>
            <th className="text-left py-2 pr-4">Last Used</th>
            <th className="text-left py-2 pr-4">Calls</th>
            <th className="text-right py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => {
            const isRevoked = !!token.revokedAt;
            const isExpired =
              token.expiresAt && new Date(token.expiresAt) < new Date();

            return (
              <tr
                key={token.id}
                className="border-b border-gray-800 hover:bg-[#161b22]"
              >
                <td className="py-3 pr-4 font-mono">{token.name}</td>
                <td className="py-3 pr-4 font-mono text-gray-400">
                  {token.prefix}...
                </td>
                <td className="py-3 pr-4">
                  {isRevoked ? (
                    <span className="text-red-400 font-mono text-xs">Revoked</span>
                  ) : isExpired ? (
                    <span className="text-amber-400 font-mono text-xs">Expired</span>
                  ) : (
                    <span className="text-green-400 font-mono text-xs">Active</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-gray-400 text-xs">
                  {token.lastUsedAt
                    ? new Date(token.lastUsedAt).toLocaleDateString()
                    : "Never"}
                </td>
                <td className="py-3 pr-4 text-gray-400 text-xs font-mono">
                  {token.totalCalls}
                </td>
                <td className="py-3 text-right">
                  {!isRevoked && !isExpired && (
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => handleRotate(token.id)}
                        className="px-2 py-1 text-xs font-mono text-amber-400 hover:text-amber-300 border border-amber-400/30 hover:border-amber-400/50 rounded transition-colors"
                      >
                        Rotate
                      </button>
                      <button
                        onClick={() => handleRevoke(token.id)}
                        className="px-2 py-1 text-xs font-mono text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-400/50 rounded transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
