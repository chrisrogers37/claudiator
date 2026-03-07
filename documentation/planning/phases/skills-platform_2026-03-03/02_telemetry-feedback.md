# Phase 02: Usage Telemetry & Feedback Collection

**Status:** COMPLETE
**Started:** 2026-03-04
**Completed:** 2026-03-04
**PR:** #4
**PR Title:** add usage telemetry schema, MCP tools, and feedback collection for skills platform
**Risk Level:** Medium
**Estimated Effort:** High (~3-4 days)
**Files Modified:** 3 (`packages/db/src/schema.ts`, `packages/mcp-server/src/server.ts`, `global/skills/session-handoff/SKILL.md`)
**Files Created:** ~10
**ORM:** Drizzle (NOT Prisma — Phase 01 uses Drizzle ORM with Neon serverless)

---

## Context

The claudefather maintainer is flying blind on skill adoption. With 38 skills distributed to ~20 users, there is zero visibility into which skills are actually used, which ones work well, and which are broken. Feedback today is limited to hallway conversations. This phase builds the telemetry and feedback data layer that Phase 04 (Workshop UI) and Phase 05 (Team Dashboard) will visualize. It adds database tables, MCP tools for logging invocations and collecting feedback, API endpoints for the web app, and a PostToolUse hook for automatic invocation detection -- all without capturing any sensitive content (no prompts, no code, no file paths).

---

## Dependencies

- **Depends on:** Phase 01 (Skill Registry & MCP Server) -- requires the PostgreSQL database with `users` table, the Railway-hosted MCP server, the Next.js web app with authentication, and the API token system.
- **Unlocks:** Phase 04 (Workshop -- needs telemetry data to display usage stats and feedback), Phase 05 (Team Dashboard -- needs aggregate telemetry for admin views).
- **Parallel safety:** This phase touches completely different files than Phase 03 (Skill Versioning & Sync). They can run in parallel after Phase 01 completes.

---

## Detailed Implementation Plan

### Step 1: Database Schema -- Telemetry Tables

Add two new tables to the Drizzle schema in `packages/db/src/schema.ts`. Phase 01 uses Drizzle ORM with `@neondatabase/serverless` (neon-http driver). The `sync_events` table is deferred to Phase 03 since that phase owns sync operations.

**File:** `packages/db/src/schema.ts` — add after existing table definitions:

```typescript
// skill_invocations: logs each time a skill is used in a Claude Code session
export const skillInvocations = pgTable("skill_invocations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  skillSlug: text("skill_slug").notNull(),
  skillVersion: text("skill_version"),
  invokedAt: timestamp("invoked_at", { withTimezone: true }).notNull().defaultNow(),
  sessionId: text("session_id").notNull(),
  success: boolean("success"),
  durationMs: integer("duration_ms"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
}, (table) => [
  index("idx_invocations_skill_slug").on(table.skillSlug),
  index("idx_invocations_user_id").on(table.userId),
  index("idx_invocations_session_id").on(table.sessionId),
  index("idx_invocations_invoked_at").on(table.invokedAt),
]);

// skill_feedback: end-of-session ratings and comments per skill
export const skillFeedback = pgTable("skill_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  skillSlug: text("skill_slug").notNull(),
  skillVersion: text("skill_version"),
  rating: smallint("rating").notNull(),
  comment: text("comment"),
  sessionId: text("session_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_feedback_skill_slug").on(table.skillSlug),
  index("idx_feedback_user_id").on(table.userId),
  index("idx_feedback_session_id").on(table.sessionId),
]);
```

**Why two tables instead of one:** `skill_invocations` is high-volume automated data (every skill call). `skill_feedback` is low-volume user-initiated data (end-of-session). Separating them allows different retention policies and query patterns.

**Note:** `sync_events` is created in Phase 03 (Skill Versioning & Sync) since that phase owns all sync operations.

After adding the schema, generate the migration with `npx drizzle-kit generate` from the `packages/db/` directory. Export the new tables from `packages/db/src/schema.ts` so they're available to both the MCP server and web app via `@claudefather/db/schema`.

### Step 2: MCP Telemetry Tools

Add two new tools to the Railway-hosted MCP server. Phase 01 establishes the MCP server with tool registration in `packages/mcp-server/src/server.ts`. This step adds tools to that registration.

**New file:** `packages/mcp-server/src/tools/log-invocation.ts`

```typescript
import { z } from "zod";
import { skillInvocations } from "@claudefather/db/schema";
import type { Db } from "@claudefather/db/client";

export const logInvocationSchema = z.object({
  skill_slug: z.string().describe("The skill's directory name (e.g., 'session-handoff', 'product-enhance')"),
  session_id: z.string().describe("Opaque session identifier from the Claude Code session"),
  success: z.boolean().optional().describe("Whether the skill completed successfully. Omit if unknown."),
  duration_ms: z.number().int().optional().describe("How long the skill ran in milliseconds"),
});

export type LogInvocationInput = z.infer<typeof logInvocationSchema>;

/**
 * Fire-and-forget invocation logging.
 * Returns immediately with an acknowledgment. The DB insert
 * happens asynchronously so it never blocks the Claude session.
 */
export async function handleLogInvocation(
  input: LogInvocationInput,
  db: Db,
  user: { id: string }
): Promise<string> {
  // Fire-and-forget: do NOT await this promise.
  db.insert(skillInvocations)
    .values({
      userId: user.id,
      skillSlug: input.skill_slug,
      sessionId: input.session_id,
      success: input.success ?? null,
      durationMs: input.duration_ms ?? null,
    })
    .catch((err: Error) => {
      console.error("[claudefather-mcp-server] telemetry error:", err.message);
    });

  return "Invocation logged.";
}
```

**Why fire-and-forget:** The MCP tool returns "Invocation logged." immediately. The DB insert runs asynchronously. If the database is unreachable, the error is swallowed. Telemetry must never block or fail a user's Claude session.

**Why direct DB instead of API call:** Since the MCP server is hosted on Railway (not local), it connects directly to Neon PostgreSQL — no HTTP hop to the web API needed.

**New file:** `packages/mcp-server/src/tools/session-feedback.ts`

```typescript
import { z } from "zod";
import { skillFeedback } from "@claudefather/db/schema";
import type { Db } from "@claudefather/db/client";

const ratingSchema = z.object({
  skill_slug: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

export const sessionFeedbackSchema = z.object({
  session_id: z.string().describe("The Claude Code session identifier"),
  ratings: z.array(ratingSchema).min(1).describe("Array of skill ratings from this session"),
});

export type SessionFeedbackInput = z.infer<typeof sessionFeedbackSchema>;

/**
 * Submit end-of-session feedback for skills used during the session.
 * Unlike log_invocation, this IS awaited because the user is actively
 * providing feedback and should see confirmation.
 */
export async function handleSessionFeedback(
  input: SessionFeedbackInput,
  db: Db,
  user: { id: string }
): Promise<string> {
  const records = input.ratings.map((r) => ({
    userId: user.id,
    skillSlug: r.skill_slug,
    rating: r.rating,
    comment: r.comment ? r.comment.replace(/<[^>]*>/g, "").slice(0, 1000) : null,
    sessionId: input.session_id,
  }));

  try {
    await db.insert(skillFeedback).values(records);
    return `Feedback submitted for ${records.length} skill(s). Thank you!`;
  } catch (err) {
    return `Failed to submit feedback: ${(err as Error).message}`;
  }
}
```

**Register both tools in the MCP server.** In `packages/mcp-server/src/server.ts`, add to the tool registration (using `@modelcontextprotocol/sdk`):

```typescript
import { logInvocationSchema, handleLogInvocation } from "./tools/log-invocation.js";
import { sessionFeedbackSchema, handleSessionFeedback } from "./tools/session-feedback.js";

// Inside the tool registration block (Phase 01 establishes the pattern):
// `db` is the Drizzle client, `config.user` is the authenticated user

server.tool(
  "claudefather_log_invocation",
  "Log a skill invocation for usage telemetry. Fire-and-forget -- returns immediately.",
  logInvocationSchema.shape,
  async (input) => {
    const message = await handleLogInvocation(input, db, config.user);
    return { content: [{ type: "text", text: message }] };
  }
);

server.tool(
  "claudefather_session_feedback",
  "Submit end-of-session skill ratings and feedback.",
  sessionFeedbackSchema.shape,
  async (input) => {
    const message = await handleSessionFeedback(input, db, config.user);
    return { content: [{ type: "text", text: message }] };
  }
);
```

The MCP server connects directly to Neon PostgreSQL (same database as the web app). The `db` Drizzle client and `config.user` (authenticated from API key) are passed from the `createServer(config)` function in Phase 01's `packages/mcp-server/src/server.ts`.

### Step 3: API Endpoints (Read-Only)

Add two read-only API routes to the Next.js web app for the future Dashboard (Phase 05). Write operations (logging invocations, submitting feedback) are handled exclusively by MCP tools — no duplicate write API endpoints needed since only Claude Code clients submit telemetry.

Auth pattern: Bearer token validation using `validateToken()` from `@claudefather/db/auth`, matching the Phase 01 API route pattern.

**New file:** `packages/web/src/app/api/telemetry/stats/[skillSlug]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createDb } from "@claudefather/db/client";
import { validateToken } from "@claudefather/db/auth";
import { skillInvocations, skillFeedback } from "@claudefather/db/schema";
import { eq, count, avg, desc, isNotNull, and, sql } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ skillSlug: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
  }
  const validated = await validateToken(db, authHeader.slice(7));
  if (!validated) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { skillSlug } = await params;

  const [totalInvocations, uniqueUsers, recentFeedback, avgRating] = await Promise.all([
    db.select({ count: count() })
      .from(skillInvocations)
      .where(eq(skillInvocations.skillSlug, skillSlug))
      .then((r) => r[0]?.count ?? 0),

    db.selectDistinct({ userId: skillInvocations.userId })
      .from(skillInvocations)
      .where(eq(skillInvocations.skillSlug, skillSlug))
      .then((r) => r.length),

    db.select({
      rating: skillFeedback.rating,
      comment: skillFeedback.comment,
      createdAt: skillFeedback.createdAt,
    })
      .from(skillFeedback)
      .where(eq(skillFeedback.skillSlug, skillSlug))
      .orderBy(desc(skillFeedback.createdAt))
      .limit(10),

    db.select({
      avgRating: avg(skillFeedback.rating),
      totalRatings: count(),
    })
      .from(skillFeedback)
      .where(eq(skillFeedback.skillSlug, skillSlug))
      .then((r) => r[0]),
  ]);

  return NextResponse.json({
    skill_slug: skillSlug,
    total_invocations: totalInvocations,
    unique_users: uniqueUsers,
    avg_rating: avgRating?.avgRating ? Number(Number(avgRating.avgRating).toFixed(1)) : null,
    total_ratings: avgRating?.totalRatings ?? 0,
    recent_feedback: recentFeedback,
  });
}
```

**New file:** `packages/web/src/app/api/telemetry/overview/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createDb } from "@claudefather/db/client";
import { validateToken } from "@claudefather/db/auth";
import { skillInvocations, skillFeedback } from "@claudefather/db/schema";
import { count, desc, gte, avg, sql } from "drizzle-orm";

const db = createDb(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Bearer token" }, { status: 401 });
  }
  const validated = await validateToken(db, authHeader.slice(7));
  if (!validated) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [topSkills, totalInvocations30d, activeUsers30d, lowestRated] = await Promise.all([
    db.select({
      skillSlug: skillInvocations.skillSlug,
      invocationCount: count(),
    })
      .from(skillInvocations)
      .where(gte(skillInvocations.invokedAt, thirtyDaysAgo))
      .groupBy(skillInvocations.skillSlug)
      .orderBy(desc(count()))
      .limit(10),

    db.select({ count: count() })
      .from(skillInvocations)
      .where(gte(skillInvocations.invokedAt, thirtyDaysAgo))
      .then((r) => r[0]?.count ?? 0),

    db.selectDistinct({ userId: skillInvocations.userId })
      .from(skillInvocations)
      .where(gte(skillInvocations.invokedAt, thirtyDaysAgo))
      .then((r) => r.length),

    db.select({
      skillSlug: skillFeedback.skillSlug,
      avgRating: avg(skillFeedback.rating),
      ratingCount: count(),
    })
      .from(skillFeedback)
      .groupBy(skillFeedback.skillSlug)
      .having(sql`count(*) >= 3`)
      .orderBy(avg(skillFeedback.rating))
      .limit(5),
  ]);

  return NextResponse.json({
    period: "30d",
    total_invocations: totalInvocations30d,
    active_users: activeUsers30d,
    top_skills: topSkills.map((s) => ({
      skill_slug: s.skillSlug,
      invocation_count: s.invocationCount,
    })),
    lowest_rated: lowestRated,
  });
}
```

**Removed from plan:** `POST /api/telemetry/invocation` and `POST /api/telemetry/feedback` write endpoints. The MCP tools (`claudefather_log_invocation`, `claudefather_session_feedback`) handle all write operations directly to the database. No need for duplicate write paths since only Claude Code clients submit telemetry.

### Step 4: PostToolUse Hook for Automatic Invocation Detection

This is the key design decision: rather than modifying every SKILL.md to call `claudefather_log_invocation`, use a PostToolUse hook that detects skill invocations automatically.

**How it works:** Claude Code's hook system provides a `PostToolUse` event with `tool_name`, `tool_input`, and `session_id` on stdin. When `tool_name` is `"Skill"`, the `tool_input` contains the skill name being invoked. The hook detects this and calls the MCP telemetry tool.

**However**, there is a critical constraint: hooks are shell scripts. They cannot call MCP tools directly. A hook can only return JSON to Claude Code; it cannot invoke `claudefather_log_invocation` on its own. Two approaches are viable:

**Approach A (Recommended): Hook writes to a local log file, MCP tool reads it.**

The PostToolUse hook appends skill invocations to a local file (`/tmp/claudefather-session-telemetry.jsonl`). At session end (during `/session-handoff`), the MCP `claudefather_log_invocation` tool is called for each entry. This is simple, reliable, and does not require the hook to make network calls.

**Approach B: Hook calls the API directly via curl.**

The hook uses `curl` to POST directly to the API, bypassing MCP entirely. This is simpler architecturally but couples the hook to the API URL and auth token, and `curl` latency could slow tool execution.

**Decision: Approach A.** The hook writes locally; the session-handoff skill submits the batch. This keeps the hook fast (just a file append) and the network call in the right place (the MCP tool).

**New file:** `global/hooks/posttooluse-telemetry.sh`

```bash
#!/usr/bin/env bash
# PostToolUse telemetry hook for Claude Code
#
# Detects skill invocations and logs them to a session-local JSONL file.
# The /session-handoff skill reads this file and submits telemetry
# via the claudefather_log_invocation MCP tool.
#
# This hook ONLY logs Skill tool invocations. All other tools are ignored.
# No prompt content, code, or file paths are captured.

set -eo pipefail

command -v jq &>/dev/null || exit 0

INPUT=$(cat)

# Extract fields -- single jq call
RESULT=$(printf '%s' "$INPUT" | jq -r '
  if .tool_name != "Skill" then "skip"
  else
    (.tool_input.skill // .tool_input.name // "unknown") + "\t" +
    (.session_id // "unknown") + "\t" +
    (if .tool_response.success == true then "true"
     elif .tool_response.success == false then "false"
     else "null" end)
  end
' 2>/dev/null) || exit 0

[ "$RESULT" = "skip" ] && exit 0

IFS=$'\t' read -r SKILL_SLUG SESSION_ID SUCCESS <<< "$RESULT"

# Append to session telemetry file (JSONL format)
TELEMETRY_FILE="/tmp/claudefather-telemetry-${SESSION_ID}.jsonl"

printf '{"skill_slug":"%s","session_id":"%s","success":%s,"invoked_at":"%s"}\n' \
  "$SKILL_SLUG" "$SESSION_ID" "$SUCCESS" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  >> "$TELEMETRY_FILE" 2>/dev/null

exit 0
```

**Why not modify every SKILL.md:** There are 38 skills. Adding telemetry instructions to each one is a maintenance burden, creates drift risk, and requires every skill author to remember the pattern. The hook approach is zero-touch for skill authors.

**Why the Skill tool_name check:** PostToolUse fires for every tool call (Bash, Read, Write, etc.). We only care about Skill invocations. Checking `tool_name == "Skill"` filters to exactly what we need.

**Privacy:** The hook captures only: skill name (from tool_input), session_id, and success boolean. No prompt content, no file paths, no code snippets, no command output.

### Step 5: Hook Registration in Settings

Add the PostToolUse telemetry hook to `global/settings.json`. Insert alongside the existing `PostToolUse` auto-format hook.

**File:** `global/settings.json` (at `/Users/chris/Projects/claudefather/global/settings.json`)

**Before** (lines 44-55):

```json
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/auto-format.sh"
          }
        ]
      }
    ],
```

**After:**

```json
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/auto-format.sh"
          }
        ]
      },
      {
        "matcher": "Skill",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/posttooluse-telemetry.sh"
          }
        ]
      }
    ],
```

The `matcher: "Skill"` ensures the telemetry hook only fires for Skill tool invocations, not for every tool call. This is critical for performance -- the auto-format hook fires on Write/Edit, the telemetry hook fires on Skill, and neither fires unnecessarily.

### Step 6: Update Session Handoff to Submit Telemetry and Collect Feedback

Modify `/session-handoff` to add two new steps between the existing Step 3 (Changelog) and Step 4 (Write Handoff File).

**File:** `global/skills/session-handoff/SKILL.md` (at `/Users/chris/Projects/claudefather/global/skills/session-handoff/SKILL.md`)

**Changes to YAML frontmatter:** Add MCP tool permissions to `allowed-tools`:

**Before:**

```yaml
allowed-tools: Bash(git *), Bash(gh *), Bash(ls *), Bash(wc *), Bash(date *), Read, Write, Edit, Glob, Grep
```

**After:**

```yaml
allowed-tools: Bash(git *), Bash(gh *), Bash(ls *), Bash(wc *), Bash(date *), Bash(cat *), Read, Write, Edit, Glob, Grep, mcp__claudefather__claudefather_log_invocation, mcp__claudefather__claudefather_session_feedback
```

Note: `Bash(cat *)` is added because the hook reads the telemetry JSONL file. The MCP tool names use the `mcp__<server>__<tool>` format that Claude Code requires for `allowed-tools` patterns matching MCP tools. The server name `claudefather` comes from the `mcpServers` key in settings.json (Phase 01 establishes this).

**Add new Step 3.5: Submit Telemetry** (insert between current Step 3 and Step 4):

```markdown
## Step 3.5: Submit Telemetry

Check if the claudefather MCP server is available by checking if the
`claudefather_log_invocation` tool exists. If it does not, skip this step silently.

Read the session telemetry file:
- Determine session_id from the current session (available in hook events, or use
  a fallback: `date +%Y%m%d%H%M%S` combined with a random suffix)
- Read `/tmp/claudefather-telemetry-<session_id>.jsonl` if it exists
- Parse each line as a JSON object

For each invocation record, call `claudefather_log_invocation` with:
- `skill_slug`: from the record
- `session_id`: from the record
- `success`: from the record (may be null)

Make all calls in parallel (fire-and-forget). Do not wait for responses.
Do not report telemetry results to the user -- this is silent background work.

If the file does not exist or is empty, skip silently.
```

**Add new Step 3.6: Collect Feedback** (insert after Step 3.5):

```markdown
## Step 3.6: Collect Feedback (Optional)

If the telemetry file from Step 3.5 contained skill invocations, present the
skills used in this session and ask for quick feedback:

```
Skills used this session:
  1. product-enhance
  2. review-pr
  3. session-handoff

Rate any skills? (1-5, or skip)
Format: <number> <rating> [comment]
Example: 1 4 "worked great but slow"
Or just: skip
```

Parse the user's response. If they provide ratings:
- Call `claudefather_session_feedback` with the session_id and ratings array
- Confirm: "Feedback submitted. Thanks!"

If the user says "skip" or provides no input within one prompt, move on immediately.
This step gets ONE prompt -- never ask follow-up questions about feedback.

If the claudefather MCP server is not available, skip this step silently.
```

**Update the Rules section** to add:

```markdown
- **Telemetry is silent.** Never show telemetry submission details to the user. If MCP is unavailable, skip without comment.
- **Feedback gets one prompt.** Ask once, accept the answer, move on.
```

### Step 7: Update Install/Setup/Sync for PostToolUse Hook

Following the same pattern as the PreToolUse hook (documented in archive Phase 02), add a check for the new PostToolUse telemetry hook in:

1. `install.sh` -- after the PreToolUse check (around line 286), add a check for `hooks.PostToolUse` containing the telemetry matcher. If `PostToolUse` exists but has no Skill matcher, offer to add it.

2. `.claude/commands/claudefather-setup.md` -- in the settings defaults section, add a check for the PostToolUse telemetry hook alongside the PreToolUse check.

3. `global/commands/claudefather-sync.md` -- same pattern as setup.

The check should be:

```bash
# Check if PostToolUse telemetry hook is configured
if jq -e '.hooks.PostToolUse' "$SETTINGS" >/dev/null 2>&1; then
    if ! jq -e '.hooks.PostToolUse[] | select(.matcher == "Skill")' "$SETTINGS" >/dev/null 2>&1; then
        # Offer to add telemetry hook
        echo "PostToolUse telemetry hook: auto-log skill invocations for usage tracking"
        echo "  + hooks.PostToolUse[Skill] → logs skill usage to local file for telemetry"
    fi
fi
```

### Step 8: Shared Telemetry Instruction Block (Optional Enhancement)

For skills that want to report more detailed telemetry (duration, custom metadata), create a shared reference that skill authors can opt into.

**New file:** `global/skills/_shared/telemetry-instructions.md`

```markdown
# Telemetry Reporting (Optional)

Skills can report detailed telemetry beyond what the PostToolUse hook captures
automatically. The hook logs skill name, session_id, and success/failure. For
additional data (duration, custom metadata), call the MCP tool directly.

## When to Use Explicit Telemetry

- The skill has measurable duration (e.g., build time, deploy time)
- The skill wants to report granular success (partial success, specific error category)
- The skill has custom metadata worth tracking

## How to Add

Add to the skill's `allowed-tools` YAML:
```
mcp__claudefather__claudefather_log_invocation
```

At the end of the skill's final step, add:
```
If the `claudefather_log_invocation` MCP tool is available, call it with:
- skill_slug: "<this-skill-name>"
- session_id: use the session_id from the current session context
- success: true/false based on the skill's outcome
- duration_ms: elapsed time from skill start to completion

If the MCP tool is not available, skip this silently.
```

## Important

- NEVER block on telemetry. If MCP is unavailable, skip without error.
- NEVER capture prompt content, code, or file paths in telemetry.
- The PostToolUse hook already captures basic invocation data automatically.
  Explicit telemetry is only needed for duration and custom metadata.
```

This file is a reference -- skill authors read it if they want to add detailed telemetry. It does not need to be added to existing skills in this phase.

### Step 9: MCP Server Permission Category

Add a new permission category to `global/recommended-permissions.json` for users who opt into the claudefather MCP server.

**File:** `global/recommended-permissions.json` (at `/Users/chris/Projects/claudefather/global/recommended-permissions.json`)

Add after the `"sandbox-extensions"` category (before the closing `]`):

```json
    {
      "id": "claudefather-mcp",
      "name": "Claudefather Platform",
      "description": "MCP tool permissions for the claudefather skills platform (telemetry, feedback, sync).",
      "default": false,
      "permissions": [
        "mcp__claudefather__claudefather_log_invocation",
        "mcp__claudefather__claudefather_session_feedback",
        "mcp__claudefather__claudefather_sync",
        "mcp__claudefather__claudefather_check_updates"
      ]
    }
```

Note: `claudefather_sync` and `claudefather_check_updates` are Phase 01 tools. Including them here ensures the permission category covers all MCP tools in one opt-in.

---

## Test Plan

### Unit Tests

**New file:** `packages/mcp-server/src/tools/__tests__/log-invocation.test.ts`

1. **Valid invocation log** -- call `handleLogInvocation` with all fields, verify DB insert is called with correct values
2. **Minimal invocation log** -- call with only required fields (skill_slug, session_id), verify optional fields default to null
3. **DB failure** -- mock DB insert to reject, verify function returns acknowledgment (does not throw)
4. **Fire-and-forget semantics** -- verify the function returns before DB insert completes

**New file:** `packages/mcp-server/src/tools/__tests__/session-feedback.test.ts`

1. **Valid feedback submission** -- call with session_id and ratings array, verify DB insert with correct values
2. **Invalid rating value** -- rating of 0 or 6 should be rejected by zod schema
3. **Empty ratings array** -- should be rejected by zod schema (min 1)
4. **Comment sanitization** -- HTML tags stripped, length capped at 1000 characters
5. **DB failure** -- mock DB insert to reject, verify error message returned (not thrown)

### API Endpoint Tests (Read-Only)

**New file:** `packages/web/src/app/api/telemetry/__tests__/stats.test.ts`

1. **Unauthenticated request** -- 401 response
2. **Returns correct aggregations** -- seed DB, verify counts, averages, unique users
3. **Empty skill** -- no invocations, returns zeros/nulls
4. **Privacy** -- verify userId is NOT included in feedback response

**New file:** `packages/web/src/app/api/telemetry/__tests__/overview.test.ts`

1. **Unauthenticated request** -- 401 response
2. **Returns top skills** -- seed DB with varied invocation counts
3. **30-day window** -- old invocations excluded from counts
4. **Active users count** -- deduplicated by userId

### Hook Tests

Manual verification (hooks are shell scripts):

1. **Skill invocation detected:**
   ```bash
   echo '{"tool_name":"Skill","tool_input":{"skill":"product-enhance"},"session_id":"test123","tool_response":{"success":true}}' | ~/.claude/hooks/posttooluse-telemetry.sh
   cat /tmp/claudefather-telemetry-test123.jsonl
   ```
   Expected: one JSONL line with skill_slug, session_id, success, invoked_at

2. **Non-Skill tool ignored:**
   ```bash
   echo '{"tool_name":"Bash","tool_input":{"command":"git status"},"session_id":"test123"}' | ~/.claude/hooks/posttooluse-telemetry.sh
   ```
   Expected: no output, no file written

3. **Missing jq:** Rename jq temporarily, verify hook exits 0 silently

4. **Performance:** `time` the hook -- target < 10ms (just a jq parse and file append)

### Integration Test (Manual)

1. Start a Claude Code session with the claudefather MCP server configured
2. Run `/product-enhance` (or any skill)
3. Run `/session-handoff`
4. Verify: telemetry file created at `/tmp/claudefather-telemetry-<session_id>.jsonl`
5. Verify: session-handoff offered feedback prompt
6. Provide a rating
7. Check API: `GET /api/telemetry/stats/product-enhance` returns the invocation and feedback

---

## Documentation Updates

### CHANGELOG.md

Add under `[Unreleased]`:

```markdown
### Added
- **Usage telemetry schema** — Two new Drizzle tables: `skill_invocations` (per-invocation logging) and `skill_feedback` (end-of-session ratings). Indexed for Workshop and Dashboard queries. `sync_events` deferred to Phase 03.
- **`claudefather_log_invocation` MCP tool** — Fire-and-forget skill invocation logging. Called by the PostToolUse hook or explicitly by skills that want to report duration/metadata.
- **`claudefather_session_feedback` MCP tool** — End-of-session skill ratings (1-5) with optional comments.
- **PostToolUse telemetry hook** — `posttooluse-telemetry.sh` automatically detects Skill tool invocations and logs them to a session-local JSONL file. Zero-touch for skill authors — no SKILL.md changes needed.
- **Telemetry API endpoints (read-only)** — GET `/api/telemetry/stats/:skillSlug`, GET `/api/telemetry/overview`. Write operations handled exclusively by MCP tools.
- **Claudefather Platform permission category** — New opt-in category in `recommended-permissions.json` for MCP tool auto-approval.

### Changed
- **`/session-handoff` telemetry integration** — New Steps 3.5 (submit telemetry) and 3.6 (collect feedback) between changelog and handoff file writing. Telemetry submission is silent; feedback collection is one-prompt opt-in.
```

### README.md

No changes needed in this phase. The MCP server and platform features are documented when Phase 01 ships; this phase adds backend capabilities only.

---

## Stress Testing & Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| MCP server not configured | Telemetry hook writes to local file; session-handoff skips MCP calls silently |
| MCP server configured but Railway down | `handleLogInvocation` swallows error; session-handoff reports "could not submit" but does not fail |
| Very long session (100+ skill invocations) | JSONL file grows linearly; batch submission handles all entries |
| Concurrent sessions (worktrees) | Each session has unique session_id; telemetry files are per-session (`/tmp/claudefather-telemetry-<session_id>.jsonl`) |
| User declines MCP permission | MCP tools not available; hook still writes local file but session-handoff cannot submit |
| Skill invocation with no tool_response | success defaults to null |
| Malformed hook input (missing fields) | jq returns "skip"; hook exits 0 silently |
| Session crash (no handoff) | Telemetry JSONL stays in /tmp; data lost unless a future session reads orphan files |
| Feedback comment with SQL injection attempt | Drizzle parameterized queries prevent injection; HTML stripped by MCP tool |
| Rating value manipulation (negative, >5) | Schema validation rejects at API layer; zod rejects at MCP tool layer |
| High-frequency invocations (rate abuse) | No rate limiting in Phase 02; consider rate limiting in Phase 04 or Phase 05 |

### Performance Considerations

- **PostToolUse hook latency:** < 10ms (single jq call + file append). No network I/O.
- **MCP tool latency:** Drizzle `db.insert().values()` -- single DB round trip even for 50+ invocations.
- **Stats endpoint:** Four parallel Drizzle queries. For a team of 20 users, table sizes will be small (thousands of rows). No query optimization needed until hundreds of thousands of rows.
- **JSONL cleanup:** Telemetry files in `/tmp` are cleaned by OS temp file cleanup. No manual retention policy needed.

---

## Verification Checklist

- [ ] Drizzle schema adds `skill_invocations` and `skill_feedback` tables (sync_events deferred to Phase 03)
- [ ] Migration generated via `drizzle-kit generate`
- [ ] `claudefather_log_invocation` MCP tool registered and returns immediately
- [ ] `claudefather_session_feedback` MCP tool registered and awaits response
- [ ] GET `/api/telemetry/stats/:skillSlug` returns correct aggregations (Drizzle queries)
- [ ] GET `/api/telemetry/overview` returns 30-day window stats (Drizzle queries)
- [ ] Both read endpoints return 401 for unauthenticated requests (Bearer token validation)
- [ ] `posttooluse-telemetry.sh` logs Skill invocations to JSONL
- [ ] `posttooluse-telemetry.sh` ignores non-Skill tool calls
- [ ] `posttooluse-telemetry.sh` exits cleanly when jq is missing
- [ ] `global/settings.json` includes PostToolUse Skill matcher
- [ ] `/session-handoff` reads telemetry JSONL and submits via MCP
- [ ] `/session-handoff` prompts for feedback (one prompt only)
- [ ] `/session-handoff` skips telemetry/feedback silently if MCP unavailable
- [ ] `recommended-permissions.json` includes `claudefather-mcp` category
- [ ] install.sh/setup/sync offer PostToolUse telemetry hook to existing users
- [ ] No prompt content, code, or file paths captured in telemetry
- [ ] Feedback comments stripped of HTML, capped at 1000 chars
- [ ] All tests pass
- [ ] CHANGELOG.md updated

---

## What NOT to Do

1. **Do NOT modify individual SKILL.md files to add telemetry calls.** The PostToolUse hook handles invocation detection automatically. Only skills that need duration/metadata should opt into explicit telemetry.

2. **Do NOT capture prompt content, code snippets, or file paths in telemetry.** Only: skill name, version, timestamp, success, duration. This is a hard privacy boundary.

3. **Do NOT build telemetry visualization.** That is Phase 04 (Workshop) and Phase 05 (Dashboard). This phase builds the data collection layer only.

4. **Do NOT add rate limiting or abuse protection.** Team-internal with 20 users. Rate limiting is a Phase 04/05 concern if needed.

5. **Do NOT make telemetry submission blocking.** The `handleLogInvocation` function must return immediately. Never `await` the fetch call. If the API is down, lose the data silently.

6. **Do NOT use the deprecated `Bash(cmd:*)` colon syntax** in `allowed-tools`. Always use `Bash(cmd *)` space syntax.

7. **Do NOT add an opt-out mechanism in this phase.** The team is 20 users managed by one maintainer. Opt-out complexity is unnecessary. If users don't configure the MCP server, telemetry is not collected.

8. **Do NOT build automatic skill quality scoring.** This phase collects raw data. Intelligence and scoring are Phase 06.

9. **Do NOT use `&&` or `|` in the PostToolUse hook.** Follow the same shell operator restrictions as all other hooks.

10. **Do NOT overwrite `~/.claude/settings.json` during hook installation.** The install/setup/sync mechanisms handle targeted key insertion. Never replace the full file.

---
