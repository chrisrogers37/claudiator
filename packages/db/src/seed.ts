import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createDb } from "./client.js";
import { eq, sql } from "drizzle-orm";
import { skills, skillVersions, skillCategories } from "./schema.js";

// Category mapping for all 38 skills. Derived from skill-inventory.md research.
const SKILL_CATEGORIES: Record<string, string> = {
  // Deployment & Infrastructure
  "modal-deploy": "deployment",
  "modal-logs": "deployment",
  "modal-status": "deployment",
  "railway-deploy": "deployment",
  "railway-logs": "deployment",
  "railway-status": "deployment",
  "vercel-deploy": "deployment",
  "vercel-logs": "deployment",
  "vercel-status": "deployment",
  // Database & Data
  "neon-branch": "database",
  "neon-info": "database",
  "neon-query": "database",
  "snowflake-query": "database",
  dbt: "database",
  // Code Review & QA
  "review-pr": "code-review",
  "review-changes": "code-review",
  "review-self": "code-review",
  "security-audit": "code-review",
  // Planning & Documentation
  "product-enhance": "planning",
  "product-brainstorm": "planning",
  "implement-plan": "planning",
  "tech-debt": "planning",
  "docs-review": "planning",
  "investigate-app": "planning",
  // Design & Performance
  "design-review": "design",
  "frontend-performance-audit": "design",
  // Development Workflow
  "quick-commit": "workflow",
  "commit-push-pr": "workflow",
  "context-resume": "workflow",
  "session-handoff": "workflow",
  "find-skills": "workflow",
  worktree: "workflow",
  lessons: "workflow",
  "repo-health": "workflow",
  // Utilities
  notes: "utilities",
  notifications: "utilities",
  "claudiator-migrate": "utilities",
  "cache-audit": "utilities",
};

// Granular taxonomy mapping for the skill_categories table.
// Each skill gets a (domain, function) pair that becomes its category row.
const SKILL_TAXONOMY: Record<string, { domain: string; function: string }> = {
  "modal-deploy": { domain: "modal", function: "deploy" },
  "modal-logs": { domain: "modal", function: "logs" },
  "modal-status": { domain: "modal", function: "status" },
  "railway-deploy": { domain: "railway", function: "deploy" },
  "railway-logs": { domain: "railway", function: "logs" },
  "railway-status": { domain: "railway", function: "status" },
  "vercel-deploy": { domain: "vercel", function: "deploy" },
  "vercel-logs": { domain: "vercel", function: "logs" },
  "vercel-status": { domain: "vercel", function: "status" },
  "neon-branch": { domain: "neon", function: "branch" },
  "neon-info": { domain: "neon", function: "info" },
  "neon-query": { domain: "neon", function: "query" },
  "snowflake-query": { domain: "snowflake", function: "query" },
  "dbt": { domain: "dbt", function: "transform" },
  "review-pr": { domain: "code-review", function: "pr" },
  "review-changes": { domain: "code-review", function: "changes" },
  "review-self": { domain: "code-review", function: "self" },
  "security-audit": { domain: "security", function: "audit" },
  "product-enhance": { domain: "product", function: "enhance" },
  "product-brainstorm": { domain: "product", function: "brainstorm" },
  "implement-plan": { domain: "planning", function: "implement" },
  "tech-debt": { domain: "planning", function: "tech-debt" },
  "docs-review": { domain: "docs", function: "review" },
  "investigate-app": { domain: "investigation", function: "app" },
  "design-review": { domain: "design", function: "review" },
  "frontend-performance-audit": { domain: "performance", function: "audit" },
  "quick-commit": { domain: "git", function: "commit" },
  "commit-push-pr": { domain: "git", function: "commit-push-pr" },
  "context-resume": { domain: "workflow", function: "resume" },
  "session-handoff": { domain: "workflow", function: "handoff" },
  "find-skills": { domain: "skills", function: "discovery" },
  "worktree": { domain: "git", function: "worktree" },
  "lessons": { domain: "learning", function: "lessons" },
  "repo-health": { domain: "repo", function: "health" },
  "notes": { domain: "notes", function: "manage" },
  "notifications": { domain: "notifications", function: "manage" },
  "claudiator-migrate": { domain: "claudiator", function: "migrate" },
  "cache-audit": { domain: "cache", function: "audit" },
};

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  // Resolve skills directory relative to repo root
  const repoRoot = resolve(import.meta.dirname, "../../../");
  const skillsDir = join(repoRoot, "global/skills");

  const db = createDb(databaseUrl);
  const dirs = readdirSync(skillsDir).filter((d) => {
    const fullPath = join(skillsDir, d);
    return (
      statSync(fullPath).isDirectory() &&
      d !== "_shared" &&
      existsSync(join(fullPath, "SKILL.md"))
    );
  });

  console.log(`Found ${dirs.length} skills to seed.`);

  for (const slug of dirs) {
    const skillPath = join(skillsDir, slug, "SKILL.md");
    const content = readFileSync(skillPath, "utf-8");
    const frontmatter = parseFrontmatter(content);
    const name = frontmatter.name || slug;
    const description = frontmatter.description || "";
    const isUserInvocable = frontmatter["user-invocable"] !== "false";
    const category = SKILL_CATEGORIES[slug] || "utilities";

    // Read reference files if they exist
    let references: Record<string, string> | null = null;
    const refsDir = join(skillsDir, slug, "references");
    if (existsSync(refsDir) && statSync(refsDir).isDirectory()) {
      references = {};
      for (const refFile of readdirSync(refsDir)) {
        const refPath = join(refsDir, refFile);
        if (statSync(refPath).isFile()) {
          references[`references/${refFile}`] = readFileSync(refPath, "utf-8");
        }
      }
    }

    // Insert skill
    const [skill] = await db
      .insert(skills)
      .values({
        slug,
        name,
        description,
        category: category as typeof skills.$inferInsert.category,
        isUserInvocable,
      })
      .onConflictDoNothing()
      .returning();

    if (!skill) {
      console.log(`  Skipping ${slug} (already exists)`);
      continue;
    }

    // Insert v1.0.0
    await db.insert(skillVersions).values({
      skillId: skill.id,
      version: "1.0.0",
      content,
      references,
      changelog: "Initial import from claudiator git repository.",
      isLatest: true,
    });

    console.log(`  Seeded: ${slug} (${category})`);
  }

  // Also seed the _shared/orchestration-guide.md as a special non-invocable entry
  const sharedPath = join(skillsDir, "_shared/orchestration-guide.md");
  if (existsSync(sharedPath)) {
    const sharedContent = readFileSync(sharedPath, "utf-8");
    const [sharedSkill] = await db
      .insert(skills)
      .values({
        slug: "_shared",
        name: "Shared Orchestration Guide",
        description: "Shared reference for skills that use subagent orchestration. Not a skill.",
        category: "utilities" as const,
        isUserInvocable: false,
      })
      .onConflictDoNothing()
      .returning();

    if (sharedSkill) {
      await db.insert(skillVersions).values({
        skillId: sharedSkill.id,
        version: "1.0.0",
        content: sharedContent,
        changelog: "Initial import of shared orchestration guide.",
        isLatest: true,
      });
      console.log("  Seeded: _shared (orchestration guide)");
    }
  }

  // ─── Phase 2: Seed skill_categories and backfill categoryId ──────────────

  console.log("\nSeeding skill categories...");

  // Collect unique (domain, function) pairs
  const uniqueCategories = new Map<string, { domain: string; function: string }>();
  for (const [, tax] of Object.entries(SKILL_TAXONOMY)) {
    const key = `${tax.domain}-${tax.function}`;
    if (!uniqueCategories.has(key)) {
      uniqueCategories.set(key, tax);
    }
  }

  // Insert categories (idempotent)
  for (const [slug, { domain, function: fn }] of uniqueCategories) {
    await db
      .insert(skillCategories)
      .values({
        domain,
        function: fn,
        slug,
        description: `Skills for ${fn} in the ${domain} domain`,
      })
      .onConflictDoNothing();
  }

  // Fetch all categories for ID lookup
  const allCategories = await db.select().from(skillCategories);
  const categoryBySlug = new Map(allCategories.map((c) => [c.slug, c]));

  console.log(`  Inserted/verified ${uniqueCategories.size} categories.`);

  // Backfill skills.categoryId
  let backfilled = 0;
  for (const [skillSlug, tax] of Object.entries(SKILL_TAXONOMY)) {
    const catSlug = `${tax.domain}-${tax.function}`;
    const cat = categoryBySlug.get(catSlug);
    if (cat) {
      await db
        .update(skills)
        .set({ categoryId: cat.id })
        .where(eq(skills.slug, skillSlug));
      backfilled++;
    }
  }

  console.log(`  Backfilled categoryId on ${backfilled} skills.`);

  // Update skill counts per category
  for (const cat of allCategories) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(skills)
      .where(eq(skills.categoryId, cat.id));
    await db
      .update(skillCategories)
      .set({ skillCount: count })
      .where(eq(skillCategories.id, cat.id));
  }

  console.log("  Updated skill counts on all categories.");

  console.log(`\nSeed complete. ${dirs.length} skills + _shared imported as v1.0.0.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
