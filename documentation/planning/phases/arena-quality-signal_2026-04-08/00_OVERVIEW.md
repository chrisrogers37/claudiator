# Arena Quality & Signal Enhancement -- Overview

**Status:** IN PROGRESS
**Started:** 2026-04-09

## Context

The Arena pipeline runs end-to-end (discover > categorize > score > queue > battle > rank) but battles don't produce results you can trust. Three root causes:

1. **Generic scoring** -- the same 4 dimensions (accuracy, completeness, style, efficiency) judge every skill regardless of category. A session handoff skill should be judged on actionability and context preservation, not "efficiency."
2. **Buried signal** -- battle detail pages collapse outputs and hide judge reasoning behind toggles. The leaderboard shows ELO numbers with no trend or narrative.
3. **No domain awareness** -- scenarios are generated without understanding what matters for a given skill type. Session handoff scenarios don't test whether the handoff enables seamless session continuation.

## Dependency Graph

```
Phase 1: Category Rubrics & Domain-Aware Scenarios
    |
    v
Phase 2: Verdict Synthesis & Judge Context
    |
    v
Phase 3: Battle Detail Page Improvements
    |
    v
Phase 4: Leaderboard Signal
    |
Phase 5: Battle Filtering & Category Seeding  (parallel with Phase 4)
```

Phases 4 and 5 are independent of each other but both depend on Phases 1-3.

## Phase Summary

| Phase | Title | Depends On | Effort |
|-------|-------|-----------|--------|
| 01 | Category Rubrics & Domain-Aware Scenarios | -- | Medium |
| 02 | Verdict Synthesis & Judge Context | 01 | Low-Medium |
| 03 | Battle Detail Page Improvements | 02 | Medium |
| 04 | Leaderboard Signal | 03 | Medium |
| 05 | Battle Filtering & Category Seeding | 01 | Medium |

## Test Category

All work is validated against "session handoff" as a test category with a custom rubric. The system generalizes to any category -- session handoff is just the proving ground.

## Key Files Touched Across Phases

| File | Phases |
|------|--------|
| `packages/db/src/schema.ts` | 01, 02 |
| `packages/web/src/lib/arena/prompts.ts` | 01, 02 |
| `packages/web/src/lib/arena/judges.ts` | 01 |
| `packages/web/src/lib/arena/scenarios.ts` | 01 |
| `packages/web/src/lib/arena/executor.ts` | 02 |
| `packages/web/src/app/arena/[battleId]/page.tsx` | 03 |
| `packages/web/src/app/arena/components/judge-card.tsx` | 03 |
| `packages/web/src/lib/arena/battle-queries.ts` | 03 |
| `packages/web/src/app/arena/leaderboard/page.tsx` | 04 |
| `packages/web/src/app/arena/battles/page.tsx` | 05 |
| `packages/web/src/lib/arena/category-council.ts` | 05 |

## Verification

After all phases, run a full session handoff battle:
1. Seed session-handoff category with custom rubric
2. Ingest 2-3 session handoff skills
3. Execute a battle via Web UI
4. Confirm scenarios test handoff-specific concerns
5. Confirm judge scores use custom dimensions
6. Confirm verdict synthesis explains why winner won
7. Confirm leaderboard shows ELO trend
8. Confirm battle list filters by category
