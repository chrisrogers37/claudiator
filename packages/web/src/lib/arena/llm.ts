import Anthropic from "@anthropic-ai/sdk";
import type { Db } from "@claudiator/db/client";
import { arenaLlmCalls } from "@claudiator/db/schema";
import { calculateCostCents } from "./costs";

export type ArenaLlmCallType =
  | "categorize"
  | "fight_score"
  | "scenario_gen"
  | "skill_exec_champion"
  | "skill_exec_challenger"
  | "judge"
  | "evolve";

interface CallLlmOptions {
  db: Db;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  callType: ArenaLlmCallType;
  battleId?: string;
  candidateId?: string;
  parentEntityId?: string;
  parentEntityType?: "battle_round" | "battle_scenario" | "battle_judgment" | "intake_candidate";
}

interface CallLlmResult {
  text: string;
  usage: { input: number; output: number };
  latencyMs: number;
}

const anthropic = new Anthropic();

export async function callLlm(options: CallLlmOptions): Promise<CallLlmResult> {
  const {
    db,
    model,
    system,
    prompt,
    maxTokens,
    callType,
    battleId,
    candidateId,
    parentEntityId,
    parentEntityType,
  } = options;

  const start = Date.now();

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    });

    const latencyMs = Date.now() - start;
    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Strip markdown code fences that models sometimes wrap JSON in
    const text = rawText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const totalTokens = inputTokens + outputTokens;
    const costCents = calculateCostCents(model, inputTokens, outputTokens);

    await db.insert(arenaLlmCalls).values({
      battleId: battleId ?? null,
      candidateId: candidateId ?? null,
      callType,
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      latencyMs,
      costCents,
      status: "success",
      rawResponse: text,
      parentEntityId: parentEntityId ?? null,
      parentEntityType: parentEntityType ?? null,
    });

    return { text, usage: { input: inputTokens, output: outputTokens }, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const isRateLimited =
      error instanceof Anthropic.RateLimitError;

    await db.insert(arenaLlmCalls).values({
      battleId: battleId ?? null,
      candidateId: candidateId ?? null,
      callType,
      model,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      latencyMs,
      costCents: null,
      status: isRateLimited ? "rate_limited" : "error",
      errorMessage: error instanceof Error ? error.message : String(error),
      rawResponse: null,
      parentEntityId: parentEntityId ?? null,
      parentEntityType: parentEntityType ?? null,
    });

    throw error;
  }
}
