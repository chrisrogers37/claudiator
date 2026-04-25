# Phase 3: Battle Detail Page Improvements

## Goal

Surface the improved battle data (verdict synthesis, category-specific scores) so you can read a battle page and immediately understand what happened and why.

## Changes

All changes are in the battle detail page and its components. No backend/schema changes.

### 1. Verdict Synthesis Block -- `[battleId]/page.tsx`

Add a new block between the verdict banner and the scenarios section. This is the most important addition — it's the TL;DR of the battle.

**Placement:** After the verdict banner (line ~212), before the evolution link.

```tsx
{/* Verdict Synthesis */}
{battle.verdictSummary && (
  <div className="mb-6 rounded-lg border border-gray-800 bg-[#161b22] p-5">
    <h3 className="font-mono text-xs text-gray-500 uppercase tracking-wider mb-3">
      Battle Analysis
    </h3>
    <div className="font-mono text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
      {battle.verdictSummary}
    </div>
  </div>
)}
```

### 2. Open Scenarios by Default

Currently scenarios are `<details>` elements that start collapsed. For a meaningful battle review, outputs should be visible without clicking.

**Change:** Auto-open completed battle scenarios.

```tsx
<details
  key={scenario.id}
  open={battle.status === "complete" || undefined}  // open for completed battles
  className="rounded-lg border border-gray-800 bg-[#161b22]"
>
```

### 3. Remove Output Height Cap

Currently outputs have `max-h-64` (256px) which hides most of the content. Session handoff outputs are long — truncating defeats the purpose of side-by-side comparison.

**Change:** Remove `max-h-64` from the output `<pre>` elements (lines 301, 310). Replace with a taller cap or no cap:

```tsx
// Before: max-h-64
// After: max-h-[600px] — tall enough to see meaningful content, scroll for very long outputs
className="... max-h-[600px] overflow-y-auto ..."
```

### 4. Judge Reasoning Always Visible -- `judge-card.tsx`

Currently reasoning is hidden behind a toggle button (`expanded` state). Make it always visible — it's the most important part of the judge card.

**Change:** Remove the toggle mechanism. Always show reasoning.

```tsx
// Remove: const [expanded, setExpanded] = useState(false);
// Remove: the button element
// Replace with always-visible reasoning:
<p className="mt-3 font-mono text-xs text-gray-400 leading-relaxed border-t border-gray-800 pt-3">
  {reasoning}
</p>
```

This also means `JudgeCard` no longer needs `"use client"` since it has no state.

### 5. Dynamic Dimension Labels -- `judge-card.tsx`

Currently the score grid hardcodes `["accuracy", "completeness", "style", "efficiency"]` and truncates to 4 chars. With dynamic rubrics, the dimensions come from the battle's category rubric.

**Change:** Accept dimension keys/labels as a prop instead of hardcoding.

```tsx
interface JudgeCardProps {
  judgeIndex: number;
  winnerId: string;
  confidence: number;
  scores: {
    champion: Record<string, number> & { total: number };
    challenger: Record<string, number> & { total: number };
  };
  reasoning: string;
  dimensions: { key: string; label: string }[];  // NEW
}
```

```tsx
// Replace hardcoded dimensions loop:
{dimensions.map(({ key, label }) => {
  const champVal = scores.champion[key] ?? 0;
  const challVal = scores.challenger[key] ?? 0;
  // ... rest of the grid cell
  <p className="font-mono text-xs text-gray-500 uppercase tracking-wider mb-1.5 truncate">
    {label.slice(0, 6)}
  </p>
  // ...
})}
```

### 6. Pass Rubric Dimensions to JudgeCard -- `[battleId]/page.tsx`

The battle detail page needs to know the rubric dimensions to pass to JudgeCard. Two approaches:

**Option A (simpler):** Infer dimensions from the first judgment's score keys:
```typescript
const scoreDimensions = allJudgments.length > 0
  ? Object.keys(allJudgments[0].scores.champion)
      .filter(k => k !== "total")
      .map(k => ({ key: k, label: k.replace(/_/g, " ") }))
  : [
      { key: "accuracy", label: "accuracy" },
      { key: "completeness", label: "completeness" },
      { key: "style", label: "style" },
      { key: "efficiency", label: "efficiency" },
    ];
```

**Option B (richer):** Fetch the category's rubric in `getBattleDetail()` and pass full labels/descriptions. Better UX but adds a join.

Go with **Option A** initially — it's zero-backend-change and works for both old and new battles.

### 7. Category Badge on Battle Header

Add the category to the battle matchup header so you know what type of battle this is:

```tsx
{/* Below the VS center block, add category context */}
{battle.challengerCategoryDomain && battle.challengerCategoryFunction && (
  <div className="text-center mt-2">
    <span className="font-mono text-xs text-gray-500">
      {battle.challengerCategoryDomain}/{battle.challengerCategoryFunction}
    </span>
  </div>
)}
```

## Files Modified

| File | Change |
|------|--------|
| `packages/web/src/app/arena/[battleId]/page.tsx` | Verdict synthesis block, auto-open scenarios, remove output height cap, pass dimensions to JudgeCard, category badge |
| `packages/web/src/app/arena/components/judge-card.tsx` | Always-visible reasoning, dynamic dimension labels, remove "use client" |
| `packages/web/src/lib/arena/battle-queries.ts` | Add `verdictSummary` to select (done in Phase 2) |

## Verification

1. View a completed battle at `/arena/<battleId>`
2. Confirm verdict synthesis appears at top in a card
3. Confirm scenarios are expanded by default
4. Confirm outputs are visible without scrolling (up to 600px)
5. Confirm judge reasoning is visible without clicking
6. Confirm score dimensions match the category rubric (e.g., "context preservation" not "accuracy")
7. Confirm category badge shows in the header
