"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
}

interface SortableTableProps<T> {
  data: T[];
  columns: Column<T>[];
  defaultSort: string;
  defaultDir: "asc" | "desc";
}

export function SortableTable<T extends Record<string, unknown>>({
  data,
  columns,
  defaultSort,
  defaultDir,
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState(defaultSort);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultDir);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...data].sort((a, b) => {
    const aVal = (a[sortKey] as string | number) ?? "";
    const bVal = (b[sortKey] as string | number) ?? "";
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === "desc" ? -cmp : cmp;
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800">
      <table className="w-full text-left font-mono text-sm">
        <thead className="border-b border-gray-800 bg-[#161b22]">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-xs font-medium text-gray-500 ${
                  col.sortable !== false
                    ? "cursor-pointer select-none hover:text-gray-300"
                    : ""
                }`}
                onClick={() => col.sortable !== false && handleSort(col.key)}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key &&
                    (sortDir === "desc" ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronUp className="h-3 w-3" />
                    ))}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {sorted.map((item, idx) => (
            <tr key={idx} className="hover:bg-[#161b22]">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-gray-300">
                  {col.render
                    ? col.render(item)
                    : (item[col.key] as React.ReactNode)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
