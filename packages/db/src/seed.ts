import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createDb } from "./client.js";
import { skills, skillVersions } from "./schema.js";

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
  "claudefather-migrate": "utilities",
  "cache-audit": "utilities",
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
      changelog: "Initial import from claudefather git repository.",
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

  console.log(`\nSeed complete. ${dirs.length} skills + _shared imported as v1.0.0.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
