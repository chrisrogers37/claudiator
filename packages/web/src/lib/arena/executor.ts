import Anthropic from "@anthropic-ai/sdk";
import type { Db } from "@claudiator/db/client";
import {
  battles,
  battleScenarios,
  battleRounds,
  intakeCandidates,
  skillVersions,
} from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { generateScenarios } from "./scenarios";
import { judgeRound, aggregateJudgments } from "./judges";
import { updateRankings } from "./rankings";
import { skillExecutionPrompt } from "./prompts";

export async function executeBattle(db: Db, battleId: string): Promise<void> {
  // Mark battle as running
  await db
    .update(battles)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(battles.id, battleId));

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

    const anthropic = new Anthropic();
    const config = battle.config as {
      scenarioCount: number;
      roundsPerScenario: number;
      judgeCount: number;
      winThreshold: number;
    };

    const allJudgments: Awaited<ReturnType<typeof judgeRound>>[] = [];

    // Step 2: Execute rounds for each scenario
    for (const scenario of scenarios) {
      for (let round = 0; round < config.roundsPerScenario; round++) {
        // Execute both skills in parallel
        const championPrompt = skillExecutionPrompt(championVersion.content, {
          projectContext: scenario.projectContext,
          userPrompt: scenario.userPrompt,
        });
        const challengerPrompt = skillExecutionPrompt(candidate.rawContent, {
          projectContext: scenario.projectContext,
          userPrompt: scenario.userPrompt,
        });

        const [championResponse, challengerResponse] = await Promise.all([
          anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: championPrompt.system,
            messages: [{ role: "user", content: championPrompt.user }],
          }),
          anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: challengerPrompt.system,
            messages: [{ role: "user", content: challengerPrompt.user }],
          }),
        ]);

        const championOutput = championResponse.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        const challengerOutput = challengerResponse.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");

        // Store round
        const [roundRecord] = await db
          .insert(battleRounds)
          .values({
            battleId,
            scenarioId: scenario.id,
            roundIndex: round,
            championOutput,
            challengerOutput,
            championTokens: championResponse.usage?.output_tokens ?? null,
            challengerTokens: challengerResponse.usage?.output_tokens ?? null,
          })
          .returning({ id: battleRounds.id });

        // Step 3: Judge the round with 5 judges in parallel
        await db
          .update(battles)
          .set({ status: "judging" })
          .where(eq(battles.id, battleId));

        const judgePromises = Array.from({ length: config.judgeCount }, (_, i) =>
          judgeRound(db, roundRecord.id, i, {
            description: scenario.description,
            projectContext: scenario.projectContext,
            userPrompt: scenario.userPrompt,
          }, championOutput, challengerOutput)
        );

        const roundJudgments = await Promise.all(judgePromises);
        allJudgments.push(...roundJudgments);
      }
    }

    // Step 4: Aggregate and determine verdict
    const { verdict, championScore, challengerScore } = aggregateJudgments(allJudgments);

    await db
      .update(battles)
      .set({
        status: "complete",
        verdict,
        championScore,
        challengerScore,
        completedAt: new Date(),
      })
      .where(eq(battles.id, battleId));

    // Update candidate status
    const candidateStatus = verdict === "challenger_wins" ? "promoted" : "rejected";
    await db
      .update(intakeCandidates)
      .set({ status: candidateStatus as "promoted" | "rejected", updatedAt: new Date() })
      .where(eq(intakeCandidates.id, battle.challengerId));

    // Update rankings
    await updateRankings(db, battle.championSkillId, verdict);

    console.log(
      `[arena] Battle ${battleId} complete: ${verdict} (champion: ${championScore.toFixed(1)}, challenger: ${challengerScore.toFixed(1)})`
    );
  } catch (error) {
    await db
      .update(battles)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(battles.id, battleId));
    console.error(`[arena] Battle ${battleId} failed:`, error);
    throw error;
  }
}
