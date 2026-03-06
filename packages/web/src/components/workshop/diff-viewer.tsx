"use client";

import { useState, useMemo } from "react";
import { diffLines, type Change } from "diff";

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  oldLabel?: string;
  newLabel?: string;
}

type DiffStyle = "unified" | "split";

export function DiffViewer({
  oldContent,
  newContent,
  oldLabel = "Before",
  newLabel = "After",
}: DiffViewerProps) {
  const [style, setStyle] = useState<DiffStyle>("unified");

  const changes = useMemo(
    () => diffLines(oldContent, newContent),
    [oldContent, newContent]
  );

  const hasChanges = changes.some((c) => c.added || c.removed);

  return (
    <div>
      <div className="flex items-center justify-between p-3 border-b border-gray-800">
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-red-400">{oldLabel}</span>
          <span className="text-gray-600">&rarr;</span>
          <span className="text-green-400">{newLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-600">View:</span>
          {(["unified", "split"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`px-2 py-1 rounded text-xs font-mono uppercase ${
                style === s
                  ? "text-cyan-400 bg-cyan-400/10"
                  : "text-gray-600 hover:text-gray-400"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div
        className="overflow-x-auto font-mono text-[13px]"
        style={{ backgroundColor: "#0f1520" }}
      >
        {!hasChanges ? (
          <div className="p-6 text-center text-gray-600 text-sm">
            No changes
          </div>
        ) : style === "unified" ? (
          <UnifiedView changes={changes} />
        ) : (
          <SplitView changes={changes} />
        )}
      </div>
    </div>
  );
}

function UnifiedView({ changes }: { changes: Change[] }) {
  let oldLine = 1;
  let newLine = 1;

  return (
    <table className="w-full border-collapse">
      <tbody>
        {changes.map((change, ci) => {
          const lines = change.value.replace(/\n$/, "").split("\n");
          return lines.map((line, li) => {
            const key = `${ci}-${li}`;
            let oldNum: number | null = null;
            let newNum: number | null = null;

            if (change.removed) {
              oldNum = oldLine++;
            } else if (change.added) {
              newNum = newLine++;
            } else {
              oldNum = oldLine++;
              newNum = newLine++;
            }

            const bg = change.removed
              ? "bg-red-400/[0.06]"
              : change.added
                ? "bg-green-400/[0.06]"
                : "";
            const prefix = change.removed ? "-" : change.added ? "+" : " ";
            const prefixColor = change.removed
              ? "text-red-400"
              : change.added
                ? "text-green-400"
                : "text-gray-600";

            return (
              <tr key={key} className={bg}>
                <td className="w-12 text-right pr-2 select-none text-gray-700 text-xs align-top py-px">
                  {oldNum ?? ""}
                </td>
                <td className="w-12 text-right pr-2 select-none text-gray-700 text-xs align-top py-px border-r border-gray-800/50">
                  {newNum ?? ""}
                </td>
                <td className={`w-4 text-center select-none ${prefixColor} py-px`}>
                  {prefix}
                </td>
                <td className="pl-2 pr-4 py-px whitespace-pre text-gray-300">
                  {line}
                </td>
              </tr>
            );
          });
        })}
      </tbody>
    </table>
  );
}

function SplitView({ changes }: { changes: Change[] }) {
  // Build paired lines for split view
  const leftLines: { num: number; text: string; type: "removed" | "context" }[] = [];
  const rightLines: { num: number; text: string; type: "added" | "context" }[] = [];

  let oldLine = 1;
  let newLine = 1;

  for (const change of changes) {
    const lines = change.value.replace(/\n$/, "").split("\n");
    if (change.removed) {
      for (const line of lines) {
        leftLines.push({ num: oldLine++, text: line, type: "removed" });
      }
    } else if (change.added) {
      for (const line of lines) {
        rightLines.push({ num: newLine++, text: line, type: "added" });
      }
    } else {
      // Pad the shorter side before adding context lines
      while (leftLines.length < rightLines.length) {
        leftLines.push({ num: 0, text: "", type: "context" });
      }
      while (rightLines.length < leftLines.length) {
        rightLines.push({ num: 0, text: "", type: "context" });
      }
      for (const line of lines) {
        leftLines.push({ num: oldLine++, text: line, type: "context" });
        rightLines.push({ num: newLine++, text: line, type: "context" });
      }
    }
  }

  // Pad to equal length
  while (leftLines.length < rightLines.length) {
    leftLines.push({ num: 0, text: "", type: "context" });
  }
  while (rightLines.length < leftLines.length) {
    rightLines.push({ num: 0, text: "", type: "context" });
  }

  return (
    <div className="flex">
      <table className="w-1/2 border-collapse border-r border-gray-800">
        <tbody>
          {leftLines.map((line, i) => {
            const bg =
              line.type === "removed"
                ? "bg-red-400/[0.06]"
                : line.num === 0
                  ? "bg-gray-800/20"
                  : "";
            return (
              <tr key={i} className={bg}>
                <td className="w-12 text-right pr-2 select-none text-gray-700 text-xs py-px">
                  {line.num > 0 ? line.num : ""}
                </td>
                <td className="pl-2 pr-4 py-px whitespace-pre text-gray-300">
                  {line.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <table className="w-1/2 border-collapse">
        <tbody>
          {rightLines.map((line, i) => {
            const bg =
              line.type === "added"
                ? "bg-green-400/[0.06]"
                : line.num === 0
                  ? "bg-gray-800/20"
                  : "";
            return (
              <tr key={i} className={bg}>
                <td className="w-12 text-right pr-2 select-none text-gray-700 text-xs py-px">
                  {line.num > 0 ? line.num : ""}
                </td>
                <td className="pl-2 pr-4 py-px whitespace-pre text-gray-300">
                  {line.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
