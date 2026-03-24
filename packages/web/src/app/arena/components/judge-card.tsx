"use client";

import { useState } from "react";

interface Scores {
  champion: {
    accuracy: number;
    completeness: number;
    style: number;
    efficiency: number;
    total: number;
  };
  challenger: {
    accuracy: number;
    completeness: number;
    style: number;
    efficiency: number;
    total: number;
  };
}

interface JudgeCardProps {
  judgeIndex: number;
  winnerId: string;
  confidence: number;
  scores: Scores;
  reasoning: string;
}

const dimensions = ["accuracy", "completeness", "style", "efficiency"] as const;

export function JudgeCard({
  judgeIndex,
  winnerId,
  confidence,
  scores,
  reasoning,
}: JudgeCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-800 bg-[#161b22] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <span className="font-mono text-xs text-gray-400 uppercase tracking-wider">
          Judge {judgeIndex + 1}
        </span>
        <div className="flex items-center gap-3">
          <span
            className={`font-mono text-xs font-bold uppercase ${
              winnerId === "champion"
                ? "text-yellow-500"
                : winnerId === "challenger"
                  ? "text-orange-400"
                  : "text-gray-400"
            }`}
          >
            {winnerId}
          </span>
          <span className="font-mono text-xs rounded-full bg-gray-800 px-2 py-0.5 text-gray-400">
            {confidence}%
          </span>
        </div>
      </div>

      {/* Score Grid */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-4 gap-2 mb-3">
          {dimensions.map((dim) => {
            const champVal = scores.champion[dim];
            const challVal = scores.challenger[dim];
            const champHigher = champVal > challVal;
            const challHigher = challVal > champVal;
            return (
              <div key={dim} className="text-center">
                <p className="font-mono text-xs text-gray-500 uppercase tracking-wider mb-1.5 truncate">
                  {dim.slice(0, 4)}
                </p>
                <p
                  className={`font-mono text-sm ${champHigher ? "text-yellow-500" : "text-gray-500"}`}
                >
                  {champVal}
                </p>
                <div className="h-px bg-gray-800 my-1" />
                <p
                  className={`font-mono text-sm ${challHigher ? "text-orange-400" : "text-gray-500"}`}
                >
                  {challVal}
                </p>
              </div>
            );
          })}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between rounded bg-[#0d1117] px-3 py-2">
          <span className="font-mono text-sm text-yellow-500 font-bold">
            {scores.champion.total}
          </span>
          <span className="font-mono text-xs text-gray-600 uppercase tracking-wider">
            Total
          </span>
          <span className="font-mono text-sm text-orange-400 font-bold">
            {scores.challenger.total}
          </span>
        </div>

        {/* Reasoning toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 w-full text-left font-mono text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          {expanded ? "\u25BC" : "\u25B6"} reasoning
        </button>
        {expanded && (
          <p className="mt-2 font-mono text-xs text-gray-500 leading-relaxed">
            {reasoning}
          </p>
        )}
      </div>
    </div>
  );
}
