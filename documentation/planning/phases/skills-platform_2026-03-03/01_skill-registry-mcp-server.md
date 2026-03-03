# Phase 01: Skill Registry, MCP Server & Auth Foundation

**PR Title:** feat: add skill registry database, Railway-hosted MCP server, and auth web UI
**Risk Level:** High
**Estimated Effort:** High (~3-4 weeks)
**Files Created:** ~35 (new `packages/` monorepo with `mcp-server/` (Railway), `web/` (Vercel), and `db/` directories)
**Files Modified:** 1 (`CHANGELOG.md`)
**Files Deleted:** 0

---

## Context

Claudefather currently distributes 38 skills to ~20 users via git-clone file-copy sync (`/claudefather-setup` and `/claudefather-sync`). This mechanism has no versioning, no telemetry, no feedback loop, and no centralized registry. The maintainer is flying blind on adoption and quality.

This phase builds the foundational infrastructure that all subsequent phases depend on:
1. A PostgreSQL database (Neon) that serves as the single source of truth for skills, versions, users, and API tokens.
2. A remote MCP server (hosted on Railway, SSE transport) that provides tools for syncing skills, checking updates, and authenticating. MCP tools return skill content; Claude Code writes the files to `~/.claude/skills/`.
3. A web UI (Next.js on Vercel) for GitHub OAuth login and API token management.

Once this phase is complete, the existing file-copy sync mechanism has a parallel, registry-backed replacement. Users generate tokens in the web UI, configure the MCP server URL in their `settings.json`, and use MCP tools to sync skills from the central registry instead of from a git clone. No npm package installation required — users just add a URL and token.

**Why this matters:** Every other planned phase (telemetry, feedback, Workshop UI, intelligence pipeline) requires a database, an authenticated API, and a distribution mechanism. This phase provides all three.

---

## Dependencies

- **Depends on:** None. This is Phase 01 -- the foundation.
- **Unlocks:** Phase 02 (Telemetry & Feedback), Phase 03 (Versioning), Phase 04 (Workshop UI), Phase 05 (Intelligence Pipeline).
- **Parallel safety:** No existing files are modified except `CHANGELOG.md`. The new code lives entirely in a new `packages/` directory at the repo root. The existing `global/` directory, skills, commands, hooks, and install mechanisms are untouched.

---

## Detailed Implementation Plan

### Monorepo Structure

Create the following directory structure at the repo root:

```
packages/
  db/                          # Database schema and migrations
    drizzle.config.ts          # Drizzle ORM configuration
    src/
      schema.ts                # All table definitions
      migrate.ts               # Migration runner
      seed.ts                  # Seed script to import 38 skills from global/
      client.ts                # Database client factory
    drizzle/
      0000_initial.sql         # Generated migration
    package.json
    tsconfig.json
  mcp-server/                  # Railway-hosted MCP server (SSE transport)
    src/
      index.ts                 # Entry point, SSE transport setup
      server.ts                # MCP server with tool registrations
      tools/
        sync.ts                # claudefather_sync tool (returns content for Claude to write)
        check-updates.ts       # claudefather_check_updates tool
        whoami.ts              # claudefather_whoami tool
      lib/
        db.ts                  # Direct database access (shared with web)
        diff.ts                # Diff computation for sync preview
    Dockerfile                 # Railway deployment
    package.json
    tsconfig.json
    README.md
  web/                         # Next.js web app
    src/
      app/
        layout.tsx             # Root layout with dark theme
        page.tsx               # Landing/login page
        api/
          auth/[...nextauth]/
            route.ts           # NextAuth GitHub OAuth handler
          tokens/
            route.ts           # POST /api/tokens (generate)
            [id]/
              route.ts         # DELETE /api/tokens/:id (revoke)
              rotate/
                route.ts       # POST /api/tokens/:id/rotate
          skills/
            route.ts           # GET /api/skills (list all skills for MCP)
            [slug]/
              route.ts         # GET /api/skills/:slug (skill content + version)
        dashboard/
          page.tsx             # API key list + connection health
          generate/
            page.tsx           # Generate new key form
      lib/
        auth.ts                # NextAuth configuration
        db.ts                  # Database connection (re-exports from @claudefather/db)
        tokens.ts              # Token generation, hashing, validation
      components/
        token-table.tsx        # Token list with actions
        token-form.tsx         # Generate token form
        connection-health.tsx  # Health metrics display
        copy-snippet.tsx       # MCP config copy-paste block
        nav.tsx                # Navigation bar
    package.json
    tsconfig.json
    next.config.ts
    tailwind.config.ts
```

### Step 1: Initialize Monorepo

**File: `/Users/chris/Projects/the-claudefather/packages/db/package.json`**

```json
{
  "name": "@claudefather/db",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "tsx src/migrate.ts",
    "seed": "tsx src/seed.ts",
    "studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@neondatabase/serverless": "^1.0.0",
    "drizzle-orm": "^0.38.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0"
  }
}
```

**File: `/Users/chris/Projects/the-claudefather/packages/mcp-server/package.json`**

```json
{
  "name": "@claudefather/mcp-server",
  "version": "1.0.0",
  "private": true,
  "description": "MCP server for claudefather skill registry — hosted on Railway, SSE transport.",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "@claudefather/db": "workspace:*",
    "@neondatabase/serverless": "^1.0.0",
    "drizzle-orm": "^0.38.0",
    "zod": "^3.25.0",
    "express": "^4.21.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "@types/express": "^4.17.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

**File: `/Users/chris/Projects/the-claudefather/packages/mcp-server/Dockerfile`**

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm install && npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

**Why Railway instead of npm package:**
- No local installation required — users configure a URL, not `npx`
- Railway handles uptime, scaling, logging, and deployment
- The MCP server connects directly to Neon (same database as the web app), eliminating the need for an intermediate API layer
- Simpler onboarding: just a URL + token in `settings.json`

**File: `/Users/chris/Projects/the-claudefather/packages/web/package.json`**

```json
{
  "name": "@claudefather/web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^15.2.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "next-auth": "^5.0.0",
    "@auth/drizzle-adapter": "^1.7.0",
    "@claudefather/db": "workspace:*",
    "@neondatabase/serverless": "^1.0.0",
    "drizzle-orm": "^0.38.0",
    "bcryptjs": "^2.4.3"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/bcryptjs": "^2.4.6",
    "tailwindcss": "^4.0.0",
    "postcss": "^8.5.0"
  }
}
```

**Why Drizzle ORM over raw SQL or Prisma:**
- Drizzle generates plain SQL migrations (`.sql` files), making them reviewable and portable. Prisma uses its own migration engine.
- Drizzle's `@neondatabase/serverless` adapter works natively with Neon's HTTP driver -- zero cold-start penalty on Vercel serverless functions.
- Schema is TypeScript code (type-safe queries without code generation step).
- Lighter weight than Prisma (~50KB vs ~2MB in node_modules).

### Step 2: Database Schema

**File: `/Users/chris/Projects/the-claudefather/packages/db/src/schema.ts`**

```typescript
import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  jsonb,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ─── Users ───────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  githubId: integer("github_id").notNull().unique(),
  githubUsername: text("github_username").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  email: text("email"),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── API Tokens ──────────────────────────────────────────────────────────────

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(), // first 8 chars for display: "cf_abc12..."
    name: text("name").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    totalCalls: integer("total_calls").notNull().default(0),
    successfulCalls: integer("successful_calls").notNull().default(0),
    failedCalls: integer("failed_calls").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("api_tokens_user_id_idx").on(table.userId),
    index("api_tokens_token_prefix_idx").on(table.tokenPrefix),
  ]
);

// ─── Skills ──────────────────────────────────────────────────────────────────

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(), // directory name, e.g. "quick-commit"
    name: text("name").notNull(), // from SKILL.md frontmatter "name" field
    description: text("description").notNull(),
    category: text("category", {
      enum: [
        "deployment",
        "database",
        "code-review",
        "planning",
        "design",
        "workflow",
        "utilities",
        "configuration",
      ],
    }).notNull(),
    isUserInvocable: boolean("is_user_invocable").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("skills_category_idx").on(table.category)]
);

// ─── Skill Versions ──────────────────────────────────────────────────────────

export const skillVersions = pgTable(
  "skill_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    version: text("version").notNull(), // semver string, e.g. "1.0.0"
    content: text("content").notNull(), // full SKILL.md text including frontmatter
    references: jsonb("references").$type<Record<string, string>>(), // { "references/templates.md": "<file content>" }
    changelog: text("changelog"),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    isLatest: boolean("is_latest").notNull().default(false),
  },
  (table) => [
    uniqueIndex("skill_versions_skill_version_idx").on(table.skillId, table.version),
    index("skill_versions_skill_id_idx").on(table.skillId),
    index("skill_versions_is_latest_idx").on(table.skillId, table.isLatest),
  ]
);

// ─── User Skill Pins ────────────────────────────────────────────────────────

export const userSkillPins = pgTable(
  "user_skill_pins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    pinnedVersion: text("pinned_version"), // null = follow latest
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_skill_pins_user_skill_idx").on(table.userId, table.skillId),
  ]
);
```

**Schema design decisions:**

1. **`tokenPrefix` column:** Stores the first 8 characters of the raw token (e.g., `cf_abc12`). Used for display in the dashboard ("cf_abc12..."). The full token is never stored -- only the bcrypt hash in `tokenHash`. The prefix is safe to store because 8 characters of a 48-character token provide zero brute-force advantage.

2. **`totalCalls`/`successfulCalls`/`failedCalls` on `apiTokens`:** Connection health metrics live directly on the token row. In Phase 01 these are incremented by the API routes that validate tokens. In Phase 02 (telemetry), they will be augmented with more granular per-tool tracking in a separate `telemetry_events` table.

3. **`references` JSONB:** Stores reference files as a flat key-value map where keys are relative paths (`"references/templates.md"`) and values are file content strings. Only 2 of 38 skills currently have references (context-resume and session-handoff), both with a single ~1.5KB file. JSONB allows flexible structure without a separate table.

4. **`isLatest` boolean on `skillVersions`:** Denormalized flag for fast queries. When a new version is published, the transaction sets the old `isLatest = false` and the new `isLatest = true`. Alternative approaches (computed view, max-version subquery) add query complexity for every sync request. The boolean is correct because there is exactly one latest version per skill at all times.

5. **`category` enum:** Matches the 8 categories from the skill inventory research. Stored as a PostgreSQL enum-like text column with a check constraint via Drizzle's `enum` option. Adding new categories requires a schema migration, which is intentional -- categories should be curated, not user-defined.

6. **`pinnedVersion` nullable text:** `null` means "follow latest" (the default). A non-null value like `"1.0.0"` pins to that specific version. This allows per-user version pinning without a complex version resolution mechanism.

### Step 3: Database Client

**File: `/Users/chris/Projects/the-claudefather/packages/db/src/client.ts`**

```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type Db = ReturnType<typeof createDb>;
```

**Why `neon-http` driver (not WebSocket):** The MCP server and Vercel API routes make one-shot queries (fetch skills, validate token, increment counter). HTTP is faster for single queries because it avoids WebSocket connection setup. The WebSocket driver is only needed for interactive transactions or session-scoped connections, neither of which apply here.

### Step 4: Drizzle Configuration

**File: `/Users/chris/Projects/the-claudefather/packages/db/drizzle.config.ts`**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### Step 5: Migration Runner

**File: `/Users/chris/Projects/the-claudefather/packages/db/src/migrate.ts`**

```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = neon(databaseUrl);
  const db = drizzle(sql);

  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

### Step 6: Seed Script

This script reads all 38 skills from the `global/skills/` directory in the claudefather repo and inserts them as v1.0.0 entries in the database.

**File: `/Users/chris/Projects/the-claudefather/packages/db/src/seed.ts`**

```typescript
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createDb } from "./client.js";
import { skills, skillVersions } from "./schema.js";
import { eq } from "drizzle-orm";

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
        category,
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
        category: "utilities",
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
```

**Why `onConflictDoNothing`:** Makes the seed script idempotent. Running it twice does not create duplicates and does not error. The `slug` unique constraint on `skills` prevents duplicate inserts.

### Step 7: MCP Server Entry Point

**File: `/Users/chris/Projects/the-claudefather/packages/mcp-server/src/index.ts`**

```typescript
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createServer } from "./server.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const app = express();

// Health check for Railway
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// SSE endpoint for MCP connections
app.get("/sse", async (req, res) => {
  // Extract API key from query parameter or Authorization header
  const apiKey =
    req.query.api_key as string ||
    req.headers.authorization?.replace("Bearer ", "");

  if (!apiKey) {
    res.status(401).json({ error: "API key required" });
    return;
  }

  // Validate the API key against the database
  // (token validation logic from web app's auth module)
  const user = await validateApiKey(apiKey);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired API key" });
    return;
  }

  const server = createServer({ user, databaseUrl: DATABASE_URL! });
  const transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

// Message endpoint for SSE transport
app.post("/messages", express.json(), async (req, res) => {
  // The SSE transport handles message routing internally
  // This endpoint receives messages from the client
  res.status(200).end();
});

app.listen(PORT, () => {
  console.log(`Claudefather MCP server listening on port ${PORT}`);
});
```

**Key difference from local npm package:** The server runs on Railway as a long-lived HTTP process. It uses SSE (Server-Sent Events) transport instead of stdio. The API key is passed via the MCP client configuration (as a header or query param), and the server validates it directly against the Neon database — no intermediate web API layer needed.

**Railway deployment:** The `Dockerfile` builds the TypeScript and runs `node dist/index.js`. Railway auto-detects the Dockerfile and deploys. The `PORT` environment variable is set by Railway automatically.

### Step 8: MCP Server Tool Registration

**File: `/Users/chris/Projects/the-claudefather/packages/mcp-server/src/server.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createDbClient } from "./lib/db.js";
import { syncSkills } from "./tools/sync.js";
import { checkUpdates } from "./tools/check-updates.js";
import { whoami } from "./tools/whoami.js";

interface ServerConfig {
  user: { id: string; githubUsername: string; role: string };
  databaseUrl: string;
}

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer({
    name: "claudefather",
    version: "1.0.0",
  });

  const db = createDbClient(config.databaseUrl);

  // ─── claudefather_sync ─────────────────────────────────────────────────────
  server.registerTool(
    "claudefather_sync",
    {
      title: "Sync Skills from Registry",
      description:
        "Fetches latest skills from the claudefather registry. Returns skill content " +
        "that Claude Code should write to ~/.claude/skills/. " +
        "Skills are loaded by Claude Code at session start from the local filesystem.",
      inputSchema: z.object({
        dryRun: z
          .boolean()
          .optional()
          .describe(
            "If true, shows what would change without returning file content. Default: false."
          ),
        skills: z
          .array(z.string())
          .optional()
          .describe(
            "Specific skill slugs to sync. If omitted, syncs all skills."
          ),
      }),
    },
    async (args) => syncSkills(db, config.user, args)
  );

  // ─── claudefather_check_updates ────────────────────────────────────────────
  server.registerTool(
    "claudefather_check_updates",
    {
      title: "Check for Skill Updates",
      description:
        "Lightweight check for available skill updates without syncing. " +
        "Returns a list of skills with new versions available.",
      inputSchema: z.object({}),
    },
    async () => checkUpdates(db, config.user)
  );

  // ─── claudefather_whoami ───────────────────────────────────────────────────
  server.registerTool(
    "claudefather_whoami",
    {
      title: "Current User Info",
      description:
        "Returns the authenticated user's GitHub identity, role, and token status.",
      inputSchema: z.object({}),
    },
    async () => whoami(config.user)
  );

  return server;
}
```

### Step 9: Database Client (Direct Access)

The MCP server runs on Railway and connects directly to Neon PostgreSQL — no intermediate web API layer needed. It shares the same `@claudefather/db` schema package as the web app.

**File: `/Users/chris/Projects/the-claudefather/packages/mcp-server/src/lib/db.ts`**

```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@claudefather/db/schema";

export function createDbClient(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type DbClient = ReturnType<typeof createDbClient>;
```

**Why direct DB access instead of an API client:** Since the MCP server is now a hosted service on Railway (not a local npm package), it can connect directly to Neon PostgreSQL. This eliminates an entire HTTP hop, reduces latency, and removes the need for the web app to expose MCP-specific API endpoints. The web app still handles browser-facing APIs (OAuth, dashboard, token management); the MCP server handles MCP tool requests.

### Step 10: Skill Content Delivery (No Local Disk Writes)

**Critical architecture change:** Since the MCP server is hosted on Railway (not running locally), it **cannot write files to the user's disk**. Instead, MCP tools return skill content in the tool response, and Claude Code (the MCP client) is responsible for writing files to `~/.claude/skills/` using its Write tool.

This means:
- `claudefather_sync` returns a JSON payload with skill content, file paths, and versions
- The `/claudefather-sync` skill (Phase 03) instructs Claude Code to write each file using the Write tool
- The MCP server never touches the local filesystem

**No `skill-writer.ts` module is needed.** The sync tool returns structured content:

```typescript
// Example tool response from claudefather_sync
{
  content: [{
    type: "text",
    text: JSON.stringify({
      skills: [
        {
          slug: "review-pr",
          version: "1.3.0",
          action: "update",
          files: {
            "SKILL.md": "<full SKILL.md content>",
            "references/review-checklist.md": "<reference file content>"
          }
        }
      ],
      summary: "1 update available"
    })
  }]
}
```

Claude Code receives this response and the `/claudefather-sync` skill instructs it to:
1. Write each file to `~/.claude/skills/<slug>/<path>` using the Write tool
2. Write the version to `~/.claude/skills/<slug>/.version`
3. Set executable permissions on `.sh` files via `chmod +x`

### Step 11: Sync Tool Implementation

**File: `/Users/chris/Projects/the-claudefather/packages/mcp-server/src/tools/sync.ts`**

The sync tool queries the database for latest skill versions and returns the content. It does NOT write to disk — Claude Code handles that.

```typescript
import type { DbClient } from "../lib/db.js";
import { skills, skillVersions } from "@claudefather/db/schema";
import { eq, and } from "drizzle-orm";

interface SyncArgs {
  dryRun?: boolean;
  skills?: string[];
}

interface SyncedSkill {
  slug: string;
  version: string;
  action: "install" | "update";
  files: Record<string, string>;
}

export async function syncSkills(
  db: DbClient,
  user: { id: string },
  args: SyncArgs
): Promise<{ content: { type: "text"; text: string }[] }> {
  // Fetch all skills with their latest versions
  const allSkills = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      description: skills.description,
      version: skillVersions.version,
      content: skillVersions.content,
      references: skillVersions.references,
      changelog: skillVersions.changelog,
    })
    .from(skills)
    .innerJoin(
      skillVersions,
      and(
        eq(skillVersions.skillId, skills.id),
        eq(skillVersions.isLatest, true)
      )
    );

  // Filter to requested skills if specified
  const targetSkills = args.skills
    ? allSkills.filter((s) => args.skills!.includes(s.slug))
    : allSkills;

  if (targetSkills.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: args.skills
            ? `No matching skills found for: ${args.skills.join(", ")}`
            : "No skills available in the registry.",
        },
      ],
    };
  }

  if (args.dryRun) {
    // Return summary only, no content
    const summary = targetSkills.map(
      (s) => `  ${s.slug} v${s.version} — ${s.description}`
    );
    return {
      content: [{
        type: "text" as const,
        text: `=== Available Skills (${targetSkills.length}) ===\n${summary.join("\n")}`,
      }],
    };
  }

  // Return full content for Claude Code to write to disk
  const syncedSkills: SyncedSkill[] = targetSkills.map((s) => ({
    slug: s.slug,
    version: s.version,
    action: "install" as const,
    files: {
      "SKILL.md": s.content,
      ...(s.references as Record<string, string> || {}),
    },
  }));

  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        skills: syncedSkills,
        summary: `${syncedSkills.length} skill(s) ready to write to ~/.claude/skills/`,
        instructions: "Write each skill's files to ~/.claude/skills/<slug>/<path> and write the version to ~/.claude/skills/<slug>/.version",
      }),
    }],
  };
  }

  if (!args.dryRun && (created > 0 || updated > 0)) {
    summary.push(
      "",
      "Changes will take effect at the start of your next Claude Code session."
    );
  }

  return {
    content: [{ type: "text" as const, text: summary.join("\n") }],
  };
}
```

### Step 12: Check Updates Tool

**File: `/Users/chris/Projects/the-claudefather/packages/mcp-server/src/tools/check-updates.ts`**

```typescript
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ApiClient } from "../lib/api-client.js";

function getInstalledVersions(): { slug: string; version: string }[] {
  const skillsDir = join(homedir(), ".claude", "skills");
  if (!existsSync(skillsDir)) return [];

  const installed: { slug: string; version: string }[] = [];

  for (const dir of readdirSync(skillsDir)) {
    if (dir === "_shared") continue;
    const skillPath = join(skillsDir, dir, "SKILL.md");
    if (!existsSync(skillPath)) continue;

    // For Phase 01, installed skills from the seed are all v1.0.0.
    // In Phase 03 (versioning), a .claudefather-version file will track
    // the installed version per skill. For now, default to "1.0.0".
    const versionFile = join(skillsDir, dir, ".claudefather-version");
    const version = existsSync(versionFile)
      ? readFileSync(versionFile, "utf-8").trim()
      : "1.0.0";

    installed.push({ slug: dir, version });
  }

  return installed;
}

export async function checkUpdates(
  client: ApiClient
): Promise<{ content: { type: "text"; text: string }[] }> {
  const installed = getInstalledVersions();

  if (installed.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: "No skills installed locally. Run claudefather_sync to install skills.",
        },
      ],
    };
  }

  const updates = await client.checkUpdates(installed);

  if (updates.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `All ${installed.length} installed skills are up to date.`,
        },
      ],
    };
  }

  const lines = [
    `${updates.length} update(s) available:`,
    "",
    ...updates.map((u) => {
      const changeNote = u.changelog ? ` — ${u.changelog}` : "";
      return `  ${u.slug}: ${u.currentVersion} → ${u.latestVersion}${changeNote}`;
    }),
    "",
    "Run claudefather_sync to apply updates.",
  ];

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
```

### Step 13: Whoami Tool

**File: `/Users/chris/Projects/the-claudefather/packages/mcp-server/src/tools/whoami.ts`**

```typescript
import type { ApiClient } from "../lib/api-client.js";

export async function whoami(
  client: ApiClient
): Promise<{ content: { type: "text"; text: string }[] }> {
  const user = await client.whoami();

  const lines = [
    `GitHub: @${user.githubUsername}`,
    `Name: ${user.displayName || "(not set)"}`,
    `Role: ${user.role}`,
    `Token: ${user.tokenName}`,
    `Expires: ${user.tokenExpiresAt || "Never"}`,
  ];

  return {
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
```

### Step 14: Web App — NextAuth Configuration

**File: `/Users/chris/Projects/the-claudefather/packages/web/src/lib/auth.ts`**

```typescript
import NextAuth from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { createDb } from "@claudefather/db/client";
import { users } from "@claudefather/db/schema";
import { eq } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== "github" || !profile) return false;

      // Upsert user with GitHub identity
      const githubId = Number(profile.id);
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.githubId, githubId))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(users).values({
          githubId,
          githubUsername: profile.login as string,
          displayName: profile.name as string | undefined,
          avatarUrl: profile.avatar_url as string | undefined,
          email: profile.email as string | undefined,
          role: "member",
        });
      } else {
        await db
          .update(users)
          .set({
            githubUsername: profile.login as string,
            displayName: profile.name as string | undefined,
            avatarUrl: profile.avatar_url as string | undefined,
            updatedAt: new Date(),
          })
          .where(eq(users.githubId, githubId));
      }

      return true;
    },
    async session({ session, user }) {
      // Attach internal user ID and role to session
      const dbUser = await db
        .select()
        .from(users)
        .where(eq(users.email, user.email!))
        .limit(1);

      if (dbUser.length > 0) {
        (session as any).userId = dbUser[0].id;
        (session as any).role = dbUser[0].role;
      }

      return session;
    },
  },
});
```

**Why GitHub OAuth App (not GitHub App):** GitHub Apps require installation to an organization or account and provide repository-level permissions. We need only identity -- the user's GitHub username and avatar. OAuth Apps are simpler (no installation step, no webhook requirements) and support any GitHub account without org membership.

### Step 15: Token Management Library

**File: `/Users/chris/Projects/the-claudefather/packages/web/src/lib/tokens.ts`**

```typescript
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { createDb } from "@claudefather/db/client";
import { apiTokens, users } from "@claudefather/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

const TOKEN_PREFIX = "cf_";
const TOKEN_BYTES = 32; // 32 bytes = 64 hex chars + "cf_" prefix = 67 chars total
const BCRYPT_ROUNDS = 12;

export interface GenerateTokenResult {
  id: string;
  rawToken: string; // Shown ONCE to the user, then never stored
  name: string;
  prefix: string;
  expiresAt: Date | null;
}

export async function generateToken(
  userId: string,
  name: string,
  expiresInDays: number | null
): Promise<GenerateTokenResult> {
  const rawBytes = randomBytes(TOKEN_BYTES);
  const rawToken = TOKEN_PREFIX + rawBytes.toString("hex");
  const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);
  const tokenPrefix = rawToken.slice(0, 11); // "cf_" + first 8 hex = "cf_abc12345"
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const [token] = await db
    .insert(apiTokens)
    .values({
      userId,
      tokenHash,
      tokenPrefix,
      name,
      expiresAt,
    })
    .returning();

  return {
    id: token.id,
    rawToken,
    name,
    prefix: tokenPrefix,
    expiresAt,
  };
}

export async function validateToken(
  rawToken: string
): Promise<{ userId: string; tokenId: string; tokenName: string } | null> {
  if (!rawToken.startsWith(TOKEN_PREFIX)) return null;

  const prefix = rawToken.slice(0, 11);

  // Look up by prefix to narrow the bcrypt comparison set
  const candidates = await db
    .select()
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.tokenPrefix, prefix),
        isNull(apiTokens.revokedAt)
      )
    );

  for (const candidate of candidates) {
    // Check expiration
    if (candidate.expiresAt && candidate.expiresAt < new Date()) {
      continue;
    }

    const matches = await bcrypt.compare(rawToken, candidate.tokenHash);
    if (matches) {
      // Update usage stats
      await db
        .update(apiTokens)
        .set({
          lastUsedAt: new Date(),
          totalCalls: candidate.totalCalls + 1,
          successfulCalls: candidate.successfulCalls + 1,
        })
        .where(eq(apiTokens.id, candidate.id));

      return {
        userId: candidate.userId,
        tokenId: candidate.id,
        tokenName: candidate.name,
      };
    }
  }

  return null;
}

export async function revokeToken(
  tokenId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)));

  return (result as any).rowCount > 0;
}

export async function rotateToken(
  tokenId: string,
  userId: string
): Promise<GenerateTokenResult | null> {
  // Get the existing token's metadata
  const [existing] = await db
    .select()
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.id, tokenId),
        eq(apiTokens.userId, userId),
        isNull(apiTokens.revokedAt)
      )
    );

  if (!existing) return null;

  // Revoke the old token
  await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(eq(apiTokens.id, tokenId));

  // Generate a new token with the same name and remaining expiration
  const remainingDays = existing.expiresAt
    ? Math.max(
        1,
        Math.ceil(
          (existing.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        )
      )
    : null;

  return generateToken(userId, existing.name, remainingDays);
}
```

**Token security design decisions:**
- **`cf_` prefix:** All tokens start with `cf_` for easy identification in logs and leak detection (like GitHub's `ghp_` prefix). If a `cf_` token appears in a git commit or log file, it is immediately recognizable as a claudefather API key.
- **Prefix-based lookup:** The `tokenPrefix` column stores the first 11 characters (enough for uniqueness across a small user base). This narrows the bcrypt comparison to 1-2 candidates instead of scanning all tokens.
- **bcrypt over SHA-256:** bcrypt is intentionally slow (~250ms per comparison at 12 rounds), which is acceptable for API token validation (happens once per MCP tool call, not per-request on a high-throughput API). SHA-256 is fast but vulnerable to brute-force if the database leaks.
- **Rotation = revoke + generate:** The old token is immediately revoked. The new token inherits the same name and remaining expiration. Active MCP sessions using the old token will fail on next tool call and see a clear error message directing them to update their env var.

### Step 16: API Routes — Token Management

**File: `/Users/chris/Projects/the-claudefather/packages/web/src/app/api/tokens/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generateToken } from "@/lib/tokens";
import { createDb } from "@claudefather/db/client";
import { apiTokens } from "@claudefather/db/schema";
import { eq, isNull, desc } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

// GET /api/tokens — list all tokens for the current user
export async function GET() {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tokens = await db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.tokenPrefix,
      expiresAt: apiTokens.expiresAt,
      lastUsedAt: apiTokens.lastUsedAt,
      revokedAt: apiTokens.revokedAt,
      totalCalls: apiTokens.totalCalls,
      successfulCalls: apiTokens.successfulCalls,
      failedCalls: apiTokens.failedCalls,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, (session as any).userId))
    .orderBy(desc(apiTokens.createdAt));

  return NextResponse.json(tokens);
}

// POST /api/tokens — generate a new token
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, expiresInDays } = body;

  if (!name || typeof name !== "string" || name.length > 64) {
    return NextResponse.json(
      { error: "Name is required and must be <= 64 characters" },
      { status: 400 }
    );
  }

  const validExpiry = [14, 30, 90, 365, null];
  if (!validExpiry.includes(expiresInDays)) {
    return NextResponse.json(
      { error: "expiresInDays must be 14, 30, 90, 365, or null (no expiry)" },
      { status: 400 }
    );
  }

  const result = await generateToken(
    (session as any).userId,
    name,
    expiresInDays
  );

  return NextResponse.json(result, { status: 201 });
}
```

**File: `/Users/chris/Projects/the-claudefather/packages/web/src/app/api/tokens/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { revokeToken } from "@/lib/tokens";

// DELETE /api/tokens/:id — revoke a token
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const revoked = await revokeToken(params.id, (session as any).userId);
  if (!revoked) {
    return NextResponse.json(
      { error: "Token not found or already revoked" },
      { status: 404 }
    );
  }

  return NextResponse.json({ success: true });
}
```

**File: `/Users/chris/Projects/the-claudefather/packages/web/src/app/api/tokens/[id]/rotate/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rotateToken } from "@/lib/tokens";

// POST /api/tokens/:id/rotate — revoke old token, generate new one
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await rotateToken(params.id, (session as any).userId);
  if (!result) {
    return NextResponse.json(
      { error: "Token not found, already revoked, or does not belong to you" },
      { status: 404 }
    );
  }

  return NextResponse.json(result, { status: 201 });
}
```

### Step 17: API Routes — Skills (for MCP server)

**File: `/Users/chris/Projects/the-claudefather/packages/web/src/app/api/skills/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { validateToken } from "@/lib/tokens";
import { createDb } from "@claudefather/db/client";
import { skills, skillVersions } from "@claudefather/db/schema";
import { eq, and } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

// GET /api/skills — list all skills with their latest version content
// Authenticated via Bearer token (MCP server calls this)
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const validated = await validateToken(token);
  if (!validated) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const results = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      description: skills.description,
      category: skills.category,
      version: skillVersions.version,
      content: skillVersions.content,
      references: skillVersions.references,
      publishedAt: skillVersions.publishedAt,
    })
    .from(skills)
    .innerJoin(
      skillVersions,
      and(
        eq(skillVersions.skillId, skills.id),
        eq(skillVersions.isLatest, true)
      )
    );

  return NextResponse.json(results);
}
```

**File: `/Users/chris/Projects/the-claudefather/packages/web/src/app/api/skills/[slug]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { validateToken } from "@/lib/tokens";
import { createDb } from "@claudefather/db/client";
import { skills, skillVersions } from "@claudefather/db/schema";
import { eq, and } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

// GET /api/skills/:slug — get a specific skill's latest version
export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const validated = await validateToken(token);
  if (!validated) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const [result] = await db
    .select({
      slug: skills.slug,
      name: skills.name,
      description: skills.description,
      category: skills.category,
      version: skillVersions.version,
      content: skillVersions.content,
      references: skillVersions.references,
      publishedAt: skillVersions.publishedAt,
    })
    .from(skills)
    .innerJoin(
      skillVersions,
      and(
        eq(skillVersions.skillId, skills.id),
        eq(skillVersions.isLatest, true)
      )
    )
    .where(eq(skills.slug, params.slug));

  if (!result) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
```

### Step 18: API Route — Whoami (for MCP server)

**File: `/Users/chris/Projects/the-claudefather/packages/web/src/app/api/whoami/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { validateToken } from "@/lib/tokens";
import { createDb } from "@claudefather/db/client";
import { users, apiTokens } from "@claudefather/db/schema";
import { eq } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const validated = await validateToken(token);
  if (!validated) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, validated.userId));

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [tokenRecord] = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.id, validated.tokenId));

  return NextResponse.json({
    githubUsername: user.githubUsername,
    displayName: user.displayName,
    role: user.role,
    tokenName: tokenRecord?.name || "unknown",
    tokenExpiresAt: tokenRecord?.expiresAt?.toISOString() || null,
  });
}
```

### Step 19: API Route — Check Updates (for MCP server)

**File: `/Users/chris/Projects/the-claudefather/packages/web/src/app/api/skills/check-updates/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { validateToken } from "@/lib/tokens";
import { createDb } from "@claudefather/db/client";
import { skills, skillVersions } from "@claudefather/db/schema";
import { eq, and } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const validated = await validateToken(token);
  if (!validated) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  const body = await request.json();
  const installed: { slug: string; version: string }[] = body.installed || [];

  const updates = [];

  for (const { slug, version } of installed) {
    const [latest] = await db
      .select({
        version: skillVersions.version,
        changelog: skillVersions.changelog,
      })
      .from(skills)
      .innerJoin(
        skillVersions,
        and(
          eq(skillVersions.skillId, skills.id),
          eq(skillVersions.isLatest, true)
        )
      )
      .where(eq(skills.slug, slug));

    if (latest && latest.version !== version) {
      updates.push({
        slug,
        currentVersion: version,
        latestVersion: latest.version,
        changelog: latest.changelog,
      });
    }
  }

  return NextResponse.json(updates);
}
```

### Step 20: Dashboard Page (Token Management UI)

The dashboard follows the dark terminal aesthetic specified in the requirements. Key design elements: dark background (`#0d1117`), green accents for active states (`#3fb950`), amber for warnings (`#d29922`), monospace headers (`JetBrains Mono` or `ui-monospace` fallback).

**File: `/Users/chris/Projects/the-claudefather/packages/web/src/app/dashboard/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TokenTable } from "@/components/token-table";
import { ConnectionHealth } from "@/components/connection-health";
import { CopySnippet } from "@/components/copy-snippet";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="font-mono text-2xl text-green-400 mb-2">
          claudefather
        </h1>
        <p className="text-gray-500 mb-8">
          API Keys &amp; MCP Configuration
        </p>

        {/* Connection Health */}
        <section className="mb-10">
          <h2 className="font-mono text-lg text-amber-400 mb-4">
            Connection Health
          </h2>
          <ConnectionHealth />
        </section>

        {/* API Keys */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-mono text-lg text-amber-400">API Keys</h2>
            <a
              href="/dashboard/generate"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-mono text-sm rounded transition-colors"
            >
              + Generate New Key
            </a>
          </div>
          <TokenTable />
        </section>

        {/* MCP Configuration Snippet */}
        <section>
          <h2 className="font-mono text-lg text-amber-400 mb-4">
            MCP Configuration
          </h2>
          <p className="text-gray-400 text-sm mb-3">
            Add this to your <code className="text-green-400">~/.claude/settings.json</code>:
          </p>
          <CopySnippet />
        </section>
      </div>
    </div>
  );
}
```

**File: `/Users/chris/Projects/the-claudefather/packages/web/src/app/dashboard/generate/page.tsx`**

```tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { TokenForm } from "@/components/token-form";

export default async function GenerateTokenPage() {
  const session = await auth();
  if (!session) redirect("/");

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200">
      <div className="max-w-lg mx-auto px-6 py-12">
        <a
          href="/dashboard"
          className="text-gray-500 hover:text-gray-300 font-mono text-sm mb-6 block"
        >
          &larr; Back to Dashboard
        </a>
        <h1 className="font-mono text-2xl text-green-400 mb-6">
          Generate API Key
        </h1>
        <TokenForm />
      </div>
    </div>
  );
}
```

**File: `/Users/chris/Projects/the-claudefather/packages/web/src/components/copy-snippet.tsx`**

```tsx
"use client";

import { useState } from "react";

const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL || "https://mcp.the-claudefather.railway.app";

export function CopySnippet() {
  const [copied, setCopied] = useState(false);

  const snippet = JSON.stringify(
    {
      mcpServers: {
        claudefather: {
          url: `${MCP_SERVER_URL}/sse`,
          headers: {
            Authorization: "Bearer <your-token>",
          },
        },
      },
    },
    null,
    2
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <pre className="bg-[#161b22] border border-gray-700 rounded p-4 font-mono text-sm text-gray-300 overflow-x-auto">
        {snippet}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-mono text-xs rounded transition-colors"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
```

### Step 21: Environment Variables

The following environment variables are required for deployment:

**Vercel (web app):**
```
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
GITHUB_CLIENT_ID=Ov23li...           # From GitHub OAuth App settings
GITHUB_CLIENT_SECRET=abcdef...       # From GitHub OAuth App settings
NEXTAUTH_URL=https://claudefather.vercel.app
NEXTAUTH_SECRET=$(openssl rand -base64 32)
MCP_SERVER_URL=https://mcp.the-claudefather.railway.app  # For copy-snippet component
```

**Railway (MCP server):**
```
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
PORT=3001                            # Set automatically by Railway
```

**User's local machine (no server install needed):**
Users only need to add the MCP config snippet to `~/.claude/settings.json` with their API token. No environment variables, no npm packages.

### Step 22: GitHub OAuth App Setup

Create a GitHub OAuth App at https://github.com/settings/developers:
- **Application name:** claudefather
- **Homepage URL:** https://claudefather.vercel.app
- **Authorization callback URL:** https://claudefather.vercel.app/api/auth/callback/github
- **Enable Device Flow:** No (not needed)

Copy the Client ID and Client Secret to Vercel environment variables.

### Step 23: TypeScript Configurations

**File: `/Users/chris/Projects/the-claudefather/packages/db/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

**File: `/Users/chris/Projects/the-claudefather/packages/mcp-server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

### Step 24: Railway Deployment Configuration

Deploy the MCP server to Railway:

1. **Create Railway project** — Link to the `the-claudefather` GitHub repo
2. **Configure service** — Point to `packages/mcp-server/` as the root directory, Railway auto-detects the Dockerfile
3. **Set environment variables** — `DATABASE_URL` (same Neon connection string as Vercel)
4. **Custom domain** (optional) — `mcp.the-claudefather.railway.app` or custom domain
5. **Health check** — Configure Railway health check to `GET /health`
6. **Autoscaling** — Start with a single instance; Railway scales as needed

The MCP server shares the same Neon database as the Vercel web app. Both services connect via Neon's HTTP driver, so there is no connection pooling conflict.

---

## Test Plan

### Unit Tests

**Package: `@claudefather/db`**

1. **Schema validation test** — Run `drizzle-kit generate` and verify migration SQL is generated without errors.
2. **Seed idempotency test** — Run seed script twice against a test database. Verify no duplicates, no errors, and all 38 skills + `_shared` present.
3. **Seed content integrity test** — Verify that for each seeded skill, the `content` column matches the file content of `global/skills/<slug>/SKILL.md` byte-for-byte.
4. **References test** — Verify context-resume and session-handoff have non-null `references` JSONB with the correct keys (`references/templates.md`).

**Package: `@claudefather/mcp-server`**

5. **API key validation** — Test valid key returns user, expired key returns null, revoked key returns null.
6. **SSE transport** — Verify server starts and accepts SSE connections on `/sse` endpoint.
7. **Sync tool — returns content** — Call `claudefather_sync`, verify response contains JSON with skill content, versions, and file paths.
8. **Sync tool — dry run** — Call with `dryRun: true`, verify response contains skill list without file content.
9. **Sync tool — filtered skills** — Call with `skills: ["review-pr"]`, verify only that skill is returned.
10. **Health endpoint** — Verify `GET /health` returns 200 with `{"status": "ok"}`.
11. **Unauthenticated request** — Verify `/sse` without API key returns 401.

**Package: `@claudefather/web`**

12. **Token generation** — Generate a token, verify it starts with `cf_`, is 67 characters long, and the stored hash validates against the raw token.
13. **Token validation — valid** — Generate and validate a token, verify userId is returned.
14. **Token validation — expired** — Generate a token with `expiresInDays: 0` (or set expiresAt to past), verify validation returns null.
15. **Token validation — revoked** — Generate, revoke, then validate. Verify null.
16. **Token rotation** — Generate, rotate. Verify old token is revoked, new token validates, new token has same name.
17. **Token usage tracking** — Validate a token 3 times, verify `totalCalls` and `successfulCalls` are 3.
18. **API route — POST /api/tokens** — Verify returns 201 with rawToken, name, prefix.
19. **API route — POST /api/tokens** — Verify returns 400 for missing name, invalid expiresInDays.
20. **API route — DELETE /api/tokens/:id** — Verify returns 200, token is revoked.
21. **API route — GET /api/skills** — Verify returns array of all skills with latest version content.
22. **API route — GET /api/skills** — Verify returns 401 for missing/invalid Bearer token.
23. **API route — GET /api/whoami** — Verify returns user info and token metadata.

### Integration Tests

24. **End-to-end MCP sync** — Connect to Railway-hosted MCP server with a test token, call `claudefather_sync`, verify response contains skill content that can be written to `~/.claude/skills/`.
25. **End-to-end check updates** — Seed v1.0.0, publish v1.1.0 for one skill, call `claudefather_check_updates`, verify it reports the update.
26. **GitHub OAuth flow** — Manually test login with a GitHub account, verify user is created in DB with correct githubId and username.

### Manual Verification Steps

27. **Neon database setup** — Create a Neon project, set DATABASE_URL, run migrations, run seed. Verify all tables exist with correct schemas via Neon console.
28. **Vercel deployment** — Deploy web app to Vercel, verify landing page loads, GitHub OAuth login works, dashboard shows after login.
29. **Token generation in UI** — Generate a token in the dashboard, verify it appears in the token list with correct name and prefix.
30. **MCP configuration** — Copy the settings.json snippet (URL + token), verify Claude Code discovers the remote MCP server and shows `claudefather_sync`, `claudefather_check_updates`, `claudefather_whoami` in tool list.
31. **MCP sync from Claude Code** — Call `claudefather_sync` from a Claude Code session, verify the `/claudefather-sync` skill writes returned content to `~/.claude/skills/`.

---

## Documentation Updates

### CHANGELOG.md

Add under `## [Unreleased]` > `### Added`:

```markdown
- **Skills platform foundation** — New `packages/` monorepo with three packages:
  - `@claudefather/db`: PostgreSQL schema (Neon serverless) with tables for users, API tokens, skills, skill versions, and user skill pins. Drizzle ORM for type-safe queries. Seed script imports all 38 skills as v1.0.0.
  - `@claudefather/mcp-server`: Railway-hosted MCP server (SSE transport) with three tools — `claudefather_sync` (fetch skills from registry, returns content for Claude Code to write), `claudefather_check_updates` (check for newer versions), `claudefather_whoami` (show auth status). Connects directly to Neon database.
  - `@claudefather/web`: Next.js web app on Vercel with GitHub OAuth login, API token management (generate, revoke, rotate), connection health metrics, and MCP configuration snippet.
```

### README.md

Add a new section after the existing content:

```markdown
## Skills Platform (Beta)

Claudefather includes a centralized skills registry that replaces git-clone sync with a database-backed distribution system.

### Setup

1. Log in at https://claudefather.vercel.app with your GitHub account
2. Generate an API key on the dashboard
3. Add the MCP server to your `~/.claude/settings.json`:

\```json
{
  "mcpServers": {
    "claudefather": {
      "url": "https://mcp.the-claudefather.railway.app/sse",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
\```

4. Restart Claude Code. The `claudefather_sync` tool will be available.

No local installation required — the MCP server is hosted on Railway.

### MCP Tools

| Tool | Description |
|------|-------------|
| `claudefather_sync` | Fetch latest skills from registry and write to `~/.claude/skills/` |
| `claudefather_check_updates` | Check for available skill updates |
| `claudefather_whoami` | Show your identity and token status |
```

---

## Stress Testing & Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Token expired during active session | MCP tool call returns 401 with message directing to token generation page. Session continues, other non-MCP tools work. |
| Token revoked while MCP server running | Same as expired -- 401 on next tool call. MCP server process stays alive, no crash. |
| Neon database cold start (free tier) | First request after idle period may take 1-3 seconds (Neon compute wake-up). Subsequent requests are fast. The MCP SDK has no timeout by default. |
| User has skills locally that are not in registry | `claudefather_sync` only writes skills that exist in the registry. Local-only skills (e.g., user-created) are left untouched. |
| Two users call `/api/skills` simultaneously | Both get consistent results. The `isLatest` flag is set in a transaction, so no partial state. |
| Large SKILL.md (design-review is 20KB) | Well within PostgreSQL's text column limit (1GB). HTTP response for all 38 skills is ~236KB total -- well within Vercel's 4.5MB response limit. |
| User generates 100+ tokens | Token list query is indexed by `userId`. Performance is fine for thousands of rows. UI should paginate if list grows large (Phase 04 concern, not Phase 01). |
| Seed script run against non-empty database | `onConflictDoNothing` prevents duplicates. Existing skills with different content are NOT updated (use a separate publish workflow for that). |
| MCP server started without DATABASE_URL | Process exits with error code 1 and helpful message. Railway deployment logs will show the error. |
| Network failure during sync | MCP tool returns error text. Since the server returns content (not writes to disk), there are no partial filesystem writes — Claude Code handles writing atomically per skill. |
| `~/.claude/skills/` directory does not exist | `mkdirSync` with `recursive: true` creates it. |
| Invalid JSON in API response | `response.json()` throws. Error is caught and returned as error text in MCP tool response. |

---

## Verification Checklist

- [ ] `packages/db/` — Drizzle schema compiles, migration generates valid SQL
- [ ] `packages/db/` — Seed script imports all 38 skills + `_shared` as v1.0.0
- [ ] `packages/db/` — context-resume and session-handoff have non-null `references` JSONB
- [ ] `packages/db/` — `users` table has GitHub-specific columns (githubId, githubUsername)
- [ ] `packages/db/` — `api_tokens` table stores bcrypt hash, never plaintext
- [ ] `packages/db/` — `skill_versions` has unique index on (skillId, version)
- [ ] `packages/mcp-server/` — Deploys to Railway and starts with SSE transport on configured PORT
- [ ] `packages/mcp-server/` — `/health` endpoint returns 200
- [ ] `packages/mcp-server/` — Rejects connections without valid API key (401)
- [ ] `packages/mcp-server/` — `claudefather_sync` returns skill content as JSON for Claude Code to write
- [ ] `packages/mcp-server/` — `claudefather_sync` with `dryRun: true` shows available skills without returning content
- [ ] `packages/mcp-server/` — `claudefather_check_updates` reports version differences
- [ ] `packages/mcp-server/` — `claudefather_whoami` returns GitHub identity and token name
- [ ] `packages/web/` — GitHub OAuth login creates user in DB
- [ ] `packages/web/` — Dashboard shows token list with name, prefix, expiry, actions
- [ ] `packages/web/` — Generate token page returns raw token shown ONCE
- [ ] `packages/web/` — Revoke token sets `revokedAt`, token no longer validates
- [ ] `packages/web/` — Rotate token revokes old, generates new with same name
- [ ] `packages/web/` — Connection health shows totalCalls, successfulCalls, failedCalls, lastUsedAt
- [ ] `packages/web/` — MCP config snippet shows correct JSON with placeholder
- [ ] `packages/web/` — `/api/skills` returns all skills to authenticated MCP client
- [ ] `packages/web/` — `/api/skills` returns 401 for invalid token
- [ ] `packages/web/` — `/api/whoami` returns user identity for valid token
- [ ] Dark terminal aesthetic: dark bg `#0d1117`, green headers `#3fb950`, amber section titles `#d29922`, monospace fonts
- [ ] Existing `global/` directory, skills, commands, hooks completely untouched
- [ ] CHANGELOG.md updated
- [ ] README.md updated with Skills Platform section

---

## What NOT to Do

1. **Do NOT modify any files in `global/`.** This phase creates a parallel distribution system in `packages/`. The existing git-based sync continues to work. Migration from git-sync to registry-sync is a Phase 03+ concern.

2. **Do NOT add telemetry to the MCP server.** Telemetry collection is Phase 02. The `totalCalls`/`successfulCalls`/`failedCalls` counters on `api_tokens` are for connection health display only -- they track API authentication events, not skill usage.

3. **Do NOT build versioning UI.** The seed script creates v1.0.0 entries. Publishing new versions and the version management UI are Phase 03.

4. **Do NOT build skill editing in the web UI.** The dashboard shows tokens and connection health only. Skill browsing and editing are Phase 04 (Workshop UI).

5. **Do NOT store raw tokens in the database.** Only the bcrypt hash is stored. The raw token is shown once at generation time. If the user loses it, they must generate a new one.

6. **Do NOT use GitHub App instead of OAuth App.** GitHub Apps require installation and provide repository access we do not need. OAuth App provides identity only, which is all we need.

7. **Do NOT use a WebSocket database driver.** The HTTP driver (`neon-http`) is correct for one-shot queries from Vercel serverless functions and the MCP server on Railway. WebSocket connections have setup overhead and connection pooling complexity that provide no benefit for this workload.

8. **Do NOT add the MCP server config to `global/settings.json`.** The reference `settings.json` in `global/` is documentation, not installed. Users configure MCP via the web dashboard's copy-paste snippet (URL + token). Each user's token is different.

9. **Do NOT auto-sync skills without user action.** The MCP `claudefather_sync` tool must be explicitly called (by the user or by a skill). There is no background sync, no polling, no cron. This matches the principle of the existing sync flow where every change requires explicit confirmation.

10. **Do NOT use `pg` (node-postgres) directly.** Use `@neondatabase/serverless` with Drizzle ORM. The serverless driver works over HTTP (no TCP socket), which is required for Vercel's serverless function environment and avoids connection pooling complexity.

---
