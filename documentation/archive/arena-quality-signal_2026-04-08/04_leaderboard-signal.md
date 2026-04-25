# Phase 4: Leaderboard Signal

## Goal

Make the leaderboard tell a story: ELO trend, battle history access, and enough context to understand why a skill is ranked where it is.

## Changes

### 1. Query ELO History for Ranked Skills

In `leaderboard/page.tsx`, add a parallel query for `arenaEloHistory`:

```typescript
import { arenaEloHistory } from "@claudiator/db/schema";

// Add to the Promise.all (line 23):
db
  .select({
    skillId: arenaEloHistory.skillId,
    eloAfter: arenaEloHistory.eloAfter,
    eloChange: arenaEloHistory.eloChange,
    outcome: arenaEloHistory.outcome,
    createdAt: arenaEloHistory.createdAt,
  })
  .from(arenaEloHistory)
  .orderBy(asc(arenaEloHistory.createdAt)),
```

Group in JS:
```typescript
const eloHistoryBySkill = new Map<string, typeof eloHistory>();
for (const entry of eloHistory) {
  const list = eloHistoryBySkill.get(entry.skillId) ?? [];
  list.push(entry);
  eloHistoryBySkill.set(entry.skillId, list);
}
```

### 2. ELO Sparkline Component

Create a simple inline sparkline using SVG -- no external dependency needed.

```tsx
// packages/web/src/app/arena/components/elo-sparkline.tsx

interface EloSparklineProps {
  history: { eloAfter: number; outcome: string }[];
  width?: number;
  height?: number;
}

export function EloSparkline({ history, width = 80, height = 24 }: EloSparklineProps) {
  if (history.length < 2) return null;

  const values = history.map(h => h.eloAfter);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const trending = values[values.length - 1] >= values[0];

  return (
    <svg width={width} height={height} className="inline-block align-middle">
      <polyline
        points={points}
        fill="none"
        stroke={trending ? "#4ade80" : "#f87171"}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

### 3. Add Sparkline + Battle History Link to Leaderboard Table

In the mini leaderboard table within each category section, add two columns:

```tsx
// Table header — add after "Win %" column:
<th>Trend</th>
<th></th>  {/* battle history link */}

// Table body — add after winRate cell:
<td className="px-3 py-2">
  <EloSparkline history={eloHistoryBySkill.get(r.skillId) ?? []} />
</td>
<td className="px-3 py-2">
  <Link
    href={`/arena/battles?skill=${r.skillId}`}
    className="font-mono text-[10px] text-gray-600 hover:text-cyan-400 transition-colors"
  >
    battles
  </Link>
</td>
```

### 4. Last Battle Date

Add `lastBattleAt` to the rankings query:

```typescript
// In the rankings query, add:
lastBattleAt: arenaRankings.lastBattleAt,
```

Display as relative time below the skill name or as a tooltip:
```tsx
{r.lastBattleAt && (
  <span className="font-mono text-[10px] text-gray-600 block">
    last battle: {formatRelativeDate(r.lastBattleAt)}
  </span>
)}
```

Use a simple relative date formatter:
```typescript
function formatRelativeDate(date: Date): string {
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
```

### 5. Battle List Skill Filter (supports link from leaderboard)

In `battles/page.tsx`, add support for a `skill` query param to filter battles by champion skill ID. This enables the "battles" link from the leaderboard.

```typescript
// searchParams:
searchParams: Promise<{ page?: string; skill?: string }>;

// Add WHERE clause when skill param is present:
const { page: pageParam, skill: skillParam } = await searchParams;

// In the battles query:
.where(skillParam ? eq(battles.championSkillId, skillParam) : undefined)
```

Add a filter indicator when active:
```tsx
{skillParam && (
  <div className="mb-4 flex items-center gap-2">
    <span className="font-mono text-xs text-gray-500">
      Filtered by skill
    </span>
    <Link href="/arena/battles" className="font-mono text-xs text-cyan-400 hover:underline">
      clear
    </Link>
  </div>
)}
```

## Files Modified

| File | Change |
|------|--------|
| `packages/web/src/app/arena/leaderboard/page.tsx` | ELO history query, sparkline, battle link, last battle date |
| `packages/web/src/app/arena/components/elo-sparkline.tsx` | New file: SVG sparkline component |
| `packages/web/src/app/arena/battles/page.tsx` | Skill filter support via query param |

## Verification

1. View leaderboard with a category that has ranked skills with battle history
2. Confirm ELO sparkline appears (green = trending up, red = trending down)
3. Click "battles" link -- should navigate to battles page filtered to that skill
4. Confirm last battle date shows in the ranking row
5. On battles page, confirm filter indicator and "clear" link work
