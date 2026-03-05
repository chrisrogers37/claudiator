"use client";

import { useRouter, useSearchParams } from "next/navigation";

const SORT_OPTIONS = [
  { value: "name", label: "A–Z" },
  { value: "usage", label: "Most Used" },
  { value: "rating", label: "Highest Rated" },
  { value: "updated", label: "Recently Updated" },
] as const;

interface SortSelectorProps {
  value: string;
}

export function SortSelector({ value }: SortSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(newSort: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (newSort === "name") {
      params.delete("sort");
    } else {
      params.set("sort", newSort);
    }
    router.push(`/workshop?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm font-mono bg-[#161b22] border border-gray-800 text-gray-300 focus:outline-none focus:border-cyan-500/50"
    >
      {SORT_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
