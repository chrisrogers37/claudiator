// Centralized LLM prompt templates for the Arena system

interface CategoryInfo {
  slug: string;
  domain: string;
  function: string;
  description: string | null;
  skillCount: number;
  exampleSkills: string[];
}

export function categoryCouncilPrompt(
  rawContent: string,
  existingCategories: CategoryInfo[]
): { system: string; user: string } {
  const categoryList = existingCategories
    .sort((a, b) => b.skillCount - a.skillCount)
    .map(
      (c) =>
        `  - ${c.slug} (${c.domain}/${c.function}): ${c.description ?? "No description"} [${c.skillCount} skill${c.skillCount !== 1 ? "s" : ""}${c.exampleSkills.length > 0 ? `, e.g. ${c.exampleSkills.join(", ")}` : ""}]`
    )
    .join("\n");

  return {
    system: `You are a skill taxonomy classifier for Claudiator, a Claude Code skills arena. Skills are categorized with a two-level taxonomy: DOMAIN (what platform or area, e.g. "railway", "neon", "git") and FUNCTION (what it does, e.g. "deploy", "query", "commit").

Your job: classify a new skill into the most appropriate EXISTING category, or suggest a new one ONLY if no existing category fits.

BIAS TOWARD EXISTING CATEGORIES. Ask yourself: "Would a user looking for this skill's functionality also consider the skills already in category X?" If yes, it belongs in that category.

Only suggest a new category when the skill serves a genuinely different purpose that no existing category covers. Two skills that accomplish the same goal in slightly different ways belong in the SAME category — that is what makes battles meaningful.

Existing categories:
${categoryList || "  (none yet)"}

Output ONLY valid JSON:
{
  "categorySlug": "slug of best matching existing category, or null if genuinely new",
  "suggestedDomain": "domain string (use existing domain if joining, or new if creating)",
  "suggestedFunction": "function string (use existing function if joining, or new if creating)",
  "purpose": "1-2 sentence description of what this skill does",
  "reasoning": "Why this category fits (or why no existing category fits)"
}`,
    user: `Classify this skill:\n\n${rawContent.slice(0, 15_000)}`,
  };
}

export function categorizationPrompt(rawContent: string): {
  system: string;
  user: string;
} {
  return {
    system: `You are an AI skill analyst for Claudiator, a Claude Code skills platform. Your job is to analyze skill content and determine its purpose and category.

Categories:
- deployment: Skills for deploying applications (Railway, Vercel, Modal, etc.)
- database: Skills for database operations (Neon, Snowflake, dbt, etc.)
- code-review: Skills for reviewing code, PRs, security
- planning: Skills for planning, documentation, brainstorming
- design: Skills for design review, performance audits
- workflow: Skills for development workflow (commits, context-resume, session-handoff, etc.)
- utilities: General utility skills
- configuration: Configuration management skills

Output ONLY valid JSON:
{
  "purpose": "1-2 sentence description of what this skill does",
  "category": "one of the categories above",
  "matchesExisting": "slug of an existing skill this competes with, or null"
}`,
    user: `Analyze this skill content:\n\n${rawContent.slice(0, 15_000)}`,
  };
}

export function fightScoringPrompt(
  candidatePurpose: string,
  candidateContent: string,
  championContent: string
): { system: string; user: string } {
  return {
    system: `You are a fight-worthiness evaluator for Claudiator's arena system. You score how likely a challenger skill is to beat or offer meaningful improvements over the reigning champion.

Score from 0-100:
- 0-20: Clearly inferior, no meaningful improvements
- 21-40: Some differences but champion is clearly better
- 41-60: Roughly equal, some areas of improvement
- 61-80: Strong challenger with meaningful innovations
- 81-100: Exceptional challenger likely to win

Output ONLY valid JSON:
{
  "score": <number 0-100>,
  "reasoning": "Brief explanation of strengths/weaknesses vs champion",
  "keyDifferences": ["difference1", "difference2"]
}`,
    user: `## Challenger Purpose
${candidatePurpose}

## Challenger Content
${candidateContent.slice(0, 10_000)}

## Champion Content (current best)
${championContent.slice(0, 10_000)}`,
  };
}

export function scenarioGenerationPrompt(
  skillPurpose: string,
  category: string
): { system: string; user: string } {
  return {
    system: `You are a scenario designer for Claudiator's battle arena. Generate realistic test scenarios for evaluating Claude Code skills.

CRITICAL RULES:
- Every scenario MUST test the skill's PRIMARY function as described in the purpose
- Do NOT generate scenarios that test tangential or inverse operations (e.g. if the skill creates handoff files, don't test reading/resuming from handoff files)
- Each scenario starts from a CLEAN state — no pre-existing artifacts from the skill
- The project context describes the codebase state, NOT prior skill outputs
- The user prompt should trigger the skill's core functionality
- Vary complexity through project size and context, not by changing what the skill does
- The project context must describe a PLAUSIBLE SYSTEM that the skill will act on — realistic code, git state, active work. The skill's job is to PRODUCE its outputs given this system. NEVER pre-populate the project context with files or artifacts that the skill itself is expected to create. For example: if the skill creates HANDOFF.md, the project context must NOT mention any existing handoff files.

PROJECT CONTEXT MUST BE RICH AND DETAILED — simulate a real working session:
- Include a realistic file tree (5-15 files) with paths
- Include current git state (branch name, recent commits, staged/unstaged changes)
- Include specific technical details: framework versions, package names, key dependencies
- Include what the developer was actively working on and specific code changes in progress
- For medium/hard: include open PRs, failing tests, architectural decisions being weighed, debugging context
- For hard: include multi-session context like team discussions, deployment concerns, known tech debt
- Make it feel like a snapshot of a real developer's terminal and IDE state

Each scenario should include:
- A description of the test situation
- Project context (DETAILED: file tree, git state, code state, active work — NO pre-existing skill artifacts)
- A user prompt (what the user would say to trigger the skill's primary function)
- A difficulty level

Output ONLY valid JSON array:
[
  {
    "description": "What this scenario tests",
    "projectContext": "Detailed project state including file tree, git state, active work, etc.",
    "userPrompt": "What the user would type",
    "difficulty": "easy" | "medium" | "hard"
  }
]

Generate exactly 3 scenarios: 1 easy, 1 medium, 1 hard.`,
    user: `Generate battle scenarios for a skill with this purpose: "${skillPurpose}" in the "${category}" category.

Remember: ALL 3 scenarios must test this exact purpose. Do not test the inverse operation or related-but-different functionality. Make project contexts detailed and realistic — a real snapshot of a developer's working state.`,
  };
}

export function skillExecutionPrompt(
  skillContent: string,
  scenario: { projectContext: string; userPrompt: string }
): { system: string; user: string } {
  return {
    system: `You are Claude Code executing a skill in an isolated arena evaluation. The skill instructions are provided below. Follow them exactly to respond to the user's request.

## Skill Instructions
${skillContent.slice(0, 20_000)}

## Arena Evaluation Rules
- You are in a CLEAN, ISOLATED environment with NO prior session state
- There are NO existing handoff files, session files, or artifacts from previous sessions
- Do NOT hallucinate or fabricate the existence of files, prior sessions, or prior outputs
- If the skill requires reading files that do not exist in this scenario, state that clearly rather than inventing content
- Only demonstrate what the skill would PRODUCE or CREATE given the scenario
- Show the actual output/artifacts the skill would generate
- Be thorough but concise`,
    user: `## Project Context
${scenario.projectContext}

## User Request
${scenario.userPrompt}`,
  };
}

export function judgingPrompt(): string {
  return `You are a judge in Claudiator's battle arena. You evaluate two skill outputs for the same scenario and determine which one is better.

Score each output on 4 dimensions (0-25 each, total 0-100):
- accuracy: Correctness and relevance of the response
- completeness: How thoroughly the scenario is addressed
- style: Quality of formatting, communication, and user experience
- efficiency: Conciseness, avoiding unnecessary steps

Output ONLY valid JSON:
{
  "winner": "champion" | "challenger" | "draw",
  "scores": {
    "champion": { "accuracy": <0-25>, "completeness": <0-25>, "style": <0-25>, "efficiency": <0-25>, "total": <0-100> },
    "challenger": { "accuracy": <0-25>, "completeness": <0-25>, "style": <0-25>, "efficiency": <0-25>, "total": <0-100> }
  },
  "reasoning": "Brief explanation of why you chose the winner",
  "confidence": <0-100>
}`;
}

export function judgingUserPrompt(
  scenario: { description: string; projectContext: string; userPrompt: string },
  championOutput: string,
  challengerOutput: string
): string {
  return `## Scenario
${scenario.description}

## Project Context
${scenario.projectContext}

## User Request
${scenario.userPrompt}

## Champion Output
${championOutput.slice(0, 8_000)}

## Challenger Output
${challengerOutput.slice(0, 8_000)}`;
}

export function evolutionPrompt(
  championContent: string,
  challengerContent: string,
  battleResults: string
): { system: string; user: string } {
  return {
    system: `You are a skill evolution engine for Claudiator. After a close battle, you analyze both skills and create an evolved version that combines the best techniques from both.

The evolved skill should:
1. Start with the winner's structure as the base
2. Incorporate the strongest techniques from the loser
3. Fix any weaknesses identified during the battle
4. Maintain the same format (SKILL.md with YAML frontmatter)

Output the complete evolved SKILL.md content, ready to be used as a new version.`,
    user: `## Champion Skill (winner)
${championContent.slice(0, 15_000)}

## Challenger Skill (close loser)
${challengerContent.slice(0, 15_000)}

## Battle Results
${battleResults}

Create an evolved version that combines the best of both skills.`,
  };
}
