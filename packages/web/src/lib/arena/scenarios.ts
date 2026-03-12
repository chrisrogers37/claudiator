import type { Db } from "@claudiator/db/client";
import { battleScenarios, battles, intakeCandidates } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { scenarioGenerationPrompt } from "./prompts";
import { callLlm } from "./llm";
import { emitPipelineEvent } from "./pipeline-events";

interface GeneratedScenario {
  description: string;
  projectContext: string;
  userPrompt: string;
  difficulty: "easy" | "medium" | "hard";
}

export async function generateScenarios(
  db: Db,
  battleId: string
): Promise<string[]> {
  const [battle] = await db
    .select()
    .from(battles)
    .where(eq(battles.id, battleId));

  if (!battle) throw new Error(`Battle ${battleId} not found`);

  const [candidate] = await db
    .select()
    .from(intakeCandidates)
    .where(eq(intakeCandidates.id, battle.challengerId));

  if (!candidate) throw new Error(`Candidate ${battle.challengerId} not found`);

  await emitPipelineEvent(db, "battle", battleId, "generating_scenarios");

  const prompt = scenarioGenerationPrompt(
    candidate.extractedPurpose || "unknown",
    candidate.category || "workflow"
  );

  const { text } = await callLlm({
    db,
    model: "claude-haiku-4-5-20251001",
    system: prompt.system,
    prompt: prompt.user,
    maxTokens: 8192,
    callType: "scenario_gen",
    battleId,
  });

  let scenarios: GeneratedScenario[];
  try {
    scenarios = JSON.parse(text);
  } catch {
    console.error(`[arena] Failed to parse scenarios for battle ${battleId}:`, text.slice(0, 200));
    throw new Error("Failed to generate scenarios");
  }

  const scenarioIds: string[] = [];
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i];
    const [inserted] = await db
      .insert(battleScenarios)
      .values({
        battleId,
        scenarioIndex: i,
        description: s.description,
        projectContext: s.projectContext,
        userPrompt: s.userPrompt,
        difficulty: s.difficulty,
      })
      .returning({ id: battleScenarios.id });
    scenarioIds.push(inserted.id);
  }

  console.log(`[arena] Generated ${scenarios.length} scenarios for battle ${battleId}`);
  return scenarioIds;
}
