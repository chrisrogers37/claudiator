import type { Db } from "@claudiator/db/client";
import { intakeCandidates, skills, skillVersions } from "@claudiator/db/schema";
import { eq, and } from "drizzle-orm";
import { categorizationPrompt, fightScoringPrompt } from "./prompts";
import { callLlm } from "./llm";
import { emitPipelineEvent } from "./pipeline-events";

export async function categorizeCandidate(
  db: Db,
  candidateId: string
): Promise<void> {
  const [candidate] = await db
    .select()
    .from(intakeCandidates)
    .where(eq(intakeCandidates.id, candidateId));

  if (!candidate) throw new Error(`Candidate ${candidateId} not found`);

  await emitPipelineEvent(db, "candidate", candidateId, "categorizing");

  const prompt = categorizationPrompt(candidate.rawContent);

  const { text } = await callLlm({
    db,
    model: "claude-haiku-4-5-20251001",
    system: prompt.system,
    prompt: prompt.user,
    maxTokens: 1024,
    callType: "categorize",
    candidateId,
    parentEntityId: candidateId,
    parentEntityType: "intake_candidate",
  });

  let result: { purpose: string; category: string; matchesExisting: string | null };
  try {
    result = JSON.parse(text);
  } catch {
    console.error(`[arena] Failed to parse categorization for ${candidateId}:`, text.slice(0, 200));
    return;
  }

  // Find matching champion skill if specified
  let matchedSkillId: string | null = null;
  if (result.matchesExisting) {
    const [matched] = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.slug, result.matchesExisting));
    matchedSkillId = matched?.id ?? null;
  }

  await db
    .update(intakeCandidates)
    .set({
      extractedPurpose: result.purpose,
      category: result.category,
      matchedChampionSkillId: matchedSkillId,
      status: "categorized",
      updatedAt: new Date(),
    })
    .where(eq(intakeCandidates.id, candidateId));

  await emitPipelineEvent(db, "candidate", candidateId, "categorized", {
    category: result.category,
    matchedChampion: result.matchesExisting,
  });

  console.log(`[arena] Categorized ${candidateId}: ${result.category} — "${result.purpose}"`);
}

export async function scoreFightWorthiness(
  db: Db,
  candidateId: string
): Promise<void> {
  const [candidate] = await db
    .select()
    .from(intakeCandidates)
    .where(eq(intakeCandidates.id, candidateId));

  if (!candidate) throw new Error(`Candidate ${candidateId} not found`);
  if (!candidate.matchedChampionSkillId) {
    // No champion to fight — auto-score high (new category)
    await db
      .update(intakeCandidates)
      .set({ fightScore: 80, status: "scored", updatedAt: new Date() })
      .where(eq(intakeCandidates.id, candidateId));
    return;
  }

  // Get champion's latest version content
  const [championVersion] = await db
    .select({ content: skillVersions.content })
    .from(skillVersions)
    .where(
      and(
        eq(skillVersions.skillId, candidate.matchedChampionSkillId),
        eq(skillVersions.isLatest, true)
      )
    );

  if (!championVersion) {
    await db
      .update(intakeCandidates)
      .set({ fightScore: 70, status: "scored", updatedAt: new Date() })
      .where(eq(intakeCandidates.id, candidateId));
    return;
  }

  await emitPipelineEvent(db, "candidate", candidateId, "scoring");

  const prompt = fightScoringPrompt(
    candidate.extractedPurpose || "",
    candidate.rawContent,
    championVersion.content
  );

  const { text } = await callLlm({
    db,
    model: "claude-haiku-4-5-20251001",
    system: prompt.system,
    prompt: prompt.user,
    maxTokens: 1024,
    callType: "fight_score",
    candidateId,
    parentEntityId: candidateId,
    parentEntityType: "intake_candidate",
  });

  let result: { score: number; reasoning: string; keyDifferences: string[] };
  try {
    result = JSON.parse(text);
  } catch {
    console.error(`[arena] Failed to parse fight score for ${candidateId}:`, text.slice(0, 200));
    return;
  }

  await db
    .update(intakeCandidates)
    .set({
      fightScore: Math.max(0, Math.min(100, result.score)),
      status: "scored",
      metadata: {
        ...(candidate.metadata as Record<string, unknown>),
        fightReasoning: result.reasoning,
        keyDifferences: result.keyDifferences,
      },
      updatedAt: new Date(),
    })
    .where(eq(intakeCandidates.id, candidateId));

  await emitPipelineEvent(db, "candidate", candidateId, "scored", {
    fightScore: result.score,
  });

  console.log(`[arena] Scored ${candidateId}: ${result.score}/100`);
}

export async function deduplicateCandidate(
  db: Db,
  sourceUrl: string
): Promise<boolean> {
  const [existing] = await db
    .select({ id: intakeCandidates.id })
    .from(intakeCandidates)
    .where(eq(intakeCandidates.sourceUrl, sourceUrl))
    .limit(1);

  return !!existing;
}
