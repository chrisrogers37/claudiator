# Phase 1: Category Rubrics & Domain-Aware Scenarios

## Goal

Make battles meaningful by letting each category define its own scoring dimensions and generating scenarios that test what actually matters for that skill type.

## Schema Change

Add `scoringRubric` JSONB column to `skillCategories`:

```typescript
// packages/db/src/schema.ts — skillCategories table
scoringRubric: jsonb("scoring_rubric").$type<ScoringRubric | null>(),
```

### Rubric Type Definition

```typescript
// packages/web/src/lib/arena/types.ts (new file)
export interface RubricDimension {
  key: string;          // e.g. "actionability" — used in JSON scores
  label: string;        // e.g. "Actionability" — displayed in UI
  description: string;  // e.g. "Can the next session resume work seamlessly?"
  maxScore: number;     // always 25 (4 dimensions x 25 = 100)
}

export interface ScoringRubric {
  dimensions: [RubricDimension, RubricDimension, RubricDimension, RubricDimension];
}

// Default rubric (backwards compatible with current system)
export const DEFAULT_RUBRIC: ScoringRubric = {
  dimensions: [
    { key: "accuracy", label: "Accuracy", description: "Correctness and relevance of the response", maxScore: 25 },
    { key: "completeness", label: "Completeness", description: "How thoroughly the scenario is addressed", maxScore: 25 },
    { key: "style", label: "Style", description: "Quality of formatting, communication, and user experience", maxScore: 25 },
    { key: "efficiency", label: "Efficiency", description: "Conciseness, avoiding unnecessary steps", maxScore: 25 },
  ],
};
```

### Migration

```sql
ALTER TABLE skill_categories ADD COLUMN scoring_rubric jsonb;
```

### Seed Session Handoff Rubric

Either via a migration or a seed script:

```typescript
const sessionHandoffRubric: ScoringRubric = {
  dimensions: [
    {
      key: "context_preservation",
      label: "Context Preservation",
      description: "Captures decisions, blockers, in-progress work, and relevant state accurately",
      maxScore: 25,
    },
    {
      key: "actionability",
      label: "Actionability",
      description: "Next session can immediately act on the handoff without re-reading the codebase",
      maxScore: 25,
    },
    {
      key: "completeness",
      label: "Completeness",
      description: "Nothing important is missing: open questions, next steps, modified files, test status",
      maxScore: 25,
    },
    {
      key: "parsability",
      label: "Parsability",
      description: "Output is well-structured, machine-friendly, and follows a consistent format",
      maxScore: 25,
    },
  ],
};
```

## Prompt Changes

### `scenarioGenerationPrompt()` — `prompts.ts:107`

Current signature: `(skillPurpose: string, category: string)`

New signature: `(skillPurpose: string, category: string, rubric: ScoringRubric)`

Add rubric context to the system prompt so the LLM generates scenarios that test the right things:

```
SCORING DIMENSIONS FOR THIS CATEGORY:
${rubric.dimensions.map(d => `- ${d.label}: ${d.description}`).join('\n')}

Design scenarios that allow judges to meaningfully differentiate on these dimensions.
For example, if a dimension is "Actionability", the scenario should include enough
context about what the next session needs to accomplish that judges can evaluate
whether the skill's output would actually enable that.
```

### `judgingPrompt()` — `prompts.ts:181`

Current: hardcoded 4 dimensions in a static string.

New signature: `(rubric: ScoringRubric)`

Replace the hardcoded dimensions with the rubric's dimensions:

```
Score each output on ${rubric.dimensions.length} dimensions (0-${rubric.dimensions[0].maxScore} each, total 0-100):
${rubric.dimensions.map(d => `- ${d.key}: ${d.description}`).join('\n')}

Output ONLY valid JSON:
{
  "winner": "champion" | "challenger" | "draw",
  "scores": {
    "champion": { ${rubric.dimensions.map(d => `"${d.key}": <0-${d.maxScore}>`).join(', ')}, "total": <0-100> },
    "challenger": { ${rubric.dimensions.map(d => `"${d.key}": <0-${d.maxScore}>`).join(', ')}, "total": <0-100> }
  },
  "reasoning": "Brief explanation of why you chose the winner",
  "confidence": <0-100>
}
```

### `judgingUserPrompt()` — `prompts.ts:202`

Increase output truncation from 8K to 20K (this is simple and addresses gap #6):

```typescript
// Line 219-220: change slice limits
${championOutput.slice(0, 20_000)}
...
${challengerOutput.slice(0, 20_000)}
```

## Code Changes

### `scenarios.ts` — `generateScenarios()`

1. After fetching the category, also fetch `scoringRubric`:
   ```typescript
   const [cat] = await db
     .select({
       domain: skillCategories.domain,
       function: skillCategories.function,
       scoringRubric: skillCategories.scoringRubric,
     })
     .from(skillCategories)
     .where(eq(skillCategories.id, candidate.categoryId));
   ```

2. Parse rubric with fallback:
   ```typescript
   import { DEFAULT_RUBRIC, type ScoringRubric } from "./types";
   const rubric: ScoringRubric = (cat?.scoringRubric as ScoringRubric) ?? DEFAULT_RUBRIC;
   ```

3. Pass rubric to prompt:
   ```typescript
   const prompt = scenarioGenerationPrompt(
     candidate.extractedPurpose || "unknown",
     categoryLabel,
     rubric
   );
   ```

### `judges.ts` — `judgeRound()`

1. Accept rubric as parameter:
   ```typescript
   export async function judgeRound(
     db: Db, roundId: string, judgeIndex: number,
     scenario: ScenarioInfo,
     championOutput: string, challengerOutput: string,
     battleId: string,
     rubric: ScoringRubric  // NEW
   ): Promise<JudgmentResult>
   ```

2. Pass rubric to prompt:
   ```typescript
   system: judgingPrompt(rubric),
   ```

3. Update `JudgmentResult` type to use dynamic dimensions:
   ```typescript
   export interface JudgmentResult {
     winner: "champion" | "challenger" | "draw";
     scores: {
       champion: Record<string, number> & { total: number };
       challenger: Record<string, number> & { total: number };
     };
     reasoning: string;
     confidence: number;
   }
   ```

4. Update the fallback parse-failure scores to use rubric dimension keys:
   ```typescript
   const fallbackScores = Object.fromEntries(
     rubric.dimensions.map(d => [d.key, Math.floor(d.maxScore / 2)])
   );
   fallbackScores.total = rubric.dimensions.length * Math.floor(rubric.dimensions[0].maxScore / 2);
   ```

### `executor.ts` — `executeBattle()`

1. Fetch the rubric once at battle start (alongside champion/challenger content):
   ```typescript
   // After fetching candidate, get category rubric
   let rubric = DEFAULT_RUBRIC;
   if (candidate.categoryId) {  // need to also fetch categoryId from candidate
     const [cat] = await db.select({ scoringRubric: skillCategories.scoringRubric })
       .from(skillCategories).where(eq(skillCategories.id, candidateRecord.categoryId));
     if (cat?.scoringRubric) rubric = cat.scoringRubric as ScoringRubric;
   }
   ```

   Note: the executor currently fetches `intakeCandidates.rawContent` but not `categoryId`. Add `categoryId` to the select or do a separate query.

2. Pass rubric to `judgeRound()`:
   ```typescript
   judgeRound(db, roundRecord.id, i, scenario, championResult.text, challengerResult.text, battleId, rubric)
   ```

### `battleJudgments` schema — `schema.ts:543`

The `scores` JSONB column currently has a hardcoded type. Change to dynamic:

```typescript
scores: jsonb("scores").$type<{
  champion: Record<string, number> & { total: number };
  challenger: Record<string, number> & { total: number };
}>().notNull(),
```

This is backwards compatible — existing rows with `accuracy/completeness/style/efficiency` keys still match the type.

## DB Build Step

After schema changes:
```bash
cd packages/db && pnpm build
```

Then generate and run migration:
```bash
cd packages/db && pnpm drizzle-kit generate
cd packages/db && pnpm drizzle-kit migrate
```

## Verification

1. Insert or update `session-handoff` category row with the rubric JSON
2. Run `pnpm arena-test discover --repo <repo-with-session-handoff-skills>`
3. Execute a battle in the UI
4. Check `arenaLlmCalls` for the scenario_gen call — confirm the prompt includes rubric dimensions
5. Check `battleJudgments.scores` — confirm dimension keys match the rubric (e.g., `context_preservation` not `accuracy`)
