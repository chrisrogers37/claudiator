"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const sortOptions = [
  { value: "date", label: "Newest" },
  { value: "rating", label: "Rating" },
] as const;

interface FeedbackSortControlsProps {
  currentSort: string;
}

export function FeedbackSortControls({
  currentSort,
}: FeedbackSortControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleSort(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "date") {
      params.delete("sort");
    } else {
      params.set("sort", value);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="font-mono text-xs text-gray-600">Sort:</span>
      {sortOptions.map((opt) => (
        <button
          key={opt.value}
          onClick={() => handleSort(opt.value)}
          className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
            currentSort === opt.value
              ? "bg-cyan-500/10 text-cyan-400"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
