"use client";

import { useRouter, useSearchParams } from "next/navigation";

const SKILL_CATEGORIES = [
  "deployment",
  "database",
  "code-review",
  "planning",
  "design",
  "workflow",
  "utilities",
  "configuration",
] as const;

interface CategoryFilterProps {
  activeCategory?: string;
}

export function CategoryFilter({ activeCategory }: CategoryFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectCategory(category: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (category) {
      params.set("category", category);
    } else {
      params.delete("category");
    }
    router.push(`/workshop?${params.toString()}`);
  }

  return (
    <nav className="space-y-1">
      <button
        onClick={() => selectCategory(null)}
        className={`block w-full text-left px-3 py-2 rounded text-sm font-mono ${
          !activeCategory
            ? "text-green-400 bg-green-400/5"
            : "text-gray-500 hover:text-gray-300"
        }`}
      >
        All Skills
      </button>
      {SKILL_CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => selectCategory(cat)}
          className={`block w-full text-left px-3 py-2 rounded text-sm ${
            activeCategory === cat
              ? "text-green-400 bg-green-400/5"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {cat}
        </button>
      ))}
    </nav>
  );
}
