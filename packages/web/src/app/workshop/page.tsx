import { createDb } from "@claudiator/db/client";
import { skillCategories } from "@claudiator/db/schema";
import { asc } from "drizzle-orm";
import { SectionHeader } from "@/components/ui/section-header";
import { SkillGrid } from "./components/skill-grid";
import { CategoryFilter } from "./components/category-filter";
import { SearchInput } from "./components/search-input";
import { SortSelector } from "./components/sort-selector";

const db = createDb(process.env.DATABASE_URL!);

export default async function WorkshopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; search?: string }>;
}) {
  const params = await searchParams;

  const allCategories = await db
    .select({
      slug: skillCategories.slug,
      domain: skillCategories.domain,
      function: skillCategories.function,
    })
    .from(skillCategories)
    .orderBy(asc(skillCategories.domain), asc(skillCategories.function));

  return (
    <>
      <SectionHeader
        title="SKILL WORKSHOP"
        subtitle="Browse, edit, and refine your skill library"
      />

      <div className="flex gap-6">
        <aside className="w-48 flex-shrink-0">
          <CategoryFilter activeCategory={params.category} categories={allCategories} />
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
