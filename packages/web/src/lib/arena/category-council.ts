import type { Db } from "@claudiator/db/client";
import { skillCategories, skills } from "@claudiator/db/schema";
import { eq, sql } from "drizzle-orm";
import { callLlm } from "./llm";
import { categoryCouncilPrompt } from "./prompts";

const COUNCIL_SIZE = 5;
const MAJORITY_THRESHOLD = 3;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

interface CategoryInfo {
  id: string;
  domain: string;
  function: string;
  slug: string;
  description: string | null;
  skillCount: number;
  exampleSkills: string[];
}

export interface CouncilVote {
  categorySlug: string | null;
  suggestedDomain: string;
  suggestedFunction: string;
  purpose: string;
  reasoning: string;
}

interface CouncilResult {
  categoryId: string;
  isNew: boolean;
  domain: string;
  function: string;
  purpose: string;
  votes: CouncilVote[];
}

async function fetchCategoriesWithExamples(db: Db): Promise<CategoryInfo[]> {
  const categories = await db.select().from(skillCategories);

  const result: CategoryInfo[] = [];
  for (const cat of categories) {
    const examples = await db
      .select({ name: skills.name })
      .from(skills)
      .where(eq(skills.categoryId, cat.id))
      .limit(3);

    result.push({
      id: cat.id,
      domain: cat.domain,
      function: cat.function,
      slug: cat.slug,
      description: cat.description,
      skillCount: cat.skillCount,
      exampleSkills: examples.map((e) => e.name ?? "unnamed"),
    });
  }

  return result;
}

function tallyVotes(votes: CouncilVote[]): {
  winner: "existing" | "new";
  existingSlug: string | null;
  newDomain: string;
  newFunction: string;
  winningPurpose: string;
} {
  const existingVotes = votes.filter((v) => v.categorySlug !== null);
  const newVotes = votes.filter((v) => v.categorySlug === null);

  if (existingVotes.length >= MAJORITY_THRESHOLD) {
    // Count which existing category got the most votes
    const slugCounts = new Map<string, number>();
    for (const v of existingVotes) {
      slugCounts.set(v.categorySlug!, (slugCounts.get(v.categorySlug!) ?? 0) + 1);
    }
    const topSlug = [...slugCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const winnerVote = existingVotes.find((v) => v.categorySlug === topSlug)!;
    return {
      winner: "existing",
      existingSlug: topSlug,
      newDomain: winnerVote.suggestedDomain,
      newFunction: winnerVote.suggestedFunction,
      winningPurpose: winnerVote.purpose,
    };
  }

  // New category — find most common domain+function pair
  const pairCounts = new Map<string, { count: number; domain: string; fn: string; purpose: string }>();
  for (const v of newVotes) {
    const key = `${v.suggestedDomain}/${v.suggestedFunction}`;
    const existing = pairCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      pairCounts.set(key, { count: 1, domain: v.suggestedDomain, fn: v.suggestedFunction, purpose: v.purpose });
    }
  }
  const topPair = [...pairCounts.values()].sort((a, b) => b.count - a.count)[0];

  return {
    winner: "new",
    existingSlug: null,
    newDomain: topPair?.domain ?? newVotes[0]?.suggestedDomain ?? "general",
    newFunction: topPair?.fn ?? newVotes[0]?.suggestedFunction ?? "utility",
    winningPurpose: topPair?.purpose ?? newVotes[0]?.purpose ?? "",
  };
}

export async function categorizeWithCouncil(
  db: Db,
  rawContent: string,
  candidateId?: string
): Promise<CouncilResult> {
  const existingCategories = await fetchCategoriesWithExamples(db);
  const { system, user } = categoryCouncilPrompt(rawContent, existingCategories);

  // Spawn council: 5 parallel Haiku calls
  const councilPromises = Array.from({ length: COUNCIL_SIZE }, () =>
    callLlm({
      db,
      model: HAIKU_MODEL,
      system,
      prompt: user,
      maxTokens: 512,
      callType: "category_council",
      candidateId,
      parentEntityType: "intake_candidate",
      parentEntityId: candidateId,
    })
  );

  const results = await Promise.allSettled(councilPromises);

  // Parse votes
  const votes: CouncilVote[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    try {
      const text = result.value.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;
      const parsed = JSON.parse(jsonMatch[0]) as CouncilVote;
      if (typeof parsed.suggestedDomain === "string" && typeof parsed.suggestedFunction === "string") {
        votes.push(parsed);
      }
    } catch {
      // Malformed response — skip this voter
    }
  }

  // Need at least MAJORITY_THRESHOLD valid votes
  if (votes.length < MAJORITY_THRESHOLD) {
    // Degraded path: use whatever votes we have, or create a general category
    if (votes.length > 0) {
      const best = votes[0];
      const slug = `${best.suggestedDomain}-${best.suggestedFunction}`;
      const category = existingCategories.find((c) => c.slug === (best.categorySlug ?? slug));
      if (category) {
        return { categoryId: category.id, isNew: false, domain: category.domain, function: category.function, purpose: best.purpose, votes };
      }
    }
    // Fallback: create/find a general/utility category
    const fallback = existingCategories.find((c) => c.slug === "general-utility");
    if (fallback) {
      return { categoryId: fallback.id, isNew: false, domain: "general", function: "utility", purpose: "General purpose skill", votes };
    }
    // Last resort: create it
    const [created] = await db
      .insert(skillCategories)
      .values({ domain: "general", function: "utility", slug: "general-utility", description: "General purpose skills" })
      .onConflictDoNothing()
      .returning();
    const id = created?.id ?? (await db.select({ id: skillCategories.id }).from(skillCategories).where(eq(skillCategories.slug, "general-utility")))[0].id;
    return { categoryId: id, isNew: true, domain: "general", function: "utility", purpose: "General purpose skill", votes };
  }

  const tally = tallyVotes(votes);

  if (tally.winner === "existing" && tally.existingSlug) {
    const category = existingCategories.find((c) => c.slug === tally.existingSlug);
    if (category) {
      return { categoryId: category.id, isNew: false, domain: category.domain, function: category.function, purpose: tally.winningPurpose, votes };
    }
  }

  // New category
  const newSlug = `${tally.newDomain}-${tally.newFunction}`;
  const [created] = await db
    .insert(skillCategories)
    .values({
      domain: tally.newDomain,
      function: tally.newFunction,
      slug: newSlug,
      description: `Skills for ${tally.newFunction} in the ${tally.newDomain} domain`,
    })
    .onConflictDoNothing()
    .returning();

  // Handle race: if another request created this category concurrently
  const categoryId = created?.id
    ?? (await db.select({ id: skillCategories.id }).from(skillCategories).where(eq(skillCategories.slug, newSlug)))[0].id;

  return {
    categoryId,
    isNew: !created ? false : true,
    domain: tally.newDomain,
    function: tally.newFunction,
    purpose: tally.winningPurpose,
    votes,
  };
}
