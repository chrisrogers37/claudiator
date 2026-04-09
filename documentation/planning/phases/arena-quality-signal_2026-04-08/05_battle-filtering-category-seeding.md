# Phase 5: Battle Filtering & Category Seeding

## Goal

Operational improvements that support the "dial in one category" workflow: filter battles by category and seed categories with predefined rubrics.

## Changes

### 1. Category Filter on Battles Page

Add a category dropdown filter to `/arena/battles`.

#### Query: Fetch categories for dropdown

Add to the parallel queries in `battles/page.tsx`:

```typescript
db
  .select({
    id: skillCategories.id,
    domain: skillCategories.domain,
    fn: skillCategories.function,
    slug: skillCategories.slug,
  })
  .from(skillCategories)
  .orderBy(skillCategories.domain),
```

#### Filter Logic

Add `category` to searchParams:

```typescript
searchParams: Promise<{ page?: string; skill?: string; category?: string }>;
```

When category is present, filter battles by joining through champion skill's category:

```typescript
// Build where clause
const conditions = [];
if (skillParam) conditions.push(eq(battles.championSkillId, skillParam));
if (categoryParam) conditions.push(eq(skills.categoryId, categoryParam));

// Apply in query:
.where(conditions.length > 0 ? and(...conditions) : undefined)
```

#### UI: Category Filter Dropdown

Add above the battle list, after the New Battle form:

```tsx
// packages/web/src/app/arena/components/battle-category-filter.tsx (new client component)
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
          params.delete("page"); // reset pagination
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
```

### 2. Category Seeding API

Add an API endpoint for seeding categories with descriptions and rubrics. This is admin-only and supports the workflow of pre-defining what "session handoff" means before any skills are discovered.

#### Endpoint: `PATCH /api/arena/categories/[id]`

```typescript
// packages/web/src/app/api/arena/categories/[id]/route.ts (new file)
import { createDb } from "@claudiator/db/client";
import { skillCategories } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if ((session as any)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { description, scoringRubric } = body;

  const db = createDb(process.env.DATABASE_URL!);

  // Validate rubric shape if provided
  if (scoringRubric) {
    if (!scoringRubric.dimensions || scoringRubric.dimensions.length !== 4) {
      return NextResponse.json(
        { error: "Rubric must have exactly 4 dimensions" },
        { status: 400 }
      );
    }
    for (const d of scoringRubric.dimensions) {
      if (!d.key || !d.label || !d.description || d.maxScore !== 25) {
        return NextResponse.json(
          { error: "Each dimension needs key, label, description, and maxScore=25" },
          { status: 400 }
        );
      }
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (description !== undefined) updates.description = description;
  if (scoringRubric !== undefined) updates.scoringRubric = scoringRubric;

  await db.update(skillCategories).set(updates).where(eq(skillCategories.id, id));

  return NextResponse.json({ ok: true });
}
```

#### Endpoint: `POST /api/arena/categories` (create with rubric)

```typescript
// packages/web/src/app/api/arena/categories/route.ts (new file)
import { createDb } from "@claudiator/db/client";
import { skillCategories } from "@claudiator/db/schema";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await auth();
  if ((session as any)?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { domain, fn, description, scoringRubric } = body;

  if (!domain || !fn) {
    return NextResponse.json({ error: "domain and fn required" }, { status: 400 });
  }

  const slug = `${domain}-${fn}`;
  const db = createDb(process.env.DATABASE_URL!);

  const [category] = await db
    .insert(skillCategories)
    .values({
      domain,
      function: fn,
      slug,
      description: description ?? null,
      scoringRubric: scoringRubric ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (!category) {
    // Already exists — update instead
    const [existing] = await db
      .select()
      .from(skillCategories)
      .where(eq(skillCategories.slug, slug));
    return NextResponse.json(existing);
  }

  return NextResponse.json(category, { status: 201 });
}
```

### 3. Council Bias Toward Seeded Categories

When a category has a description and rubric, the council should treat it as a stronger signal. Update the council prompt in `category-council.ts`.

In `categoryCouncilPrompt()` (`prompts.ts`), mark categories that have rubrics:

```typescript
const categoryList = existingCategories
  .sort((a, b) => b.skillCount - a.skillCount)
  .map((c) => {
    const rubricNote = c.scoringRubric ? " [HAS RUBRIC]" : "";
    return `  - ${c.slug} (${c.domain}/${c.function}): ${c.description ?? "No description"} [${c.skillCount} skill${c.skillCount !== 1 ? "s" : ""}${c.exampleSkills.length > 0 ? `, e.g. ${c.exampleSkills.join(", ")}` : ""}]${rubricNote}`;
  })
  .join("\n");
```

Add to the system prompt:
```
Categories marked [HAS RUBRIC] have been explicitly defined with custom scoring criteria.
Prefer these categories when the skill matches — they represent well-defined skill domains.
```

This requires passing `scoringRubric` to `CategoryInfo`:

```typescript
interface CategoryInfo {
  slug: string;
  domain: string;
  function: string;
  description: string | null;
  skillCount: number;
  exampleSkills: string[];
  scoringRubric: unknown;  // NEW — just need to know if non-null
}
```

And fetching it in `category-council.ts` when loading categories.

### 4. Intake Category Scoping (Optional)

For the "dial in one category" workflow, allow the discovery endpoint to accept a `categoryId` filter. Candidates discovered from a repo would only be created if they match the specified category.

This is a workflow convenience — the user can already manually dismiss candidates that don't match. Skip this if time is tight.

## Files Modified

| File | Change |
|------|--------|
| `packages/web/src/app/arena/battles/page.tsx` | Category filter support via query param |
| `packages/web/src/app/arena/components/battle-category-filter.tsx` | New file: dropdown filter component |
| `packages/web/src/app/api/arena/categories/route.ts` | New file: POST create category |
| `packages/web/src/app/api/arena/categories/[id]/route.ts` | New file: PATCH update category |
| `packages/web/src/lib/arena/prompts.ts` | Council bias for rubric'd categories |
| `packages/web/src/lib/arena/category-council.ts` | Fetch + pass scoringRubric to prompt |

## Verification

1. Create/update "session-handoff" category via API with rubric and description
2. Run discovery — confirm council biases toward the seeded category
3. Navigate to battles page — confirm category dropdown appears
4. Filter to "session-handoff" — confirm only relevant battles show
5. Clear filter — confirm all battles return
