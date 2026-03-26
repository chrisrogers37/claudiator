import Anthropic from "@anthropic-ai/sdk";
import type { Db } from "@claudiator/db/client";
import {
  learnings,
  learningSkillLinks,
  skills,
  sourceSnapshots,
} from "@claudiator/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { buildSystemPrompt, buildUserPrompt } from "./prompt";

interface DistillationInput {
  sourceConfigId: string;
  name: string;
  url: string;
  sourceType: string;
  content: string;
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
  input: DistillationInput
): Promise<void> {
  // Get previous snapshot for diff context
  const prevSnapshots = await db
    .select({ rawContent: sourceSnapshots.rawContent })
    .from(sourceSnapshots)
    .where(eq(sourceSnapshots.sourceConfigId, input.sourceConfigId))
    .orderBy(desc(sourceSnapshots.fetchedAt))
    .offset(1)
    .limit(1);

  const previousContent = prevSnapshots[0]?.rawContent || null;

  const anthropic = new Anthropic();

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    system: buildSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildUserPrompt(input, input.content, previousContent),
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
      sourceType: (sourceTypeMap[input.sourceType] || "community") as "docs" | "blog" | "changelog" | "community",
      relevanceTags: result.relevance_tags || [],
      status: "new",
    })
    .returning({ id: learnings.id });

  // Resolve skill slugs to IDs
  const affectedSkills = result.affected_skills || [];
  const affectedSlugs = affectedSkills.map((s) => s.skill_slug);
  const slugToId = new Map<string, string>();
  if (affectedSlugs.length > 0) {
    const skillRows = await db
      .select({ id: skills.id, slug: skills.slug })
      .from(skills)
      .where(inArray(skills.slug, affectedSlugs));
    for (const row of skillRows) {
      slugToId.set(row.slug, row.id);
    }
  }

  // Store proposed skill changes
  for (const skillChange of affectedSkills) {
    const skillId = slugToId.get(skillChange.skill_slug);
    if (!skillId) {
      console.warn(
        `[pipeline] Skill slug "${skillChange.skill_slug}" not found, skipping link for learning "${result.title}"`
      );
      continue;
    }
    await db
      .insert(learningSkillLinks)
      .values({
        learningId: learning.id,
        skillId,
        skillSlug: skillChange.skill_slug,
        proposedChange: skillChange.proposed_change,
      })
      .onConflictDoNothing();
  }

  console.log(
    `[pipeline] Created learning "${result.title}" (${result.relevance}) from ${input.name}`
  );
}
