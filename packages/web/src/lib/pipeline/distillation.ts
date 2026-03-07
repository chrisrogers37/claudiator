import Anthropic from "@anthropic-ai/sdk";
import type { Db } from "@claudefather/db/client";
import { learnings, learningSkillLinks } from "@claudefather/db/schema";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";

interface DistillationInput {
  sourceConfigId: string;
  name: string;
  url: string;
  sourceType: string;
  content: string;
  previousContent: string | null;
}

interface DistillationResult {
  relevance: "high" | "medium" | "low" | "none";
  title: string;
  summary: string;
  relevance_tags: string[];
  affected_skills: {
    skill_slug: string;
    proposed_change: string;
  }[];
}

export async function triggerDistillation(
  db: Db,
  input: DistillationInput,
  anthropic: Anthropic
): Promise<void> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildUserPrompt(input, input.content, input.previousContent),
      },
    ],
  });

  const resultText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let result: DistillationResult;
  try {
    result = JSON.parse(resultText);
  } catch {
    console.error(
      `[pipeline] Failed to parse distillation result for ${input.name}:`,
      resultText.slice(0, 200)
    );
    return;
  }

  if (result.relevance === "none") return;

  // Map pipeline source types to learnings source types
  const sourceTypeMap: Record<string, string> = {
    anthropic_docs: "docs",
    anthropic_blog: "blog",
    changelog: "changelog",
    github_repo: "community",
    mcp_registry: "community",
  };

  // Store learning
  const [learning] = await db
    .insert(learnings)
    .values({
      title: result.title,
      summary: result.summary,
      sourceUrl: input.url,
      sourceType: (sourceTypeMap[input.sourceType] || "community") as
        | "docs"
        | "blog"
        | "changelog"
        | "community",
      relevanceTags: result.relevance_tags || [],
      status: "new",
    })
    .returning({ id: learnings.id });

  // Batch insert proposed skill changes
  const skillChanges = result.affected_skills || [];
  if (skillChanges.length > 0) {
    await db
      .insert(learningSkillLinks)
      .values(
        skillChanges.map((sc) => ({
          learningId: learning.id,
          skillSlug: sc.skill_slug,
          proposedChange: sc.proposed_change,
        }))
      )
      .onConflictDoNothing();
  }

  console.log(
    `[pipeline] Created learning "${result.title}" (${result.relevance}) from ${input.name}`
  );
}
