"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface CategoryFilterProps {
  activeCategory?: string;
  categories: { slug: string; domain: string; function: string }[];
}

export function CategoryFilter({ activeCategory, categories }: CategoryFilterProps) {
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
      {categories.map((cat) => (
        <button
          key={cat.slug}
          onClick={() => selectCategory(cat.slug)}
          className={`block w-full text-left px-3 py-2 rounded text-sm ${
            activeCategory === cat.slug
              ? "text-green-400 bg-green-400/5"
              : "text-gray-500 hover:text-gray-300"
          }`}
        >
          {cat.domain}/{cat.function}
        </button>
      ))}
    </nav>
  );
}
