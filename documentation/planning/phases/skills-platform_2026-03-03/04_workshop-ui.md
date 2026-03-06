# Phase 04: Workshop UI — Skill Editing, Diffing, Feedback, and Learnings Browser

**Status:** 🔧 IN PROGRESS
**Started:** 2026-03-05

**Risk Level:** High
**Estimated Effort:** High (~3-4 weeks)

---

## Challenge Decisions (2026-03-05)

Split into 4 sub-phases as separate PRs:

| Sub-phase | Scope | Files |
|-----------|-------|-------|
| **4a** | Schema + Shared Components + Skill Browser (`/workshop`) + Navigation + GET /api/skills | ~15 | ✅ COMPLETE (PR #7) |
| **4b** | Skill Editor (Monaco) + Custom Diff Viewer + Timeline + Version History + AI Edit + mutation APIs (draft/publish/versions/ai-edit) | ~14 | ✅ COMPLETE (PR #8) |
| **4c** | Feedback Dashboard (per-skill + cross-skill triage) + CSS bar chart + GET /api/skills/:slug/feedback | ~7 | ✅ COMPLETE (PR #9) |
| **4d** | Learnings Browser (list + detail + proposed changes) + learnings APIs (GET/POST) | ~9 | 🔧 IN PROGRESS |

**Dependency changes:**
- DROP: `diff2html` → custom React diff components with Tailwind (no external CSS overrides needed)
- DROP: `recharts` → CSS-only horizontal bar chart (~20 lines Tailwind)
- DROP: Color tokens file → use existing Tailwind palette (`bg-[#0d1117]`, `bg-[#161b22]`, etc.)
- KEEP: Monaco Editor, AI Edit endpoint, full Learnings UI, both publish surfaces (MCP + web)
- KEEP: `diff` npm package (generates unified diffs between strings — used by custom diff viewer)
- KEEP: `react-markdown` + `remark-gfm` + `rehype-highlight` (Markdown preview panel)

**API route scoping per sub-phase:**
- **4b**: GET `/api/skills/[slug]/versions`, GET `/api/skills/[slug]/versions/[version]`, PUT `/api/skills/[slug]/draft`, POST `/api/skills/[slug]/publish`, POST `/api/skills/[slug]/ai-edit`
- **4c**: GET `/api/skills/[slug]/feedback` (the cross-skill triage page queries DB directly as a server component)
- **4d**: GET `/api/learnings`, GET `/api/learnings/[id]`, POST `/api/learnings/[id]/apply`

**Schema usage:**
- All code implements against the ACTUAL schema in `packages/db/src/schema.ts`, not the plan's stale code snippets
- `skillVersions` uses: `skillId` (uuid FK), `version` (text semver), `content`, `references` (jsonb), `changelog`, `publishedBy` (uuid), `publishedAt`, `isLatest` (boolean)
- Auth uses `auth()` from `packages/web/src/lib/auth.ts`, not `getServerSession(authOptions)`

**Component scoping:**
- Timeline component is built in 4b (used for version history)

---

## Implementation Corrections (added 2026-03-05)

This plan was generated before Phase 01-03 implementation. The code snippets below contain pervasive type, path, and schema errors. **Do NOT copy code verbatim from this document.** Use the feature descriptions and component lists as requirements, but implement against the actual codebase. Key corrections:

### Path corrections
- All `web/` paths → `packages/web/`
- All `web/app/` → `packages/web/src/app/`
- All `web/components/` → `packages/web/src/components/`
- All `web/lib/` → `packages/web/src/lib/`
- Schema: NOT `web/lib/db/schema.ts` → `packages/db/src/schema.ts`
- Migrations: NOT `web/lib/db/migrations/` → use Drizzle kit from `packages/db/`

### Schema corrections (same as Phase 05 — see that doc for full list)
- All IDs are `uuid`, not `serial` or `integer`
- `timestamp('...', { withTimezone: true })` not `timestamptz('...')`
- `skillVersions` columns: `skillId` (uuid FK), `version` (text semver), `content` (text), `references` (jsonb), `changelog` (text), `publishedBy` (uuid), `publishedAt` (timestamp), `isLatest` (boolean) — NOT `version_number`, `is_draft`, `is_current`, `skill_slug`
- `skills` table: NO `current_version_id` column. Latest version derived via `skillVersions.isLatest`
- `skillInvocations`: uses `skillSlug` (text) not skill FK, `invokedAt` not `timestamp`
- `skillFeedback`: uses `skillSlug` (text) not skill FK, `rating` is `smallint`
- Category values are short slugs: `'deployment' | 'database' | 'code-review' | 'planning' | 'design' | 'workflow' | 'utilities' | 'configuration'` — NOT long names like `'Deployment & Infrastructure'`

### Auth pattern corrections
- Use `auth()` from `packages/web/src/lib/auth.ts`, not `getServerSession()`
- Session: `(session as any).userId` (uuid string), `(session as any).role`

### Styling notes
- The plan's color tokens (Step 3.1) and dark aesthetic are CORRECT and match the existing app
- Existing app already uses similar patterns (bg-[#0d1117], text-gray-200, border-gray-800)

### Assumed Phase Foundation (corrected)
- Phase 03 delivers: `skillVersions` table with `id` (uuid), `skillId` (uuid FK), `version` (text semver), `content` (text — full SKILL.md), `references` (jsonb — reference files map), `changelog` (text), `publishedBy` (uuid FK), `publishedAt` (timestamp), `isLatest` (boolean)
- Phase 02 delivers: `skillInvocations` table with `skillSlug` (text), `invokedAt` (timestamp), `userId` (uuid), `sessionId` (text), `durationMs` (integer), `success` (boolean). `skillFeedback` table with `skillSlug` (text), `userId` (uuid), `rating` (smallint 1-5), `comment` (text), `sessionId` (text)
- Phase 01 delivers: `skills` table with `id` (uuid), `slug` (text unique), `name` (text), `description` (text), `category` (text enum), `isUserInvocable` (boolean), `createdBy` (uuid FK)

---

## Context

The claudefather maintainer's weekly workflow centers on the Workshop UI: reviewing feedback, studying distilled learnings from the intelligence pipeline, and refining skills through a collaborative human + AI editing experience. Without this interface, the maintainer must SSH into the database for feedback, manually diff SKILL.md files in a text editor, and has no structured way to browse learnings from external sources.

Phase 04 transforms the Next.js web app (Phase 01) into the primary operational surface for skill maintenance. It builds on top of:
- Phase 01's Next.js app shell, PostgreSQL database, GitHub OAuth, and token management
- Phase 02's telemetry data (usage stats, feedback submissions stored in the database)
- Phase 03's version history (versioned skill content, changelogs, publish/draft workflow)

The "workshop" concept — collaborative human + AI skill refinement — is implemented through an agent chat-driven editing mode where the maintainer sends natural-language instructions to the Anthropic API, reviews the proposed diff, and accepts or rejects changes. This is distinct from direct editing (typing in the code editor) and complements it.

---

## Dependencies

| Phase | Relationship |
|-------|-------------|
| **Phase 01** (Web App Foundation) | **MUST complete first.** Provides Next.js app, PostgreSQL, GitHub OAuth, token management, base layout, and API infrastructure. |
| **Phase 02** (Telemetry & Feedback) | **MUST complete first.** Provides `invocations` and `feedback` tables, usage stats aggregation, and feedback data that the Workshop displays. |
| **Phase 03** (Version History) | **MUST complete first.** Provides `skill_versions` table, draft/publish workflow, and version comparison data that the Workshop UI renders. |

## What This Unlocks

| Phase | How |
|-------|-----|
| **Phase 06** (Intelligence Pipeline) | The learnings browser (Section 5) is the display layer for intelligence pipeline output. Phase 06 populates the `learnings` and `learning_skill_links` tables that Phase 04 creates and renders. |

---

## Detailed Implementation Plan

### Assumed Phase Foundation

> **STALE — see "Implementation Corrections" section above for actual schema.**
> The column names and types listed below are WRONG. They were written before implementation.
> Refer to `packages/db/src/schema.ts` for the actual schema.

### Step 1: Database Schema Extensions — Learnings Tables

Create a new migration file at `web/lib/db/migrations/004_learnings.sql`:

```sql
-- Learnings from intelligence pipeline (Phase 06 populates, Phase 04 displays)
CREATE TABLE learnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    full_content TEXT,
    source_url TEXT,
    source_type TEXT NOT NULL CHECK (source_type IN ('blog', 'docs', 'changelog', 'community')),
    relevance_tags TEXT[] DEFAULT '{}',
    distilled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'applied', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_learnings_status ON learnings(status);
CREATE INDEX idx_learnings_distilled_at ON learnings(distilled_at DESC);
CREATE INDEX idx_learnings_source_type ON learnings(source_type);

-- Links between learnings and skills they might affect
CREATE TABLE learning_skill_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_id UUID NOT NULL REFERENCES learnings(id) ON DELETE CASCADE,
    skill_slug TEXT NOT NULL REFERENCES skills(slug) ON DELETE CASCADE,
    proposed_change TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(learning_id, skill_slug)
);

CREATE INDEX idx_learning_skill_links_learning ON learning_skill_links(learning_id);
CREATE INDEX idx_learning_skill_links_skill ON learning_skill_links(skill_slug);
CREATE INDEX idx_learning_skill_links_status ON learning_skill_links(status);
```

Add the corresponding Drizzle schema definitions to `web/lib/db/schema.ts`:

```typescript
import { pgTable, uuid, text, timestamptz, index, unique } from 'drizzle-orm/pg-core';

export const learnings = pgTable('learnings', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  fullContent: text('full_content'),
  sourceUrl: text('source_url'),
  sourceType: text('source_type').notNull(), // 'blog' | 'docs' | 'changelog' | 'community'
  relevanceTags: text('relevance_tags').array().default([]),
  distilledAt: timestamptz('distilled_at').notNull().defaultNow(),
  status: text('status').notNull().default('new'), // 'new' | 'reviewed' | 'applied' | 'dismissed'
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('idx_learnings_status').on(table.status),
  distilledAtIdx: index('idx_learnings_distilled_at').on(table.distilledAt),
  sourceTypeIdx: index('idx_learnings_source_type').on(table.sourceType),
}));

export const learningSkillLinks = pgTable('learning_skill_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  learningId: uuid('learning_id').notNull().references(() => learnings.id, { onDelete: 'cascade' }),
  skillSlug: text('skill_slug').notNull().references(() => skills.slug, { onDelete: 'cascade' }),
  proposedChange: text('proposed_change'),
  status: text('status').notNull().default('pending'), // 'pending' | 'applied' | 'rejected'
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
}, (table) => ({
  learningIdx: index('idx_learning_skill_links_learning').on(table.learningId),
  skillIdx: index('idx_learning_skill_links_skill').on(table.skillSlug),
  statusIdx: index('idx_learning_skill_links_status').on(table.status),
  uniqueLink: unique().on(table.learningId, table.skillSlug),
}));
```

### Step 2: Install Frontend Dependencies

Add these dependencies to the Next.js project (`web/package.json`):

```json
{
  "dependencies": {
    "@monaco-editor/react": "^4.6.0",
    "diff": "^5.2.0",
    "react-markdown": "^9.0.1",
    "remark-gfm": "^4.0.0",
    "rehype-highlight": "^7.0.0"
  },
  "devDependencies": {
    "@types/diff": "^5.2.1"
  }
}
```

**Why these libraries:**
- `@monaco-editor/react`: VS Code's editor engine — SKILL.md files are complex Markdown+YAML; syntax highlighting and intellisense matter.
- `diff`: Generates unified diffs between text strings. Used by the custom React diff viewer (no `diff2html` — we render diffs with Tailwind instead).
- `react-markdown` + `remark-gfm` + `rehype-highlight`: Renders the Markdown preview panel. GFM support needed for tables in SKILL.md files. Code block highlighting for YAML frontmatter and bash examples.

**Dropped:**
- ~~`diff2html`~~ — Replaced by custom React diff components styled with Tailwind. Eliminates external CSS overrides and gives full control over the dark terminal aesthetic.
- ~~`recharts`~~ — Replaced by CSS-only horizontal bar chart (~20 lines of Tailwind). One bar chart doesn't justify a 300KB charting library.

### Step 3: Design System — Shared Components

Create the design system foundation. All components follow the dark terminal aesthetic described in the task.

#### 3.1 Color Tokens — `web/lib/design/tokens.ts`

```typescript
export const colors = {
  bg: {
    primary: '#0a0e17',
    secondary: '#0f1520',
    card: '#121a2a',
    hover: '#1a2338',
    input: '#0d1220',
  },
  text: {
    primary: '#e0e6ed',
    secondary: '#8892a4',
    muted: '#5a6577',
  },
  accent: {
    green: '#00ff41',      // active/success states
    amber: '#d4a017',      // actions, CTAs, buttons
    red: '#ff4444',        // destructive actions, errors
    cyan: '#00bcd4',       // info, links, highlights
  },
  border: {
    default: '#1e293b',
    dashed: '#2a3a52',
    focus: '#00bcd4',
  },
  rating: {
    filled: '#d4a017',
    empty: '#2a3a52',
  },
} as const;

export const fonts = {
  mono: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
} as const;
```

#### 3.2 Base Card Component — `web/components/ui/card.tsx`

```tsx
import { ReactNode } from 'react';
import { colors } from '@/lib/design/tokens';

interface CardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'dashed' | 'interactive';
  onClick?: () => void;
}

export function Card({ children, className = '', variant = 'default', onClick }: CardProps) {
  const borderStyle = variant === 'dashed'
    ? `border: 1px dashed ${colors.border.dashed}`
    : `border: 1px solid ${colors.border.default}`;

  const hoverClass = variant === 'interactive' || onClick
    ? 'cursor-pointer hover:border-cyan-500/50 hover:bg-[#1a2338] transition-colors'
    : '';

  return (
    <div
      className={`rounded-lg p-4 ${hoverClass} ${className}`}
      style={{
        backgroundColor: colors.bg.card,
        borderStyle: variant === 'dashed' ? 'dashed' : 'solid',
        borderWidth: '1px',
        borderColor: colors.border[variant === 'dashed' ? 'dashed' : 'default'],
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
```

#### 3.3 Section Header Component — `web/components/ui/section-header.tsx`

Monospace, uppercase header matching "MCP SETUP" / "YOUR KEYS" aesthetic from the Huntress reference.

```tsx
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2
          className="text-lg tracking-widest uppercase"
          style={{ fontFamily: "'JetBrains Mono', monospace", color: '#e0e6ed' }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm mt-1" style={{ color: '#8892a4' }}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
```

#### 3.4 Rating Stars Component — `web/components/ui/rating-stars.tsx`

```tsx
interface RatingStarsProps {
  rating: number;    // 1-5
  size?: 'sm' | 'md';
  showValue?: boolean;
}

export function RatingStars({ rating, size = 'md', showValue = false }: RatingStarsProps) {
  const starSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={starSize}
          fill={star <= rating ? '#d4a017' : '#2a3a52'}
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      {showValue && (
        <span className="ml-1 text-sm" style={{ color: '#8892a4' }}>
          {rating.toFixed(1)}
        </span>
      )}
    </div>
  );
}
```

#### 3.5 Badge Component — `web/components/ui/badge.tsx`

Used for category labels, status indicators, source types.

```tsx
type BadgeVariant = 'green' | 'amber' | 'red' | 'cyan' | 'muted';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const variantColors: Record<BadgeVariant, { bg: string; text: string }> = {
  green: { bg: 'rgba(0, 255, 65, 0.1)', text: '#00ff41' },
  amber: { bg: 'rgba(212, 160, 23, 0.1)', text: '#d4a017' },
  red: { bg: 'rgba(255, 68, 68, 0.1)', text: '#ff4444' },
  cyan: { bg: 'rgba(0, 188, 212, 0.1)', text: '#00bcd4' },
  muted: { bg: 'rgba(90, 101, 119, 0.1)', text: '#8892a4' },
};

export function Badge({ label, variant = 'muted' }: BadgeProps) {
  const { bg, text } = variantColors[variant];

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono uppercase tracking-wider"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </span>
  );
}
```

#### 3.6 Timeline Component — `web/components/ui/timeline.tsx`

Used for version history display.

```tsx
interface TimelineEntry {
  id: string;
  label: string;
  timestamp: string;
  description?: string;
  isActive?: boolean;
  actions?: ReactNode;
}

interface TimelineProps {
  entries: TimelineEntry[];
}

export function Timeline({ entries }: TimelineProps) {
  return (
    <div className="relative">
      {/* Vertical line */}
      <div
        className="absolute left-3 top-0 bottom-0 w-px"
        style={{ backgroundColor: '#1e293b' }}
      />

      <div className="space-y-4">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-start gap-4 relative">
            {/* Dot */}
            <div
              className="w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 flex-shrink-0"
              style={{
                borderColor: entry.isActive ? '#00ff41' : '#2a3a52',
                backgroundColor: entry.isActive ? 'rgba(0, 255, 65, 0.1)' : '#0a0e17',
              }}
            >
              {entry.isActive && (
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#00ff41' }} />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm" style={{ color: '#e0e6ed' }}>
                  {entry.label}
                </span>
                <span className="text-xs" style={{ color: '#5a6577' }}>
                  {entry.timestamp}
                </span>
              </div>
              {entry.description && (
                <p className="text-sm mt-1" style={{ color: '#8892a4' }}>
                  {entry.description}
                </p>
              )}
              {entry.actions && <div className="mt-2">{entry.actions}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Step 4: Skill Browser Page — `/workshop`

#### 4.1 Page Component — `web/app/workshop/page.tsx`

```tsx
import { Suspense } from 'react';
import { SectionHeader } from '@/components/ui/section-header';
import { SkillGrid } from './components/skill-grid';
import { CategoryFilter } from './components/category-filter';

// The 8 categories from the skill inventory research
const SKILL_CATEGORIES = [
  'Deployment & Infrastructure',
  'Database & Data',
  'Code Review & QA',
  'Planning & Documentation',
  'Design & Performance',
  'Development Workflow',
  'Utilities',
  'Configuration',
] as const;

export default async function WorkshopPage({
  searchParams,
}: {
  searchParams: { category?: string; sort?: string; search?: string };
}) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <SectionHeader
        title="SKILL WORKSHOP"
        subtitle="Browse, edit, and refine your skill library"
      />

      <div className="flex gap-6">
        {/* Sidebar: category filter */}
        <aside className="w-56 flex-shrink-0">
          <CategoryFilter
            categories={SKILL_CATEGORIES}
            activeCategory={searchParams.category}
          />
        </aside>

        {/* Main: skill grid */}
        <main className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <SearchInput defaultValue={searchParams.search} />
            <SortSelector value={searchParams.sort || 'name'} />
          </div>

          <Suspense fallback={<SkillGridSkeleton />}>
            <SkillGrid
              category={searchParams.category}
              sort={searchParams.sort || 'name'}
              search={searchParams.search}
            />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
```

#### 4.2 Skill Card Component — `web/app/workshop/components/skill-card.tsx`

Each card shows: name, description, category badge, current version, usage stats (total invocations from Phase 02), and average rating.

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RatingStars } from '@/components/ui/rating-stars';

interface SkillCardProps {
  slug: string;
  name: string;
  description: string;
  category: string;
  currentVersion: number;
  totalInvocations: number;
  avgRating: number | null;
  feedbackCount: number;
}

// Map categories to badge variants for visual distinction
const categoryVariant: Record<string, 'green' | 'amber' | 'cyan' | 'muted'> = {
  'Deployment & Infrastructure': 'cyan',
  'Database & Data': 'green',
  'Code Review & QA': 'amber',
  'Planning & Documentation': 'cyan',
  'Design & Performance': 'amber',
  'Development Workflow': 'green',
  'Utilities': 'muted',
  'Configuration': 'muted',
};

export function SkillCard({
  slug, name, description, category,
  currentVersion, totalInvocations, avgRating, feedbackCount,
}: SkillCardProps) {
  return (
    <Link href={`/workshop/skills/${slug}`}>
      <Card variant="interactive">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-mono text-sm font-semibold" style={{ color: '#00bcd4' }}>
            /{name}
          </h3>
          <Badge label={`v${currentVersion}`} variant="muted" />
        </div>

        <p className="text-sm mb-3 line-clamp-2" style={{ color: '#8892a4' }}>
          {description}
        </p>

        <div className="flex items-center justify-between">
          <Badge label={category} variant={categoryVariant[category] || 'muted'} />
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono" style={{ color: '#5a6577' }}>
              {totalInvocations.toLocaleString()} uses
            </span>
            {avgRating !== null && (
              <RatingStars rating={avgRating} size="sm" />
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
```

#### 4.3 Category Filter Sidebar — `web/app/workshop/components/category-filter.tsx`

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface CategoryFilterProps {
  categories: readonly string[];
  activeCategory?: string;
}

export function CategoryFilter({ categories, activeCategory }: CategoryFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function selectCategory(category: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (category) {
      params.set('category', category);
    } else {
      params.delete('category');
    }
    router.push(`/workshop?${params.toString()}`);
  }

  return (
    <nav className="space-y-1">
      <button
        onClick={() => selectCategory(null)}
        className={`block w-full text-left px-3 py-2 rounded text-sm font-mono ${
          !activeCategory ? 'text-[#00ff41] bg-[#00ff41]/5' : 'text-[#8892a4] hover:text-[#e0e6ed]'
        }`}
      >
        All Skills
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => selectCategory(cat)}
          className={`block w-full text-left px-3 py-2 rounded text-sm ${
            activeCategory === cat
              ? 'text-[#00ff41] bg-[#00ff41]/5'
              : 'text-[#8892a4] hover:text-[#e0e6ed]'
          }`}
        >
          {cat}
        </button>
      ))}
    </nav>
  );
}
```

#### 4.4 Search and Sort Components — `web/app/workshop/components/search-input.tsx` and `web/app/workshop/components/sort-selector.tsx`

SearchInput: debounced text input that updates `?search=` URL param. Uses `useRouter` and `useSearchParams` like CategoryFilter.

SortSelector: dropdown with options `name` (A-Z), `usage` (most used), `rating` (highest rated), `updated` (recently updated). Updates `?sort=` URL param.

Both are client components (`'use client'`) following the same URL-param-driven pattern as CategoryFilter above.

#### 4.5 Skill Grid — `web/app/workshop/components/skill-grid.tsx`

Server component that queries the database:

```tsx
import { db } from '@/lib/db';
import { skills, invocations, feedback } from '@/lib/db/schema';
import { eq, sql, ilike, desc, asc } from 'drizzle-orm';
import { SkillCard } from './skill-card';

interface SkillGridProps {
  category?: string;
  sort: string;
  search?: string;
}

export async function SkillGrid({ category, sort, search }: SkillGridProps) {
  // Build query with aggregated usage stats and ratings
  const skillsWithStats = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      description: skills.description,
      category: skills.category,
      currentVersion: sql<number>`(SELECT version_number FROM skill_versions WHERE skill_slug = ${skills.slug} AND is_current = true)`,
      totalInvocations: sql<number>`COALESCE((SELECT COUNT(*) FROM invocations WHERE skill_slug = ${skills.slug}), 0)`,
      avgRating: sql<number | null>`(SELECT AVG(rating)::numeric(3,1) FROM feedback WHERE skill_slug = ${skills.slug})`,
      feedbackCount: sql<number>`COALESCE((SELECT COUNT(*) FROM feedback WHERE skill_slug = ${skills.slug}), 0)`,
    })
    .from(skills)
    .where(
      sql`${category ? sql`${skills.category} = ${category}` : sql`TRUE`}
        AND ${search ? sql`(${skills.name} ILIKE ${'%' + search + '%'} OR ${skills.description} ILIKE ${'%' + search + '%'})` : sql`TRUE`}`
    )
    .orderBy(
      sort === 'usage' ? desc(sql`total_invocations`) :
      sort === 'rating' ? desc(sql`avg_rating`) :
      sort === 'updated' ? desc(skills.updatedAt) :
      asc(skills.name)
    );

  if (skillsWithStats.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: '#5a6577' }}>
        <p className="font-mono">No skills found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {skillsWithStats.map((skill) => (
        <SkillCard key={skill.slug} {...skill} />
      ))}
    </div>
  );
}
```

### Step 5: Skill Detail Page with Editor — `/workshop/skills/:slug`

#### 5.1 Page Layout — `web/app/workshop/skills/[slug]/page.tsx`

```tsx
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { skills, skillVersions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { SectionHeader } from '@/components/ui/section-header';
import { SkillEditor } from './components/skill-editor';
import { SkillSidebar } from './components/skill-sidebar';

export default async function SkillDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const skill = await db.query.skills.findFirst({
    where: eq(skills.slug, params.slug),
  });

  if (!skill) notFound();

  // Get current published version content
  const currentVersion = await db.query.skillVersions.findFirst({
    where: and(
      eq(skillVersions.skillSlug, params.slug),
      eq(skillVersions.isCurrent, true),
    ),
  });

  // Get draft version if exists
  const draftVersion = await db.query.skillVersions.findFirst({
    where: and(
      eq(skillVersions.skillSlug, params.slug),
      eq(skillVersions.isDraft, true),
    ),
  });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <SectionHeader
        title={`SKILL: ${skill.name.toUpperCase()}`}
        subtitle={skill.description}
        action={<SkillActions slug={params.slug} hasDraft={!!draftVersion} />}
      />

      <div className="flex gap-6">
        {/* Main: editor + preview */}
        <main className="flex-1 min-w-0">
          <SkillEditor
            slug={params.slug}
            initialContent={draftVersion?.content || currentVersion?.content || ''}
            isDraft={!!draftVersion}
            currentVersionNumber={currentVersion?.versionNumber || 0}
          />
        </main>

        {/* Sidebar: metadata, stats, quick links */}
        <aside className="w-72 flex-shrink-0">
          <SkillSidebar slug={params.slug} skill={skill} />
        </aside>
      </div>
    </div>
  );
}
```

#### 5.2 Skill Editor Component — `web/app/workshop/skills/[slug]/components/skill-editor.tsx`

This is the core editing component. It provides:
1. A Monaco Editor panel on the left for SKILL.md content
2. A rendered Markdown preview panel on the right
3. An agent chat input bar at the bottom for AI-assisted editing
4. Tabs to toggle between "Edit" and "Diff" modes

```tsx
'use client';

import { useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { DiffViewer } from '@/components/workshop/diff-viewer';
import { AgentChatInput } from './agent-chat-input';

interface SkillEditorProps {
  slug: string;
  initialContent: string;
  isDraft: boolean;
  currentVersionNumber: number;
}

type EditorMode = 'edit' | 'diff' | 'preview';

export function SkillEditor({
  slug, initialContent, isDraft, currentVersionNumber,
}: SkillEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [originalContent] = useState(initialContent);
  const [mode, setMode] = useState<EditorMode>('edit');
  const [isSaving, setIsSaving] = useState(false);
  const [aiProposal, setAiProposal] = useState<string | null>(null);

  const hasChanges = content !== originalContent;

  const handleSaveDraft = useCallback(async () => {
    setIsSaving(true);
    try {
      await fetch(`/api/skills/${slug}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
    } finally {
      setIsSaving(false);
    }
  }, [slug, content]);

  const handleAiEdit = useCallback(async (instruction: string) => {
    const res = await fetch(`/api/skills/${slug}/ai-edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, instruction }),
    });
    const data = await res.json();
    setAiProposal(data.proposedContent);
    setMode('diff');
  }, [slug, content]);

  const acceptAiProposal = useCallback(() => {
    if (aiProposal) {
      setContent(aiProposal);
      setAiProposal(null);
      setMode('edit');
    }
  }, [aiProposal]);

  const rejectAiProposal = useCallback(() => {
    setAiProposal(null);
    setMode('edit');
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-200px)]">
      {/* Mode tabs + save button */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex gap-1">
          {(['edit', 'diff', 'preview'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded text-xs font-mono uppercase tracking-wider ${
                mode === m
                  ? 'text-[#00ff41] bg-[#00ff41]/10'
                  : 'text-[#5a6577] hover:text-[#8892a4]'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-[#d4a017] font-mono">Unsaved changes</span>
          )}
          <button
            onClick={handleSaveDraft}
            disabled={!hasChanges || isSaving}
            className="px-4 py-1.5 rounded text-xs font-mono uppercase tracking-wider disabled:opacity-50"
            style={{
              backgroundColor: hasChanges ? 'rgba(212, 160, 23, 0.15)' : 'transparent',
              color: hasChanges ? '#d4a017' : '#5a6577',
              border: `1px solid ${hasChanges ? '#d4a017' : '#2a3a52'}`,
            }}
          >
            {isSaving ? 'Saving...' : 'Save Draft'}
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 min-h-0 flex gap-0 rounded-lg overflow-hidden border border-[#1e293b]">
        {mode === 'edit' && (
          <>
            {/* Monaco Editor — left panel */}
            <div className="flex-1 min-w-0">
              <Editor
                height="100%"
                language="markdown"
                value={content}
                onChange={(val) => setContent(val || '')}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', monospace",
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                }}
              />
            </div>

            {/* Divider */}
            <div className="w-px" style={{ backgroundColor: '#1e293b' }} />

            {/* Markdown Preview — right panel */}
            <div
              className="flex-1 min-w-0 overflow-y-auto p-6"
              style={{ backgroundColor: '#0f1520' }}
            >
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {content}
                </ReactMarkdown>
              </div>
            </div>
          </>
        )}

        {mode === 'diff' && (
          <div className="flex-1 min-w-0 overflow-y-auto">
            <DiffViewer
              oldContent={originalContent}
              newContent={aiProposal || content}
              oldLabel={`v${currentVersionNumber} (current)`}
              newLabel={aiProposal ? 'AI Proposal' : 'Draft'}
            />
            {aiProposal && (
              <div className="flex gap-2 p-4 border-t border-[#1e293b]">
                <button
                  onClick={acceptAiProposal}
                  className="px-4 py-2 rounded text-sm font-mono"
                  style={{ backgroundColor: 'rgba(0, 255, 65, 0.1)', color: '#00ff41', border: '1px solid #00ff41' }}
                >
                  Accept Changes
                </button>
                <button
                  onClick={rejectAiProposal}
                  className="px-4 py-2 rounded text-sm font-mono"
                  style={{ backgroundColor: 'rgba(255, 68, 68, 0.1)', color: '#ff4444', border: '1px solid #ff4444' }}
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        )}

        {mode === 'preview' && (
          <div
            className="flex-1 min-w-0 overflow-y-auto p-6"
            style={{ backgroundColor: '#0f1520' }}
          >
            <div className="prose prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {/* Agent chat input — always visible at bottom */}
      <AgentChatInput onSubmit={handleAiEdit} isLoading={false} />
    </div>
  );
}
```

#### 5.3 Agent Chat Input — `web/app/workshop/skills/[slug]/components/agent-chat-input.tsx`

```tsx
'use client';

import { useState, FormEvent } from 'react';

interface AgentChatInputProps {
  onSubmit: (instruction: string) => Promise<void>;
  isLoading: boolean;
}

export function AgentChatInput({ onSubmit, isLoading }: AgentChatInputProps) {
  const [instruction, setInstruction] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!instruction.trim() || isLoading) return;
    await onSubmit(instruction.trim());
    setInstruction('');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 flex gap-2 items-center px-1"
    >
      <div className="flex-1 relative">
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Ask AI to edit this skill... (e.g., 'Make the error handling section more concise')"
          disabled={isLoading}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-mono placeholder:text-[#5a6577] disabled:opacity-50"
          style={{
            backgroundColor: '#0d1220',
            color: '#e0e6ed',
            border: '1px solid #1e293b',
            outline: 'none',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#00bcd4')}
          onBlur={(e) => (e.target.style.borderColor = '#1e293b')}
        />
      </div>
      <button
        type="submit"
        disabled={!instruction.trim() || isLoading}
        className="px-4 py-2.5 rounded-lg text-sm font-mono uppercase tracking-wider disabled:opacity-30"
        style={{
          backgroundColor: 'rgba(212, 160, 23, 0.15)',
          color: '#d4a017',
          border: '1px solid #d4a017',
        }}
      >
        {isLoading ? 'Thinking...' : 'Send'}
      </button>
    </form>
  );
}
```

#### 5.4 Skill Sidebar — `web/app/workshop/skills/[slug]/components/skill-sidebar.tsx`

Shows metadata, quick stats, and navigation links to sub-pages (history, feedback).

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RatingStars } from '@/components/ui/rating-stars';

interface SkillSidebarProps {
  slug: string;
  skill: {
    name: string;
    category: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

export async function SkillSidebar({ slug, skill }: SkillSidebarProps) {
  // Fetch aggregated stats from DB
  const stats = await getSkillStats(slug); // helper function querying invocations + feedback tables

  return (
    <div className="space-y-4">
      {/* Stats card */}
      <Card variant="dashed">
        <h4 className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#8892a4' }}>
          Statistics
        </h4>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt style={{ color: '#5a6577' }}>Total Uses</dt>
            <dd className="font-mono" style={{ color: '#e0e6ed' }}>{stats.totalInvocations}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: '#5a6577' }}>This Week</dt>
            <dd className="font-mono" style={{ color: '#e0e6ed' }}>{stats.weeklyInvocations}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: '#5a6577' }}>Avg Rating</dt>
            <dd>{stats.avgRating ? <RatingStars rating={stats.avgRating} size="sm" /> : <span style={{ color: '#5a6577' }}>—</span>}</dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: '#5a6577' }}>Feedback</dt>
            <dd className="font-mono" style={{ color: '#e0e6ed' }}>{stats.feedbackCount}</dd>
          </div>
        </dl>
      </Card>

      {/* Navigation links */}
      <Card variant="dashed">
        <h4 className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#8892a4' }}>
          Navigation
        </h4>
        <nav className="space-y-2">
          <Link
            href={`/workshop/skills/${slug}/history`}
            className="block px-3 py-2 rounded text-sm hover:bg-[#1a2338] transition-colors"
            style={{ color: '#00bcd4' }}
          >
            Version History
          </Link>
          <Link
            href={`/workshop/skills/${slug}/feedback`}
            className="block px-3 py-2 rounded text-sm hover:bg-[#1a2338] transition-colors"
            style={{ color: '#00bcd4' }}
          >
            Feedback ({stats.feedbackCount})
          </Link>
        </nav>
      </Card>

      {/* Metadata */}
      <Card variant="dashed">
        <h4 className="font-mono text-xs uppercase tracking-widest mb-3" style={{ color: '#8892a4' }}>
          Metadata
        </h4>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt style={{ color: '#5a6577' }}>Category</dt>
            <dd><Badge label={skill.category} /></dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: '#5a6577' }}>Created</dt>
            <dd className="font-mono text-xs" style={{ color: '#8892a4' }}>
              {skill.createdAt.toLocaleDateString()}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt style={{ color: '#5a6577' }}>Updated</dt>
            <dd className="font-mono text-xs" style={{ color: '#8892a4' }}>
              {skill.updatedAt.toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
```

### Step 6: Diff Viewer Component — `packages/web/src/components/workshop/diff-viewer.tsx`

Custom React diff viewer styled with Tailwind. No `diff2html` dependency — we use the `diff` npm package to compute changes and render them ourselves. This gives full control over the dark terminal aesthetic without CSS override files.

Shared component used by both the skill editor (draft vs published, AI proposal vs current) and the version history page (any two versions).

**Implementation approach:**
- Use `diffLines()` from the `diff` npm package to compute line-level changes
- Render each line as a React element with Tailwind classes for add/remove/context styling
- Support unified and split view modes via a toggle
- No `dangerouslySetInnerHTML` — pure React rendering
- Colors match the existing dark aesthetic: red (`rgba(255, 68, 68, 0.08)`) for removals, green (`rgba(0, 255, 65, 0.08)`) for additions, neutral background for context lines
- Monospace font (`JetBrains Mono`), line numbers in muted color (`#5a6577`)

```tsx
'use client';

import { useState, useMemo } from 'react';
import { diffLines, Change } from 'diff';

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  oldLabel?: string;
  newLabel?: string;
}

type DiffStyle = 'unified' | 'split';

export function DiffViewer({
  oldContent, newContent, oldLabel = 'Before', newLabel = 'After',
}: DiffViewerProps) {
  const [style, setStyle] = useState<DiffStyle>('unified');

  const changes = useMemo(
    () => diffLines(oldContent, newContent),
    [oldContent, newContent]
  );

  return (
    <div>
      {/* Style toggle + labels */}
      <div className="flex items-center justify-between p-3 border-b border-[#1e293b]">
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-[#ff4444]">{oldLabel}</span>
          <span className="text-[#5a6577]">→</span>
          <span className="text-[#00ff41]">{newLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#5a6577]">View:</span>
          {(['unified', 'split'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStyle(s)}
              className={`px-2 py-1 rounded text-xs font-mono uppercase ${
                style === s
                  ? 'text-[#00bcd4] bg-[#00bcd4]/10'
                  : 'text-[#5a6577] hover:text-[#8892a4]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Diff output */}
      <div className="overflow-x-auto font-mono text-[13px]" style={{ backgroundColor: '#0f1520' }}>
        {style === 'unified'
          ? <UnifiedView changes={changes} />
          : <SplitView changes={changes} />}
      </div>
    </div>
  );
}
```

The `UnifiedView` and `SplitView` are internal components that iterate over `Change[]` from the `diff` library, rendering lines with appropriate background colors and `+`/`-`/` ` prefixes. No external CSS files needed.

### Step 7: Version History Page — `/workshop/skills/:slug/history`

#### 7.1 Page Component — `web/app/workshop/skills/[slug]/history/page.tsx`

```tsx
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { skills, skillVersions } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { SectionHeader } from '@/components/ui/section-header';
import { Timeline } from '@/components/ui/timeline';
import { VersionCompare } from './components/version-compare';

export default async function VersionHistoryPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { compare?: string }; // e.g., "3,5" to compare v3 and v5
}) {
  const skill = await db.query.skills.findFirst({
    where: eq(skills.slug, params.slug),
  });
  if (!skill) notFound();

  const versions = await db.query.skillVersions.findMany({
    where: eq(skillVersions.skillSlug, params.slug),
    orderBy: desc(skillVersions.versionNumber),
  });

  // Parse compare param
  const compareVersions = searchParams.compare
    ? searchParams.compare.split(',').map(Number).filter(Boolean)
    : null;

  const timelineEntries = versions.map((v) => ({
    id: v.id,
    label: `v${v.versionNumber}`,
    timestamp: v.publishedAt?.toLocaleDateString() || 'Draft',
    description: v.changelog || undefined,
    isActive: v.isCurrent,
    actions: (
      <VersionActions
        slug={params.slug}
        versionNumber={v.versionNumber}
        isCurrent={v.isCurrent}
        isDraft={v.isDraft}
      />
    ),
  }));

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <SectionHeader
        title={`VERSION HISTORY: ${skill.name.toUpperCase()}`}
        subtitle={`${versions.length} versions`}
        action={<BackToSkillLink slug={params.slug} />}
      />

      <div className="flex gap-8">
        {/* Timeline sidebar */}
        <aside className="w-80 flex-shrink-0">
          <Timeline entries={timelineEntries} />
        </aside>

        {/* Compare area */}
        <main className="flex-1 min-w-0">
          {compareVersions && compareVersions.length === 2 ? (
            <VersionCompare
              slug={params.slug}
              versionA={compareVersions[0]}
              versionB={compareVersions[1]}
            />
          ) : (
            <div className="text-center py-12" style={{ color: '#5a6577' }}>
              <p className="font-mono text-sm">Select two versions to compare</p>
              <p className="text-xs mt-1">Click "Compare" checkboxes on any two versions in the timeline</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

#### 7.2 Version Actions — `web/app/workshop/skills/[slug]/history/components/version-actions.tsx`

Client component with checkboxes for comparison selection, "View" link, and "Rollback" button.

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

interface VersionActionsProps {
  slug: string;
  versionNumber: number;
  isCurrent: boolean;
  isDraft: boolean;
}

export function VersionActions({ slug, versionNumber, isCurrent, isDraft }: VersionActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isRollingBack, setIsRollingBack] = useState(false);

  // Compare checkbox state derived from URL params
  const compareParam = searchParams.get('compare') || '';
  const compareVersions = compareParam.split(',').map(Number).filter(Boolean);
  const isSelected = compareVersions.includes(versionNumber);

  function toggleCompare() {
    const params = new URLSearchParams(searchParams.toString());
    let selected = [...compareVersions];

    if (isSelected) {
      selected = selected.filter((v) => v !== versionNumber);
    } else {
      if (selected.length >= 2) selected.shift(); // Remove oldest selection
      selected.push(versionNumber);
    }

    if (selected.length > 0) {
      params.set('compare', selected.join(','));
    } else {
      params.delete('compare');
    }

    router.push(`/workshop/skills/${slug}/history?${params.toString()}`);
  }

  async function handleRollback() {
    if (!confirm(`Rollback to v${versionNumber}? This will publish v${versionNumber}'s content as a new version.`)) return;
    setIsRollingBack(true);
    try {
      await fetch(`/api/skills/${slug}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rollbackFromVersion: versionNumber }),
      });
      router.refresh();
    } finally {
      setIsRollingBack(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={toggleCompare}
          className="accent-[#00bcd4]"
        />
        <span className="text-xs" style={{ color: '#5a6577' }}>Compare</span>
      </label>

      {!isCurrent && !isDraft && (
        <button
          onClick={handleRollback}
          disabled={isRollingBack}
          className="text-xs font-mono px-2 py-1 rounded"
          style={{
            color: '#d4a017',
            border: '1px solid #d4a017',
            backgroundColor: 'rgba(212, 160, 23, 0.1)',
          }}
        >
          {isRollingBack ? '...' : 'Rollback'}
        </button>
      )}

      {isCurrent && (
        <Badge label="current" variant="green" />
      )}
    </div>
  );
}
```

#### 7.3 Version Compare Component — `web/app/workshop/skills/[slug]/history/components/version-compare.tsx`

Server component that fetches two version contents and renders the DiffViewer.

```tsx
import { db } from '@/lib/db';
import { skillVersions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { DiffViewer } from '@/components/workshop/diff-viewer';

interface VersionCompareProps {
  slug: string;
  versionA: number;
  versionB: number;
}

export async function VersionCompare({ slug, versionA, versionB }: VersionCompareProps) {
  const [a, b] = await Promise.all([
    db.query.skillVersions.findFirst({
      where: and(eq(skillVersions.skillSlug, slug), eq(skillVersions.versionNumber, versionA)),
    }),
    db.query.skillVersions.findFirst({
      where: and(eq(skillVersions.skillSlug, slug), eq(skillVersions.versionNumber, versionB)),
    }),
  ]);

  if (!a || !b) {
    return <p className="text-[#ff4444] font-mono text-sm">Version not found</p>;
  }

  const [older, newer] = versionA < versionB ? [a, b] : [b, a];

  return (
    <div className="rounded-lg border border-[#1e293b] overflow-hidden">
      <DiffViewer
        oldContent={older.content}
        newContent={newer.content}
        oldLabel={`v${older.versionNumber}`}
        newLabel={`v${newer.versionNumber}`}
      />
    </div>
  );
}
```

### Step 8: Feedback Dashboard

#### 8.1 Skill Feedback Page — `web/app/workshop/skills/[slug]/feedback/page.tsx`

```tsx
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { skills, feedback } from '@/lib/db/schema';
import { eq, desc, asc, sql } from 'drizzle-orm';
import { SectionHeader } from '@/components/ui/section-header';
import { RatingDistribution } from './components/rating-distribution';
import { FeedbackList } from './components/feedback-list';

export default async function SkillFeedbackPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { sort?: string };
}) {
  const skill = await db.query.skills.findFirst({
    where: eq(skills.slug, params.slug),
  });
  if (!skill) notFound();

  // Rating distribution: count per rating value
  const distribution = await db
    .select({
      rating: feedback.rating,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(feedback)
    .where(eq(feedback.skillSlug, params.slug))
    .groupBy(feedback.rating)
    .orderBy(asc(feedback.rating));

  // Feedback entries
  const sortColumn = searchParams.sort === 'rating' ? desc(feedback.rating) :
                     searchParams.sort === 'user' ? asc(feedback.userId) :
                     desc(feedback.createdAt); // default: date

  const entries = await db.query.feedback.findMany({
    where: eq(feedback.skillSlug, params.slug),
    orderBy: sortColumn,
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <SectionHeader
        title={`FEEDBACK: ${skill.name.toUpperCase()}`}
        subtitle={`${entries.length} responses`}
        action={<BackToSkillLink slug={params.slug} />}
      />

      {/* Rating distribution chart */}
      <div className="mb-8">
        <RatingDistribution distribution={distribution} />
      </div>

      {/* Sort controls */}
      <FeedbackSortControls currentSort={searchParams.sort || 'date'} slug={params.slug} />

      {/* Feedback list */}
      <FeedbackList entries={entries} />
    </div>
  );
}
```

#### 8.2 Rating Distribution Chart — `packages/web/src/app/workshop/skills/[slug]/feedback/components/rating-distribution.tsx`

CSS-only horizontal bar chart. No `recharts` dependency — ~20 lines of Tailwind.

```tsx
interface RatingDistributionProps {
  distribution: { rating: number; count: number }[];
}

const barColors = ['#ff4444', '#ff8844', '#d4a017', '#88cc44', '#00ff41'];

export function RatingDistribution({ distribution }: RatingDistributionProps) {
  const data = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: distribution.find((d) => d.rating === rating)?.count || 0,
  }));
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="rounded-lg p-4" style={{ backgroundColor: '#121a2a', border: '1px dashed #2a3a52' }}>
      <h4 className="font-mono text-xs uppercase tracking-widest mb-4" style={{ color: '#8892a4' }}>
        Rating Distribution
      </h4>
      <div className="space-y-2">
        {data.map((d, idx) => (
          <div key={d.rating} className="flex items-center gap-3">
            <span className="font-mono text-xs w-14 text-right" style={{ color: '#8892a4' }}>
              {d.rating} star{d.rating > 1 ? 's' : ''}
            </span>
            <div className="flex-1 h-5 rounded" style={{ backgroundColor: '#0d1220' }}>
              <div
                className="h-full rounded transition-all"
                style={{
                  width: `${(d.count / maxCount) * 100}%`,
                  backgroundColor: barColors[idx],
                  minWidth: d.count > 0 ? '4px' : '0',
                }}
              />
            </div>
            <span className="font-mono text-xs w-8" style={{ color: '#5a6577' }}>
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

#### 8.3 Feedback List — `web/app/workshop/skills/[slug]/feedback/components/feedback-list.tsx`

```tsx
import { Card } from '@/components/ui/card';
import { RatingStars } from '@/components/ui/rating-stars';

interface FeedbackEntry {
  id: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
}

interface FeedbackListProps {
  entries: FeedbackEntry[];
}

export function FeedbackList({ entries }: FeedbackListProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: '#5a6577' }}>
        <p className="font-mono text-sm">No feedback yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <Card key={entry.id} variant="dashed">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <RatingStars rating={entry.rating} size="sm" />
              <span className="text-xs font-mono" style={{ color: '#5a6577' }}>
                {entry.userId}
              </span>
            </div>
            <span className="text-xs" style={{ color: '#5a6577' }}>
              {entry.createdAt.toLocaleDateString()}
            </span>
          </div>
          {entry.comment && (
            <p className="mt-2 text-sm" style={{ color: '#8892a4' }}>
              {entry.comment}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
```

#### 8.4 Cross-Skill Feedback Overview — `web/app/workshop/feedback/page.tsx`

Triage view showing all skills sorted by worst ratings first.

```tsx
import { db } from '@/lib/db';
import { skills, feedback } from '@/lib/db/schema';
import { sql, desc, asc } from 'drizzle-orm';
import { SectionHeader } from '@/components/ui/section-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RatingStars } from '@/components/ui/rating-stars';
import Link from 'next/link';

export default async function FeedbackOverviewPage({
  searchParams,
}: {
  searchParams: { sort?: string };
}) {
  const sortOrder = searchParams.sort === 'count' ? 'count' :
                    searchParams.sort === 'skill' ? 'skill' :
                    'rating'; // default: worst ratings first

  const skillFeedback = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      category: skills.category,
      avgRating: sql<number>`AVG(${feedback.rating})::numeric(3,1)`,
      feedbackCount: sql<number>`COUNT(${feedback.id})::int`,
      latestFeedback: sql<Date>`MAX(${feedback.createdAt})`,
    })
    .from(skills)
    .innerJoin(feedback, sql`${skills.slug} = ${feedback.skillSlug}`)
    .groupBy(skills.slug, skills.name, skills.category)
    .orderBy(
      sortOrder === 'count' ? desc(sql`feedback_count`) :
      sortOrder === 'skill' ? asc(skills.name) :
      asc(sql`avg_rating`) // worst first for triage
    );

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <SectionHeader
        title="FEEDBACK TRIAGE"
        subtitle="All skills with feedback, sorted by worst ratings first"
      />

      <FeedbackSortControls currentSort={sortOrder} />

      <div className="space-y-3">
        {skillFeedback.map((sf) => (
          <Link key={sf.slug} href={`/workshop/skills/${sf.slug}/feedback`}>
            <Card variant="interactive">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm" style={{ color: '#00bcd4' }}>/{sf.name}</span>
                  <Badge label={sf.category} />
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono" style={{ color: '#5a6577' }}>
                    {sf.feedbackCount} responses
                  </span>
                  <RatingStars rating={Number(sf.avgRating)} size="sm" showValue />
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

### Step 9: Learnings Browser — `/workshop/learnings`

#### 9.1 Learnings List Page — `web/app/workshop/learnings/page.tsx`

```tsx
import { db } from '@/lib/db';
import { learnings, learningSkillLinks } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { SectionHeader } from '@/components/ui/section-header';
import { LearningCard } from './components/learning-card';
import { StatusFilter } from './components/status-filter';

export default async function LearningsPage({
  searchParams,
}: {
  searchParams: { status?: string; source?: string };
}) {
  const statusFilter = searchParams.status || 'all';
  const sourceFilter = searchParams.source || 'all';

  const items = await db
    .select({
      id: learnings.id,
      title: learnings.title,
      summary: learnings.summary,
      sourceUrl: learnings.sourceUrl,
      sourceType: learnings.sourceType,
      relevanceTags: learnings.relevanceTags,
      distilledAt: learnings.distilledAt,
      status: learnings.status,
      affectedSkillCount: sql<number>`(
        SELECT COUNT(*) FROM learning_skill_links
        WHERE learning_id = ${learnings.id}
      )::int`,
    })
    .from(learnings)
    .where(
      sql`${statusFilter !== 'all' ? sql`${learnings.status} = ${statusFilter}` : sql`TRUE`}
        AND ${sourceFilter !== 'all' ? sql`${learnings.sourceType} = ${sourceFilter}` : sql`TRUE`}`
    )
    .orderBy(desc(learnings.distilledAt));

  const statusCounts = await db
    .select({
      status: learnings.status,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(learnings)
    .groupBy(learnings.status);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <SectionHeader
        title="LEARNINGS"
        subtitle="Distilled insights from external sources — review and apply to skills"
      />

      {/* Filter bar */}
      <div className="flex items-center gap-4 mb-6">
        <StatusFilter
          counts={statusCounts}
          active={statusFilter}
        />
        <SourceTypeFilter active={sourceFilter} />
      </div>

      {/* Learnings grid — "bubble" card layout */}
      {items.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#5a6577' }}>
          <p className="font-mono text-sm">No learnings yet</p>
          <p className="text-xs mt-1">The intelligence pipeline (Phase 06) will populate this view</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <LearningCard key={item.id} learning={item} />
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 9.2 Learning Card — `web/app/workshop/learnings/components/learning-card.tsx`

The "bubble" design — each learning is a card with source type icon, title, summary preview, affected skill count, and status indicator.

```tsx
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface LearningCardProps {
  learning: {
    id: string;
    title: string;
    summary: string;
    sourceType: string;
    sourceUrl: string | null;
    relevanceTags: string[];
    distilledAt: Date;
    status: string;
    affectedSkillCount: number;
  };
}

const sourceIcons: Record<string, string> = {
  blog: '📝',
  docs: '📚',
  changelog: '📋',
  community: '💬',
};

const statusVariant: Record<string, 'green' | 'amber' | 'cyan' | 'muted'> = {
  new: 'cyan',
  reviewed: 'amber',
  applied: 'green',
  dismissed: 'muted',
};

export function LearningCard({ learning }: LearningCardProps) {
  return (
    <Link href={`/workshop/learnings/${learning.id}`}>
      <Card variant="interactive">
        {/* Header: source icon + type badge + status */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{sourceIcons[learning.sourceType] || '📄'}</span>
            <Badge label={learning.sourceType} variant="muted" />
          </div>
          <Badge label={learning.status} variant={statusVariant[learning.status] || 'muted'} />
        </div>

        {/* Title */}
        <h3 className="font-mono text-sm font-semibold mb-1" style={{ color: '#e0e6ed' }}>
          {learning.title}
        </h3>

        {/* Summary — truncated */}
        <p className="text-xs line-clamp-3 mb-3" style={{ color: '#8892a4' }}>
          {learning.summary}
        </p>

        {/* Footer: tags + affected skills count */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 flex-wrap">
            {learning.relevanceTags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'rgba(0, 188, 212, 0.08)', color: '#00bcd4' }}
              >
                {tag}
              </span>
            ))}
          </div>
          {learning.affectedSkillCount > 0 && (
            <span className="text-xs font-mono" style={{ color: '#d4a017' }}>
              {learning.affectedSkillCount} skill{learning.affectedSkillCount > 1 ? 's' : ''} affected
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}
```

#### 9.3 Learning Detail Page — `web/app/workshop/learnings/[id]/page.tsx`

Expanded view with full distilled content, proposed skill changes, and "Apply to skill" button.

```tsx
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { learnings, learningSkillLinks, skills } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { SectionHeader } from '@/components/ui/section-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ProposedChangeCard } from './components/proposed-change-card';
import { LearningStatusActions } from './components/learning-status-actions';

export default async function LearningDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const learning = await db.query.learnings.findFirst({
    where: eq(learnings.id, params.id),
  });
  if (!learning) notFound();

  // Get linked skills with their proposed changes
  const links = await db
    .select({
      linkId: learningSkillLinks.id,
      skillSlug: learningSkillLinks.skillSlug,
      proposedChange: learningSkillLinks.proposedChange,
      linkStatus: learningSkillLinks.status,
      skillName: skills.name,
    })
    .from(learningSkillLinks)
    .innerJoin(skills, eq(learningSkillLinks.skillSlug, skills.slug))
    .where(eq(learningSkillLinks.learningId, params.id));

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <SectionHeader
        title={learning.title.toUpperCase()}
        subtitle={`Source: ${learning.sourceType} | Distilled ${learning.distilledAt.toLocaleDateString()}`}
        action={<LearningStatusActions id={learning.id} currentStatus={learning.status} />}
      />

      {/* Source link */}
      {learning.sourceUrl && (
        <a
          href={learning.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm mb-6"
          style={{ color: '#00bcd4' }}
        >
          View original source &rarr;
        </a>
      )}

      {/* Full content */}
      <Card variant="dashed" className="mb-8">
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {learning.fullContent || learning.summary}
          </ReactMarkdown>
        </div>
      </Card>

      {/* Relevance tags */}
      <div className="flex gap-2 mb-8">
        {learning.relevanceTags.map((tag) => (
          <Badge key={tag} label={tag} variant="cyan" />
        ))}
      </div>

      {/* Proposed skill changes */}
      {links.length > 0 && (
        <>
          <h3 className="font-mono text-sm uppercase tracking-widest mb-4" style={{ color: '#8892a4' }}>
            Proposed Skill Changes
          </h3>
          <div className="space-y-4">
            {links.map((link) => (
              <ProposedChangeCard
                key={link.linkId}
                linkId={link.linkId}
                skillSlug={link.skillSlug}
                skillName={link.skillName}
                proposedChange={link.proposedChange}
                status={link.linkStatus}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

#### 9.4 Proposed Change Card — `web/app/workshop/learnings/[id]/components/proposed-change-card.tsx`

Shows the proposed change for a specific skill, with an "Apply to skill" button that navigates to the skill editor with the proposed change pre-loaded.

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ProposedChangeCardProps {
  linkId: string;
  skillSlug: string;
  skillName: string;
  proposedChange: string | null;
  status: string;
}

export function ProposedChangeCard({
  linkId, skillSlug, skillName, proposedChange, status,
}: ProposedChangeCardProps) {
  const router = useRouter();

  function applyToSkill() {
    // Navigate to skill editor with the learning link ID as a query param
    // The skill editor will fetch the proposed change and show it as a diff
    router.push(`/workshop/skills/${skillSlug}?applyLearning=${linkId}`);
  }

  return (
    <Card variant="dashed">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm" style={{ color: '#00bcd4' }}>/{skillName}</span>
        <Badge
          label={status}
          variant={status === 'applied' ? 'green' : status === 'rejected' ? 'red' : 'amber'}
        />
      </div>

      {proposedChange && (
        <p className="text-sm mb-3" style={{ color: '#8892a4' }}>
          {proposedChange}
        </p>
      )}

      {status === 'pending' && (
        <button
          onClick={applyToSkill}
          className="px-3 py-1.5 rounded text-xs font-mono uppercase tracking-wider"
          style={{
            backgroundColor: 'rgba(212, 160, 23, 0.15)',
            color: '#d4a017',
            border: '1px solid #d4a017',
          }}
        >
          Apply to Skill Editor
        </button>
      )}
    </Card>
  );
}
```

### Step 10: API Routes

All routes are in `packages/web/src/app/api/` using Next.js App Router route handlers. Each route authenticates via `auth()` from `packages/web/src/lib/auth.ts` (NextAuth v5 from Phase 01). Routes are scoped to sub-phases as noted.

#### 10.1 Skills List — `packages/web/src/app/api/skills/route.ts` *(sub-phase 4b)*

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { skills } from '@/lib/db/schema';
import { sql, asc } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      description: skills.description,
      category: skills.category,
      currentVersion: sql<number>`(SELECT version_number FROM skill_versions WHERE skill_slug = ${skills.slug} AND is_current = true)`,
      totalInvocations: sql<number>`COALESCE((SELECT COUNT(*) FROM invocations WHERE skill_slug = ${skills.slug}), 0)`,
      avgRating: sql<number | null>`(SELECT AVG(rating)::numeric(3,1) FROM feedback WHERE skill_slug = ${skills.slug})`,
    })
    .from(skills)
    .orderBy(asc(skills.name));

  return NextResponse.json(result);
}
```

#### 10.2 Skill Detail — `packages/web/src/app/api/skills/[slug]/route.ts` *(sub-phase 4b)*

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { skills, skillVersions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const skill = await db.query.skills.findFirst({
    where: eq(skills.slug, params.slug),
  });
  if (!skill) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const currentVersion = await db.query.skillVersions.findFirst({
    where: and(
      eq(skillVersions.skillSlug, params.slug),
      eq(skillVersions.isCurrent, true),
    ),
  });

  return NextResponse.json({
    ...skill,
    currentContent: currentVersion?.content || null,
    currentVersionNumber: currentVersion?.versionNumber || null,
  });
}
```

#### 10.3 Save Draft — `packages/web/src/app/api/skills/[slug]/draft/route.ts` *(sub-phase 4b)*

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { skillVersions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function PUT(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { content } = await request.json();
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
  }

  // Upsert draft: if draft exists for this slug, update it; otherwise create
  const existingDraft = await db.query.skillVersions.findFirst({
    where: and(
      eq(skillVersions.skillSlug, params.slug),
      eq(skillVersions.isDraft, true),
    ),
  });

  if (existingDraft) {
    await db
      .update(skillVersions)
      .set({ content, updatedAt: new Date() })
      .where(eq(skillVersions.id, existingDraft.id));
  } else {
    // Get next version number
    const current = await db.query.skillVersions.findFirst({
      where: and(
        eq(skillVersions.skillSlug, params.slug),
        eq(skillVersions.isCurrent, true),
      ),
    });
    const nextVersion = (current?.versionNumber || 0) + 1;

    await db.insert(skillVersions).values({
      skillSlug: params.slug,
      versionNumber: nextVersion,
      content,
      isDraft: true,
      isCurrent: false,
      publishedBy: session.user?.email || 'unknown',
    });
  }

  return NextResponse.json({ ok: true });
}
```

#### 10.4 Publish — `packages/web/src/app/api/skills/[slug]/publish/route.ts` *(sub-phase 4b)*

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { skillVersions, skills } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  await db.transaction(async (tx) => {
    // Unset current flag on all versions for this skill
    await tx
      .update(skillVersions)
      .set({ isCurrent: false })
      .where(eq(skillVersions.skillSlug, params.slug));

    if (body.rollbackFromVersion) {
      // Rollback: copy old version content into a new version
      const oldVersion = await tx.query.skillVersions.findFirst({
        where: and(
          eq(skillVersions.skillSlug, params.slug),
          eq(skillVersions.versionNumber, body.rollbackFromVersion),
        ),
      });
      if (!oldVersion) throw new Error('Version not found');

      // Get next version number
      const allVersions = await tx.query.skillVersions.findMany({
        where: eq(skillVersions.skillSlug, params.slug),
      });
      const maxVersion = Math.max(...allVersions.map((v) => v.versionNumber));

      await tx.insert(skillVersions).values({
        skillSlug: params.slug,
        versionNumber: maxVersion + 1,
        content: oldVersion.content,
        changelog: `Rollback to v${body.rollbackFromVersion}`,
        isCurrent: true,
        isDraft: false,
        publishedAt: new Date(),
        publishedBy: session.user?.email || 'unknown',
      });
    } else {
      // Normal publish: promote draft to current
      const draft = await tx.query.skillVersions.findFirst({
        where: and(
          eq(skillVersions.skillSlug, params.slug),
          eq(skillVersions.isDraft, true),
        ),
      });
      if (!draft) throw new Error('No draft to publish');

      await tx
        .update(skillVersions)
        .set({
          isDraft: false,
          isCurrent: true,
          publishedAt: new Date(),
          changelog: body.changelog || null,
        })
        .where(eq(skillVersions.id, draft.id));
    }

    // Update skill's updated_at
    await tx
      .update(skills)
      .set({ updatedAt: new Date() })
      .where(eq(skills.slug, params.slug));
  });

  return NextResponse.json({ ok: true });
}
```

#### 10.5 AI Edit — `packages/web/src/app/api/skills/[slug]/ai-edit/route.ts` *(sub-phase 4b)*

```typescript
import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { auth } from '@/lib/auth';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { content, instruction } = await request.json();

  if (typeof content !== 'string' || typeof instruction !== 'string') {
    return NextResponse.json({ error: 'content and instruction must be strings' }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: `You are a skill editor for Claude Code skills. You receive the current content of a SKILL.md file and an instruction from the maintainer. Your job is to apply the requested changes and return the complete modified SKILL.md content.

Rules:
- Return ONLY the modified SKILL.md content, nothing else
- Preserve the YAML frontmatter structure exactly
- Do not add explanations or commentary outside the SKILL.md content
- If the instruction is unclear, make your best judgment and apply the change
- Maintain the existing writing style and formatting conventions`,
      messages: [
        {
          role: 'user',
          content: `Current SKILL.md content:\n\n\`\`\`markdown\n${content}\n\`\`\`\n\nInstruction: ${instruction}`,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Strip markdown code fences if the model wrapped the response
    const cleaned = responseText
      .replace(/^```(?:markdown)?\n/, '')
      .replace(/\n```$/, '');

    return NextResponse.json({ proposedContent: cleaned });
  } catch (error) {
    console.error('AI edit error:', error);
    return NextResponse.json({ error: 'AI edit failed' }, { status: 500 });
  }
}
```

#### 10.6 Version History — `packages/web/src/app/api/skills/[slug]/versions/route.ts` *(sub-phase 4b)*

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { skillVersions } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const versions = await db.query.skillVersions.findMany({
    where: eq(skillVersions.skillSlug, params.slug),
    orderBy: desc(skillVersions.versionNumber),
    columns: {
      id: true,
      versionNumber: true,
      changelog: true,
      publishedAt: true,
      publishedBy: true,
      isCurrent: true,
      isDraft: true,
      // Omit content for list view (large field)
    },
  });

  return NextResponse.json(versions);
}
```

#### 10.7 Specific Version — `packages/web/src/app/api/skills/[slug]/versions/[version]/route.ts` *(sub-phase 4b)*

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { skillVersions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { slug: string; version: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const versionNum = parseInt(params.version, 10);
  if (isNaN(versionNum)) {
    return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
  }

  const version = await db.query.skillVersions.findFirst({
    where: and(
      eq(skillVersions.skillSlug, params.slug),
      eq(skillVersions.versionNumber, versionNum),
    ),
  });

  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  return NextResponse.json(version);
}
```

#### 10.8 Skill Feedback — `packages/web/src/app/api/skills/[slug]/feedback/route.ts` *(sub-phase 4c)*

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { feedback } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const entries = await db.query.feedback.findMany({
    where: eq(feedback.skillSlug, params.slug),
    orderBy: desc(feedback.createdAt),
  });

  return NextResponse.json(entries);
}
```

#### 10.9 Learnings List — `packages/web/src/app/api/learnings/route.ts` *(sub-phase 4d)*

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { learnings } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const items = await db.query.learnings.findMany({
    orderBy: desc(learnings.distilledAt),
  });

  return NextResponse.json(items);
}
```

#### 10.10 Learning Detail — `packages/web/src/app/api/learnings/[id]/route.ts` *(sub-phase 4d)*

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { learnings, learningSkillLinks, skills } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const learning = await db.query.learnings.findFirst({
    where: eq(learnings.id, params.id),
  });
  if (!learning) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const links = await db
    .select({
      linkId: learningSkillLinks.id,
      skillSlug: learningSkillLinks.skillSlug,
      proposedChange: learningSkillLinks.proposedChange,
      status: learningSkillLinks.status,
      skillName: skills.name,
    })
    .from(learningSkillLinks)
    .innerJoin(skills, eq(learningSkillLinks.skillSlug, skills.slug))
    .where(eq(learningSkillLinks.learningId, params.id));

  return NextResponse.json({ ...learning, skillLinks: links });
}
```

#### 10.11 Apply Learning — `packages/web/src/app/api/learnings/[id]/apply/route.ts` *(sub-phase 4d)*

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { learningSkillLinks, learnings } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { skillSlug, action } = await request.json();

  if (!['applied', 'rejected'].includes(action)) {
    return NextResponse.json({ error: 'action must be "applied" or "rejected"' }, { status: 400 });
  }

  await db
    .update(learningSkillLinks)
    .set({ status: action, updatedAt: new Date() })
    .where(
      and(
        eq(learningSkillLinks.learningId, params.id),
        eq(learningSkillLinks.skillSlug, skillSlug),
      )
    );

  // If all links for this learning are resolved, update learning status
  const pendingLinks = await db.query.learningSkillLinks.findMany({
    where: and(
      eq(learningSkillLinks.learningId, params.id),
      eq(learningSkillLinks.status, 'pending'),
    ),
  });

  if (pendingLinks.length === 0) {
    // Check if any were applied
    const appliedLinks = await db.query.learningSkillLinks.findMany({
      where: and(
        eq(learningSkillLinks.learningId, params.id),
        eq(learningSkillLinks.status, 'applied'),
      ),
    });

    const newStatus = appliedLinks.length > 0 ? 'applied' : 'dismissed';
    await db
      .update(learnings)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(learnings.id, params.id));
  }

  return NextResponse.json({ ok: true });
}
```

### Step 11: Navigation Update

Add workshop navigation items to the existing layout from Phase 01. Modify `web/app/layout.tsx` to include:

```tsx
// Add to the navigation section in the existing layout
const workshopNavItems = [
  { href: '/workshop', label: 'Skills', icon: '⚡' },
  { href: '/workshop/feedback', label: 'Feedback', icon: '💬' },
  { href: '/workshop/learnings', label: 'Learnings', icon: '🧠' },
];
```

The exact integration depends on Phase 01's layout structure, but the items above should be added to whatever navigation component Phase 01 establishes (likely a sidebar or top nav).

---

## Complete File Inventory

### New Files (42 total)

**Database:**
1. `web/lib/db/migrations/004_learnings.sql` — Learnings + learning_skill_links tables

**Design System (6):**
2. `web/lib/design/tokens.ts` — Color and font tokens
3. `web/components/ui/card.tsx` — Card component
4. `web/components/ui/section-header.tsx` — Monospace section headers
5. `web/components/ui/rating-stars.tsx` — Star rating display
6. `web/components/ui/badge.tsx` — Status/category badges
7. `web/components/ui/timeline.tsx` — Version history timeline

**Workshop Shared (1):**
8. `packages/web/src/components/workshop/diff-viewer.tsx` — Custom React diff viewer (unified/split, no diff2html)

**Skill Browser - `/workshop` (5):**
10. `web/app/workshop/page.tsx` — Main skill listing page
11. `web/app/workshop/components/skill-card.tsx` — Skill card component
12. `web/app/workshop/components/skill-grid.tsx` — Grid with DB query
13. `web/app/workshop/components/category-filter.tsx` — Sidebar category filter
14. `web/app/workshop/components/search-input.tsx` — Search input
15. `web/app/workshop/components/sort-selector.tsx` — Sort dropdown

**Skill Detail - `/workshop/skills/:slug` (4):**
16. `web/app/workshop/skills/[slug]/page.tsx` — Skill detail page
17. `web/app/workshop/skills/[slug]/components/skill-editor.tsx` — Monaco editor + preview
18. `web/app/workshop/skills/[slug]/components/agent-chat-input.tsx` — AI edit input
19. `web/app/workshop/skills/[slug]/components/skill-sidebar.tsx` — Metadata sidebar

**Version History - `/workshop/skills/:slug/history` (3):**
20. `web/app/workshop/skills/[slug]/history/page.tsx` — Version history page
21. `web/app/workshop/skills/[slug]/history/components/version-actions.tsx` — Compare/rollback buttons
22. `web/app/workshop/skills/[slug]/history/components/version-compare.tsx` — Two-version diff view

**Feedback - `/workshop/skills/:slug/feedback` + `/workshop/feedback` (5):**
23. `web/app/workshop/skills/[slug]/feedback/page.tsx` — Skill feedback page
24. `web/app/workshop/skills/[slug]/feedback/components/rating-distribution.tsx` — Bar chart
25. `web/app/workshop/skills/[slug]/feedback/components/feedback-list.tsx` — Feedback entries
26. `web/app/workshop/skills/[slug]/feedback/components/feedback-sort-controls.tsx` — Sort controls
27. `web/app/workshop/feedback/page.tsx` — Cross-skill feedback triage

**Learnings - `/workshop/learnings` (6):**
28. `web/app/workshop/learnings/page.tsx` — Learnings list page
29. `web/app/workshop/learnings/components/learning-card.tsx` — Learning bubble card
30. `web/app/workshop/learnings/components/status-filter.tsx` — Status filter tabs
31. `web/app/workshop/learnings/components/source-type-filter.tsx` — Source type filter
32. `web/app/workshop/learnings/[id]/page.tsx` — Learning detail page
33. `web/app/workshop/learnings/[id]/components/proposed-change-card.tsx` — Proposed change card
34. `web/app/workshop/learnings/[id]/components/learning-status-actions.tsx` — Status update buttons

**API Routes (11):**
35. `web/app/api/skills/route.ts` — GET /api/skills
36. `web/app/api/skills/[slug]/route.ts` — GET /api/skills/:slug
37. `web/app/api/skills/[slug]/draft/route.ts` — PUT /api/skills/:slug/draft
38. `web/app/api/skills/[slug]/publish/route.ts` — POST /api/skills/:slug/publish
39. `web/app/api/skills/[slug]/ai-edit/route.ts` — POST /api/skills/:slug/ai-edit
40. `web/app/api/skills/[slug]/versions/route.ts` — GET /api/skills/:slug/versions
41. `web/app/api/skills/[slug]/versions/[version]/route.ts` — GET /api/skills/:slug/versions/:version
42. `web/app/api/skills/[slug]/feedback/route.ts` — GET /api/skills/:slug/feedback
43. `web/app/api/learnings/route.ts` — GET /api/learnings
44. `web/app/api/learnings/[id]/route.ts` — GET /api/learnings/:id
45. `web/app/api/learnings/[id]/apply/route.ts` — POST /api/learnings/:id/apply

### Modified Files (2)
1. `packages/db/src/schema.ts` — `learnings` and `learningSkillLinks` tables *(done in 4a)*
2. `packages/web/package.json` — Add frontend dependencies (Monaco, diff, react-markdown, remark-gfm, rehype-highlight)

---

## Test Plan

### Unit Tests

**API Route Tests** — Create `web/__tests__/api/` with test files for each route:

1. `skills.test.ts` — Test GET /api/skills returns skill list with aggregated stats. Test unauthenticated access returns 401.
2. `skills-slug.test.ts` — Test GET /api/skills/:slug returns skill with current content. Test 404 for unknown slug.
3. `skills-draft.test.ts` — Test PUT /api/skills/:slug/draft creates new draft. Test upsert updates existing draft.
4. `skills-publish.test.ts` — Test POST /api/skills/:slug/publish promotes draft. Test rollback creates new version with old content.
5. `skills-ai-edit.test.ts` — Test POST /api/skills/:slug/ai-edit with mock Anthropic client. Test error handling for missing API key.
6. `learnings.test.ts` — Test CRUD for learnings. Test apply/reject status transitions.

**Component Tests** — Create `web/__tests__/components/`:

7. `diff-viewer.test.tsx` — Test that DiffViewer renders unified and split views. Test toggle between modes.
8. `rating-stars.test.tsx` — Test correct number of filled/empty stars for each rating value.
9. `skill-card.test.tsx` — Test card renders all metadata fields. Test click navigates to skill detail.

### Integration Tests

10. **Draft-Publish flow:** Create draft via API, verify it appears in editor, publish it, verify it becomes current version and old version loses `isCurrent` flag.
11. **Rollback flow:** Publish v1, publish v2, rollback to v1. Verify v3 is created with v1's content and is now current.
12. **AI Edit flow:** Mock Anthropic API, submit instruction, verify proposed content is returned and displayed as diff.
13. **Learning apply flow:** Create learning with skill link, click "Apply to skill", verify navigation to skill editor with learning context.

### Manual Verification Steps

1. Navigate to `/workshop` — verify all 38 skills appear grouped by 8 categories
2. Click a skill card — verify editor loads with SKILL.md content on left, rendered preview on right
3. Edit content in Monaco Editor — verify preview updates live
4. Type an instruction in the agent chat input — verify AI-proposed diff appears
5. Accept AI proposal — verify content updates in editor
6. Save draft — verify "Unsaved changes" indicator disappears
7. Navigate to version history — verify timeline shows all versions
8. Select two versions for comparison — verify diff renders correctly in both unified and split modes
9. Click "Rollback" on an old version — verify new version is created
10. Navigate to skill feedback page — verify rating distribution chart renders
11. Navigate to `/workshop/feedback` — verify triage view shows skills sorted by worst rating
12. Navigate to `/workshop/learnings` — verify empty state message about Phase 06
13. Verify all pages require authentication — unauthenticated access redirects to login

---

## Documentation Updates

### README.md

Add a "Workshop UI" section under the platform overview:

```markdown
## Workshop UI

The workshop is accessible at `/workshop` after authentication. It provides:

- **Skill Browser** — Browse all skills by category, search, and sort by usage or rating
- **Skill Editor** — Side-by-side SKILL.md editor with live Markdown preview
- **AI-Assisted Editing** — Send natural-language instructions to Claude for skill modifications
- **Version History** — View all versions, compare any two with side-by-side diffing
- **Feedback Dashboard** — View ratings and comments, triage across all skills
- **Learnings Browser** — Review distilled insights (populated by Intelligence Pipeline)
```

### API Documentation

Create `web/docs/api.md` with endpoint documentation for all 11 API routes, including request/response schemas, authentication requirements, and example curl commands.

### Inline Comments

All React components should have JSDoc comments explaining their purpose and props. API routes should document their request body schema and response format in comments at the top of each file.

---

## Stress Testing and Edge Cases

### Editor Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| SKILL.md with 1000+ lines | Monaco Editor handles large files natively. No custom pagination needed. |
| YAML frontmatter with special characters | Monaco's markdown mode handles YAML within fenced blocks. Preview panel uses react-markdown which handles frontmatter gracefully. |
| Concurrent draft saves (same user, two tabs) | Last write wins. The PUT /api/skills/:slug/draft endpoint is an upsert. No conflict resolution needed for single-maintainer use case. |
| AI edit returns malformed SKILL.md | The diff viewer shows the full proposed content. User can reject and retry. No automatic validation of SKILL.md structure. |
| AI edit with very long SKILL.md | Anthropic API has a token limit. For skills over ~30K characters, the API may truncate. The endpoint should catch errors and return a user-friendly message. |
| Network disconnection during save | The `isSaving` state prevents double-submission. User sees "Saving..." indefinitely. Add a timeout (10 seconds) that resets the state and shows an error. |

### Diff Viewer Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Identical versions compared | Custom diff viewer shows "No changes" message when `diffLines()` returns a single unchanged chunk. |
| Very large diff (1000+ changed lines) | Custom React diff viewer renders all lines. May be slow in split view. Add a warning: "Large diff — consider unified view for better performance." |
| Binary or non-UTF8 content | SKILL.md files are always UTF-8 Markdown. No binary content expected. If encountered, diff library will show garbled output. |

### Feedback Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Skill with 0 feedback | Rating distribution shows empty bars. Feedback list shows "No feedback yet" empty state. |
| Skill with 1000+ feedback entries | Paginate the feedback list. Add `?page=N&limit=50` query params to the API route. |
| XSS in feedback comments | React's JSX escaping prevents XSS. Comments are rendered as text, not HTML. |

### Learnings Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| No learnings data (Phase 06 not yet built) | Empty state with message: "The intelligence pipeline (Phase 06) will populate this view." |
| Learning linked to deleted skill | `ON DELETE CASCADE` on `learning_skill_links.skill_slug` removes the link automatically. |
| Proposed change text is very long | Truncate in the card view with "..." and show full text in the detail page. |

---

## Verification Checklist

- [ ] `004_learnings.sql` migration runs successfully
- [ ] Drizzle schema matches SQL migration exactly
- [ ] All 5 npm dependencies install without conflicts (monaco, diff, react-markdown, remark-gfm, rehype-highlight)
- [ ] Monaco Editor loads and renders SKILL.md with syntax highlighting
- [ ] Markdown preview renders correctly with GFM tables and code blocks
- [ ] Custom diff viewer renders unified and split views correctly with dark theme
- [ ] CSS bar chart renders rating distribution correctly (no recharts)
- [ ] All API routes for the current sub-phase return correct responses
- [ ] All API routes return 401 for unauthenticated requests
- [ ] Draft save creates or updates draft version correctly
- [ ] Publish promotes draft to current and unsets previous current
- [ ] Rollback creates new version with old content
- [ ] AI edit calls Anthropic API and returns proposed content
- [ ] AI edit shows diff between current and proposed content
- [ ] Accept/reject AI proposal updates editor content correctly
- [ ] Version comparison works with any two version selections
- [ ] Feedback triage view sorts by worst rating first
- [ ] Learnings empty state renders correctly
- [ ] "Apply to skill" button navigates to skill editor with learning context
- [ ] Navigation items appear in layout
- [ ] All pages work on viewport widths 1024px-1920px (desktop only, no mobile required)
- [ ] No console errors on any page

---

## What NOT to Do

1. **Do NOT build the intelligence pipeline data ingestion.** Phase 04 creates the `learnings` tables and display UI only. Phase 06 handles scraping, distilling, and populating the data.

2. **Do NOT build team admin views.** Phase 05 handles team-wide dashboards. Phase 04 is the maintainer's personal workshop.

3. **Do NOT use CodeMirror instead of Monaco.** Monaco is heavier (~2MB) but provides VS Code-grade editing experience including intellisense, bracket matching, and multi-cursor support. The maintainer edits complex SKILL.md files — this is worth the bundle size.

4. **Do NOT implement real-time collaborative editing.** Single maintainer use case. No WebSocket or CRDT needed. Simple save-draft/publish flow.

5. **Do NOT add mobile-responsive layouts.** The workshop is a desktop power-user tool. A sidebar + main content layout at 1024px minimum is sufficient.

6. **Do NOT store ANTHROPIC_API_KEY in the database or expose it via API.** It stays in the server environment variable. The AI edit route runs server-side only.

7. **Do NOT implement rate limiting on the AI edit endpoint in this phase.** The single-maintainer use case does not require it. If abuse becomes a concern, add rate limiting in a future phase.

8. **Do NOT build custom Markdown parsing for SKILL.md frontmatter.** Use `react-markdown` for display only. The editor handles raw text. YAML frontmatter parsing (for metadata extraction) is already done by Phase 01/03's ingestion pipeline.

9. **Do NOT create separate API routes for search/filter.** Use query parameters on the existing GET /api/skills endpoint. The dataset is small (~38 skills) — client-side filtering via URL params is sufficient.

10. **Do NOT add drag-and-drop reordering of skills or categories.** The category system is derived from the skill inventory and is not user-editable in Phase 04.

---
