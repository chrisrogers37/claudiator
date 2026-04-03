import Link from "next/link";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  searchParams?: Record<string, string>;
}

export function Pagination({
  currentPage,
  totalPages,
  basePath,
  searchParams = {},
}: PaginationProps) {
  if (totalPages <= 1) return null;

  function buildHref(page: number): string {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-between mt-4 font-mono text-xs">
      {currentPage > 1 ? (
        <Link
          href={buildHref(currentPage - 1)}
          className="text-gray-400 hover:text-gray-200 transition-colors"
        >
          &larr; Prev
        </Link>
      ) : (
        <span className="text-gray-700">&larr; Prev</span>
      )}

      <span className="text-gray-500">
        Page {currentPage} of {totalPages}
      </span>

      {currentPage < totalPages ? (
        <Link
          href={buildHref(currentPage + 1)}
          className="text-gray-400 hover:text-gray-200 transition-colors"
        >
          Next &rarr;
        </Link>
      ) : (
        <span className="text-gray-700">Next &rarr;</span>
      )}
    </div>
  );
}
