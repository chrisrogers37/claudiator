import { SectionHeader } from "@/components/ui/section-header";
import { SkillGrid } from "./components/skill-grid";
import { CategoryFilter } from "./components/category-filter";
import { SearchInput } from "./components/search-input";
import { SortSelector } from "./components/sort-selector";

export default async function WorkshopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; search?: string }>;
}) {
  const params = await searchParams;

  return (
    <>
      <SectionHeader
        title="SKILL WORKSHOP"
        subtitle="Browse, edit, and refine your skill library"
      />

      <div className="flex gap-6">
        <aside className="w-48 flex-shrink-0">
          <CategoryFilter activeCategory={params.category} />
        </aside>

        <main className="flex-1">
          <div className="flex items-center justify-between mb-4 gap-4">
            <SearchInput defaultValue={params.search} />
            <SortSelector value={params.sort || "name"} />
          </div>

          <SkillGrid
            category={params.category}
            sort={params.sort || "name"}
            search={params.search}
          />
        </main>
      </div>
    </>
  );
}
