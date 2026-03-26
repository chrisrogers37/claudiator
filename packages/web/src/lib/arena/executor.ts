import type { Db } from "@claudiator/db/client";
import {
  battles,
  battleScenarios,
  battleRounds,
  intakeCandidates,
  skillVersions,
  arenaLlmCalls,
} from "@claudiator/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { generateScenarios } from "./scenarios";
import { judgeRound, aggregateJudgments } from "./judges";
import { updateRankings } from "./rankings";
import { callLlm } from "./llm";
import { emitPipelineEvent } from "./pipeline-events";
import { skillExecutionPrompt } from "./prompts";

export async function executeBattle(db: Db, battleId: string): Promise<void> {
  // Atomic CAS: only claim the battle if it's still pending
  const [claimed] = await db
    .update(battles)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(battles.id, battleId), eq(battles.status, "pending")))
    .returning({ id: battles.id });

  if (!claimed) {
    console.log(`[arena] Battle ${battleId} already claimed or not found, skipping`);
    return;
  }

  await emitPipelineEvent(db, "battle", battleId, "creating_battle");

  try {
    const [battle] = await db
      .select()
      .from(battles)
      .where(eq(battles.id, battleId));

    if (!battle) throw new Error(`Battle ${battleId} not found`);

    // Get champion and challenger content
    const [championVersion] = await db
      .select({ content: skillVersions.content })
      .from(skillVersions)
      .where(eq(skillVersions.id, battle.championVersionId));

    const [candidate] = await db
      .select({ rawContent: intakeCandidates.rawContent })
      .from(intakeCandidates)
      .where(eq(intakeCandidates.id, battle.challengerId));

    if (!championVersion || !candidate) {
      throw new Error("Missing champion version or candidate content");
    }

    // Step 1: Generate scenarios
    const scenarioIds = await generateScenarios(db, battleId);

    // Load scenario records
    const scenarios = await db
      .select()
      .from(battleScenarios)
      .where(eq(battleScenarios.battleId, battleId));

    const config = battle.config as {
      scenarioCount: number;
      roundsPerScenario: number;
      judgeCount: number;
      winThreshold: number;
    };

    const allJudgments: Awaited<ReturnType<typeof judgeRound>>[] = [];

    await emitPipelineEvent(db, "battle", battleId, "executing_rounds");

    // Step 2: Execute rounds for each scenario
    for (const scenario of scenarios) {
      for (let round = 0; round < config.roundsPerScenario; round++) {
        const championPrompt = skillExecutionPrompt(championVersion.content, {
          projectContext: scenario.projectContext,
          userPrompt: scenario.userPrompt,
        });
        const challengerPrompt = skillExecutionPrompt(candidate.rawContent, {
          projectContext: scenario.projectContext,
          userPrompt: scenario.userPrompt,
        });

        const championModel = "claude-sonnet-4-20250514";
        const challengerModel = "claude-sonnet-4-20250514";

        // Execute both skills in parallel
        const [championResult, challengerResult] = await Promise.all([
          callLlm({
            db,
            model: championModel,
            system: championPrompt.system,
            prompt: championPrompt.user,
            maxTokens: 4096,
            callType: "skill_exec_champion",
            battleId,
          }),
          callLlm({
            db,
            model: challengerModel,
            system: challengerPrompt.system,
            prompt: challengerPrompt.user,
            maxTokens: 4096,
            callType: "skill_exec_challenger",
            battleId,
          }),
        ]);

        // Store round with extended metrics
        const [roundRecord] = await db
          .insert(battleRounds)
          .values({
            battleId,
            scenarioId: scenario.id,
            roundIndex: round,
            championOutput: championResult.text,
            challengerOutput: challengerResult.text,
            championTokens: championResult.usage.output,
            challengerTokens: challengerResult.usage.output,
            championInputTokens: championResult.usage.input,
            challengerInputTokens: challengerResult.usage.input,
            championModel,
            challengerModel,
            championLatencyMs: championResult.latencyMs,
            challengerLatencyMs: challengerResult.latencyMs,
          })
          .returning({ id: battleRounds.id });

        // Step 3: Judge the round with judges in parallel
        await emitPipelineEvent(db, "battle", battleId, "judging");

        await db
          .update(battles)
          .set({ status: "judging" })
          .where(eq(battles.id, battleId));

        const judgePromises = Array.from({ length: config.judgeCount }, (_, i) =>
          judgeRound(db, roundRecord.id, i, {
            description: scenario.description,
            projectContext: scenario.projectContext,
            userPrompt: scenario.userPrompt,
          }, championResult.text, challengerResult.text, battleId)
        );

        const roundJudgments = await Promise.all(judgePromises);
        allJudgments.push(...roundJudgments);
      }
    }

    await emitPipelineEvent(db, "battle", battleId, "aggregating");

    // Step 4: Aggregate and determine verdict
    const { verdict, championScore, challengerScore } = aggregateJudgments(allJudgments);

    // Aggregate LLM usage for this battle
    const [llmAggregates] = await db
      .select({
        totalCalls: sql<number>`count(*)::int`,
        totalInput: sql<number>`coalesce(sum(${arenaLlmCalls.inputTokens}), 0)::int`,
        totalOutput: sql<number>`coalesce(sum(${arenaLlmCalls.outputTokens}), 0)::int`,
        totalCost: sql<number>`coalesce(sum(${arenaLlmCalls.costCents}), 0)`,
        totalLatency: sql<number>`coalesce(sum(${arenaLlmCalls.latencyMs}), 0)::int`,
      })
      .from(arenaLlmCalls)
      .where(eq(arenaLlmCalls.battleId, battleId));

    // Atomically: update battle verdict + candidate status (neon-http batch)
    const candidateStatus = verdict === "challenger_wins" ? "promoted" : "rejected";
    await db.batch([
      db.update(battles)
        .set({
          status: "complete",
          verdict,
          championScore,
          challengerScore,
          totalLlmCalls: llmAggregates?.totalCalls ?? null,
          totalInputTokens: llmAggregates?.totalInput ?? null,
          totalOutputTokens: llmAggregates?.totalOutput ?? null,
          totalCostCents: llmAggregates?.totalCost ?? null,
          totalLatencyMs: llmAggregates?.totalLatency ?? null,
          completedAt: new Date(),
        })
        .where(eq(battles.id, battleId)),
      db.update(intakeCandidates)
        .set({ status: candidateStatus as "promoted" | "rejected", updatedAt: new Date() })
        .where(eq(intakeCandidates.id, battle.challengerId)),
    ]);

    // Update rankings (separate from completion transaction — if this fails,
    // battle and candidate are in correct states, just ELO is stale)
    await updateRankings(db, battle.championSkillId, verdict, battleId);

    await emitPipelineEvent(db, "battle", battleId, "complete", {
      verdict,
      championScore,
      challengerScore,
      totalLlmCalls: llmAggregates?.totalCalls,
      totalCostCents: llmAggregates?.totalCost,
    });

    console.log(
      `[arena] Battle ${battleId} complete: ${verdict} (champion: ${championScore.toFixed(1)}, challenger: ${challengerScore.toFixed(1)})`
    );
  } catch (error) {
    await db
      .update(battles)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(battles.id, battleId));

    await emitPipelineEvent(db, "battle", battleId, "failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    console.error(`[arena] Battle ${battleId} failed:`, error);
    throw error;
  }
}
