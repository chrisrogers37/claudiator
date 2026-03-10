import Anthropic from "@anthropic-ai/sdk";
import type { Db } from "@claudiator/db/client";
import { battleScenarios, battles, intakeCandidates } from "@claudiator/db/schema";
import { eq } from "drizzle-orm";
import { scenarioGenerationPrompt } from "./prompts";

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

  const anthropic = new Anthropic();
  const prompt = scenarioGenerationPrompt(
    candidate.extractedPurpose || "unknown",
    candidate.category || "workflow"
  );

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

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
