import Link from "next/link";
import { BattleStatusBadge } from "./battle-status-badge";

interface FightCardProps {
  id: string;
  championName: string;
  challengerName: string;
  status: string;
  verdict?: string | null;
  totalLlmCalls?: number | null;
  totalCostCents?: number | null;
  compact?: boolean;
}

function verdictBorderClass(status: string, verdict?: string | null): string {
  if (status === "pending") return "border-dashed border-gray-700";
  if (status === "running" || status === "judging")
    return "border-cyan-500/40 animate-arena-pulse";
  if (status === "failed") return "border-red-400/40";
  if (verdict === "champion_wins") return "border-yellow-500/30";
  if (verdict === "challenger_wins") return "border-orange-400/30";
  return "border-gray-700";
}

export function FightCard({
  id,
  championName,
  challengerName,
  status,
  verdict,
  totalLlmCalls,
  totalCostCents,
  compact = false,
}: FightCardProps) {
  const champWon = verdict === "champion_wins";
  const challWon = verdict === "challenger_wins";

  return (
    <Link
      href={`/arena/${id}`}
      className={`block rounded-lg border bg-[#161b22] transition-all hover:border-yellow-500/30 hover:shadow-[0_0_12px_rgba(234,179,8,0.06)] ${verdictBorderClass(status, verdict)}`}
    >
      <div className={`${compact ? "p-3" : "p-4"}`}>
        {/* Champion vs Challenger row */}
        <div className="flex items-center justify-between gap-3">
          {/* Champion */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-0.5 h-5 rounded-full bg-yellow-500 shrink-0" />
            <span
              className={`font-mono truncate ${compact ? "text-xs" : "text-sm"} ${
                challWon ? "text-yellow-500/40" : "text-yellow-500"
              }`}
            >
              {championName}
            </span>
          </div>

          {/* VS */}
          <div className="shrink-0 flex flex-col items-center">
            <span
              className={`font-mono font-bold text-gray-600 ${compact ? "text-xs" : "text-sm"}`}
            >
              VS
            </span>
            <BattleStatusBadge status={status} />
          </div>

          {/* Challenger */}
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <span
              className={`font-mono truncate ${compact ? "text-xs" : "text-sm"} ${
                champWon ? "text-orange-400/40" : "text-orange-400"
              }`}
            >
              {challengerName}
            </span>
            <div className="w-0.5 h-5 rounded-full bg-orange-400 shrink-0" />
          </div>
        </div>

        {/* Footer: verdict + meta */}
        {(verdict || status === "pending") && (
          <div className={`${compact ? "mt-2" : "mt-3"}`}>
            <div className="flex items-center justify-between">
              {verdict ? (
                <span
                  className={`font-mono text-xs font-bold ${
                    champWon
                      ? "text-yellow-500"
                      : challWon
                        ? "text-orange-400"
                        : "text-gray-400"
                  }`}
                >
                  {verdict.replace(/_/g, " ")}
                </span>
              ) : status === "pending" ? (
                <span className="font-mono text-xs text-gray-600">
                  Awaiting execution
                </span>
              ) : (
                <span />
              )}
              {!compact && (totalLlmCalls != null || totalCostCents != null) && (
                <div className="flex items-center gap-3">
                  {totalLlmCalls != null && (
                    <span className="font-mono text-xs text-gray-600">
                      {totalLlmCalls} calls
                    </span>
                  )}
                  {totalCostCents != null && (
                    <span className="font-mono text-xs text-gray-600">
                      ${(totalCostCents / 100).toFixed(3)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}
