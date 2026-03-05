"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useCallback } from "react";

interface SearchInputProps {
  defaultValue?: string;
}

export function SearchInput({ defaultValue }: SearchInputProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (value.trim()) {
          params.set("search", value.trim());
        } else {
          params.delete("search");
        }
        router.push(`/workshop?${params.toString()}`);
      }, 300);
    },
    [router, searchParams]
  );

  return (
    <input
      type="text"
      defaultValue={defaultValue}
      onChange={(e) => handleChange(e.target.value)}
      placeholder="Search skills..."
      className="flex-1 px-4 py-2 rounded-lg text-sm font-mono bg-[#161b22] border border-gray-800 text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50"
    />
  );
}
