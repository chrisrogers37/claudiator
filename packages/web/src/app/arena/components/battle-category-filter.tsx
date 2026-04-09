"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface Category {
  id: string;
  domain: string;
  fn: string;
  slug: string;
}

export function BattleCategoryFilter({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("category");

  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="font-mono text-xs text-gray-500">Category:</span>
      <select
        value={current ?? ""}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams);
          if (e.target.value) {
            params.set("category", e.target.value);
          } else {
            params.delete("category");
          }
          params.delete("page");
          router.push(`/arena/battles?${params.toString()}`);
        }}
        className="bg-[#0d1117] border border-gray-800 rounded px-2 py-1 font-mono text-xs text-gray-300"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.domain}/{c.fn}
          </option>
        ))}
      </select>
    </div>
  );
}
