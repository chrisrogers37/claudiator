# Phase 2: Verdict Synthesis & Judge Context

## Goal

After all judges vote, generate a human-readable narrative explaining why the winner won. This is the single most important trust signal -- it tells you what happened without reading 15 judge cards.

## Schema Change

Add `verdictSummary` text column to `battles`:

```typescript
// packages/db/src/schema.ts — battles table (after verdict field, ~line 453)
verdictSummary: text("verdict_summary"),
```

### Migration

```sql
ALTER TABLE battles ADD COLUMN verdict_summary text;
```

Also add `verdict_synthesis` to the `arenaLlmCalls.callType` enum:

```sql
-- If using Drizzle migrations, update the enum in schema.ts first:
callType: text("call_type", {
  enum: [
    "categorize", "fight_score", "scenario_gen",
    "skill_exec_champion", "skill_exec_challenger",
    "judge", "evolve", "category_council",
    "verdict_synthesis",  // NEW
  ],
}).notNull(),
```

## New Prompt

Add to `prompts.ts`:

```typescript
export function verdictSynthesisPrompt(
  rubric: ScoringRubric
): { system: string } {
  return {
    system: `You are a battle analyst for Claudiator's skill arena. After all judges have voted, you synthesize their individual judgments into a clear, concise narrative.

Your summary should:
1. State the verdict and margin (e.g., "The challenger won 4-1 with an average score advantage of 12 points")
2. Explain WHAT the winner did better, citing specific scoring dimensions: ${rubric.dimensions.map(d => d.label).join(', ')}
3. Note WHERE the loser fell short, with concrete examples from judge reasoning
4. Briefly describe what a "perfect" skill would do in this category

Keep it to 2-3 short paragraphs. Be specific -- reference actual judge observations, not generic praise.

Output plain text, not JSON.`,
  };
}

export function verdictSynthesisUserPrompt(
  verdict: string,
  championName: string,
  challengerName: string,
  judgmentSummaries: string[]
): string {
  return `## Verdict
${verdict}

## Champion
${championName}

## Challenger
${challengerName}

## Individual Judge Assessments
${judgmentSummaries.map((s, i) => `### Judge ${i + 1}\n${s}`).join('\n\n')}`;
}
```

## Code Changes

### `executor.ts` — after `aggregateJudgments()`

Insert the verdict synthesis call between aggregating judgments and writing the battle completion batch. This is a single Haiku call (~200ms), so the overhead is minimal.

```typescript
// After line 157: const { verdict, championScore, challengerScore } = aggregateJudgments(allJudgments);

// Generate verdict synthesis
let verdictSummary: string | null = null;
try {
  const judgmentSummaries = allJudgments.map(j =>
    `Winner: ${j.winner} | Confidence: ${j.confidence}% | Scores: champion=${j.scores.champion.total}, challenger=${j.scores.challenger.total}\nReasoning: ${j.reasoning}`
  );

  const synthPrompt = verdictSynthesisPrompt(rubric);
  const synthUser = verdictSynthesisUserPrompt(
    verdict,
    battle.championSkillName ?? "Champion",  // need to fetch this
    challengerName ?? "Challenger",
    judgmentSummaries
  );

  const { text: synthText } = await callLlm({
    db,
    model: "claude-haiku-4-5-20251001",
    system: synthPrompt.system,
    prompt: synthUser,
    maxTokens: 1024,
    callType: "verdict_synthesis",
    battleId,
  });

  verdictSummary = synthText;
} catch (err) {
  console.error(`[arena] Verdict synthesis failed for battle ${battleId}:`, err);
  // Non-fatal — battle result is still valid without synthesis
}
```

Then include `verdictSummary` in the battle completion batch:

```typescript
// In the db.batch() call, update the battles.set() to include:
verdictSummary,
```

### Fetching champion/challenger names for synthesis

The executor already has access to the battle record but doesn't join skill name. Two options:

**Option A (simpler):** Fetch champion skill name in the initial battle query:
```typescript
// Around line 34-46, add a join or separate query for skills.name
const [championSkill] = await db.select({ name: skills.name })
  .from(skills).where(eq(skills.id, battle.championSkillId));
```

**Option B:** Use the candidate's extracted purpose as the challenger name (already available).

Go with Option A since it's a single query addition.

### `battle-queries.ts` — expose `verdictSummary`

Add `verdictSummary` to the battle select in `getBattleDetail()`:

```typescript
// Line 26, add:
verdictSummary: battles.verdictSummary,
```

## Verification

1. Execute a battle after Phase 1 changes are in place
2. Check the `battles` row — `verdict_summary` should contain 2-3 paragraphs
3. Check `arenaLlmCalls` for a `verdict_synthesis` entry
4. The summary should reference specific dimension names from the rubric
