# Phase 02: Usage Telemetry & Feedback Collection

**Status:** PENDING
**PR Title:** add usage telemetry schema, MCP tools, and feedback collection for skills platform
**Risk Level:** Medium
**Estimated Effort:** High (~3-4 days)
**Files Modified:** 3 (`packages/claudefather-mcp/src/index.ts`, `packages/web/src/app/api/...`, `global/skills/session-handoff/SKILL.md`)
**Files Created:** 14

---

## Context

The claudefather maintainer is flying blind on skill adoption. With 38 skills distributed to ~20 users, there is zero visibility into which skills are actually used, which ones work well, and which are broken. Feedback today is limited to hallway conversations. This phase builds the telemetry and feedback data layer that Phase 04 (Workshop UI) and Phase 05 (Team Dashboard) will visualize. It adds database tables, MCP tools for logging invocations and collecting feedback, API endpoints for the web app, and a PostToolUse hook for automatic invocation detection -- all without capturing any sensitive content (no prompts, no code, no file paths).

---

## Dependencies

- **Depends on:** Phase 01 (Skill Registry & MCP Server) -- requires the PostgreSQL database with `users` table, the `claudefather-mcp` npm package, the Next.js web app with authentication, and the API token system.
- **Unlocks:** Phase 04 (Workshop -- needs telemetry data to display usage stats and feedback), Phase 05 (Team Dashboard -- needs aggregate telemetry for admin views).
- **Parallel safety:** This phase touches completely different files than Phase 03 (Intelligence Pipeline). They can run in parallel after Phase 01 completes.

---

## Detailed Implementation Plan

### Step 1: Database Migrations -- Telemetry Tables

Create three new database migration files. Phase 01 establishes the migration framework (assumed: Prisma or raw SQL migrations in `packages/web/prisma/migrations/` or `packages/db/migrations/`). This phase adds migrations that run after the Phase 01 `users` and `skills` tables exist.

**New file:** `packages/web/prisma/migrations/<timestamp>_add_telemetry_tables/migration.sql`

```sql
-- skill_invocations: logs each time a skill is used in a Claude Code session
CREATE TABLE skill_invocations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_slug      TEXT NOT NULL,
    skill_version   TEXT,              -- nullable: version unknown for unregistered skills
    invoked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    session_id      TEXT NOT NULL,     -- opaque string, groups invocations in one Claude session
    success         BOOLEAN,           -- null if unknown (fire-and-forget, no result yet)
    duration_ms     INTEGER,           -- optional: how long the skill ran
    metadata        JSONB DEFAULT '{}' -- extensibility: future fields without schema changes
);

-- Index for querying by skill (Phase 04 Workshop stats)
CREATE INDEX idx_invocations_skill_slug ON skill_invocations(skill_slug);
-- Index for querying by user (Phase 05 Dashboard)
CREATE INDEX idx_invocations_user_id ON skill_invocations(user_id);
-- Index for querying by session (feedback correlation)
CREATE INDEX idx_invocations_session_id ON skill_invocations(session_id);
-- Index for time-range queries (dashboard date filters)
CREATE INDEX idx_invocations_invoked_at ON skill_invocations(invoked_at);

-- sync_events: logs each time a user syncs skills from the registry
CREATE TABLE sync_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    skills_updated  TEXT[] DEFAULT '{}',
    skills_added    TEXT[] DEFAULT '{}',
    skills_removed  TEXT[] DEFAULT '{}',
    from_version    TEXT,              -- git commit hash or registry version before sync
    to_version      TEXT               -- git commit hash or registry version after sync
);

CREATE INDEX idx_sync_events_user_id ON sync_events(user_id);
CREATE INDEX idx_sync_events_synced_at ON sync_events(synced_at);

-- skill_feedback: end-of-session ratings and comments per skill
CREATE TABLE skill_feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_slug      TEXT NOT NULL,
    skill_version   TEXT,
    rating          SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment         TEXT,              -- optional free-text, user-authored
    session_id      TEXT NOT NULL,     -- correlates with skill_invocations
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_skill_slug ON skill_feedback(skill_slug);
CREATE INDEX idx_feedback_user_id ON skill_feedback(user_id);
CREATE INDEX idx_feedback_session_id ON skill_feedback(session_id);
```

**Why three tables instead of one:** `skill_invocations` is high-volume automated data (every skill call). `skill_feedback` is low-volume user-initiated data (end-of-session). `sync_events` tracks distribution events. Separating them allows different retention policies and query patterns.

**Update Prisma schema** (if Phase 01 uses Prisma): Add corresponding model definitions in `packages/web/prisma/schema.prisma`:

```prisma
model SkillInvocation {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  skillSlug    String   @map("skill_slug")
  skillVersion String?  @map("skill_version")
  invokedAt    DateTime @default(now()) @map("invoked_at") @db.Timestamptz
  sessionId    String   @map("session_id")
  success      Boolean?
  durationMs   Int?     @map("duration_ms")
  metadata     Json     @default("{}")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([skillSlug])
  @@index([userId])
  @@index([sessionId])
  @@index([invokedAt])
  @@map("skill_invocations")
}

model SyncEvent {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId        String   @map("user_id") @db.Uuid
  syncedAt      DateTime @default(now()) @map("synced_at") @db.Timestamptz
  skillsUpdated String[] @map("skills_updated")
  skillsAdded   String[] @map("skills_added")
  skillsRemoved String[] @map("skills_removed")
  fromVersion   String?  @map("from_version")
  toVersion     String?  @map("to_version")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([syncedAt])
  @@map("sync_events")
}

model SkillFeedback {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  skillSlug    String   @map("skill_slug")
  skillVersion String?  @map("skill_version")
  rating       Int      @db.SmallInt
  comment      String?
  sessionId    String   @map("session_id")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([skillSlug])
  @@index([userId])
  @@index([sessionId])
  @@map("skill_feedback")
}
```

Also add the reverse relations to the `User` model (defined in Phase 01):

```prisma
model User {
  // ... existing Phase 01 fields ...
  invocations  SkillInvocation[]
  syncEvents   SyncEvent[]
  feedback     SkillFeedback[]
}
```

### Step 2: MCP Telemetry Tools

Add two new tools to the `claudefather-mcp` package. Phase 01 establishes the MCP server with tool registration in `packages/claudefather-mcp/src/index.ts` (or equivalent entry point). This step adds tools to that registration.

**New file:** `packages/claudefather-mcp/src/tools/log-invocation.ts`

```typescript
import { z } from "zod";

export const logInvocationSchema = z.object({
  skill_slug: z.string().describe("The skill's directory name (e.g., 'session-handoff', 'product-enhance')"),
  session_id: z.string().describe("Opaque session identifier from the Claude Code session"),
  success: z.boolean().optional().describe("Whether the skill completed successfully. Omit if unknown."),
  duration_ms: z.number().int().optional().describe("How long the skill ran in milliseconds"),
});

export type LogInvocationInput = z.infer<typeof logInvocationSchema>;

/**
 * Fire-and-forget invocation logging.
 * Returns immediately with an acknowledgment. The actual API call
 * happens asynchronously so it never blocks the Claude session.
 */
export async function handleLogInvocation(
  input: LogInvocationInput,
  apiBaseUrl: string,
  apiKey: string
): Promise<string> {
  // Fire-and-forget: do NOT await this promise.
  // The caller (tool handler) should call this and return immediately.
  fetch(`${apiBaseUrl}/api/telemetry/invocation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      skill_slug: input.skill_slug,
      session_id: input.session_id,
      success: input.success ?? null,
      duration_ms: input.duration_ms ?? null,
    }),
  }).catch((err) => {
    // Silently swallow errors -- telemetry must never break the session
    console.error("[claudefather-mcp] telemetry error:", err.message);
  });

  return "Invocation logged.";
}
```

**Why fire-and-forget:** The MCP tool returns "Invocation logged." immediately. The HTTP request to the API runs asynchronously. If the API is down, the error is swallowed. Telemetry must never block or fail a user's Claude session.

**New file:** `packages/claudefather-mcp/src/tools/session-feedback.ts`

```typescript
import { z } from "zod";

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
  apiBaseUrl: string,
  apiKey: string
): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/telemetry/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      session_id: input.session_id,
      ratings: input.ratings,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return `Failed to submit feedback (${response.status}): ${body}`;
  }

  const result = await response.json();
  return `Feedback submitted for ${result.count} skill(s). Thank you!`;
}
```

**Register both tools in the MCP server entry point.** In `packages/claudefather-mcp/src/index.ts`, add to the tool registration (the exact pattern depends on Phase 01's MCP framework choice -- likely `@modelcontextprotocol/sdk`):

```typescript
import { logInvocationSchema, handleLogInvocation } from "./tools/log-invocation.js";
import { sessionFeedbackSchema, handleSessionFeedback } from "./tools/session-feedback.js";

// Inside the tool registration block (Phase 01 establishes the pattern):

server.tool(
  "claudefather_log_invocation",
  "Log a skill invocation for usage telemetry. Fire-and-forget -- returns immediately.",
  logInvocationSchema.shape,
  async (input) => {
    const message = await handleLogInvocation(input, API_BASE_URL, API_KEY);
    return { content: [{ type: "text", text: message }] };
  }
);

server.tool(
  "claudefather_session_feedback",
  "Submit end-of-session skill ratings and feedback.",
  sessionFeedbackSchema.shape,
  async (input) => {
    const message = await handleSessionFeedback(input, API_BASE_URL, API_KEY);
    return { content: [{ type: "text", text: message }] };
  }
);
```

`API_BASE_URL` and `API_KEY` come from environment variables set in the MCP server config (Phase 01 establishes `CLAUDEFATHER_API_KEY`; add `CLAUDEFATHER_API_URL` defaulting to the production URL).

### Step 3: API Endpoints

Add four API route files to the Next.js web app (Phase 01 establishes the app structure).

**New file:** `packages/web/src/app/api/telemetry/invocation/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth"; // Phase 01 auth utility
import { prisma } from "@/lib/prisma"; // Phase 01 Prisma client

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Support both single invocation and batch (array) format
  const invocations = Array.isArray(body) ? body : [body];

  // Validate each entry
  for (const inv of invocations) {
    if (!inv.skill_slug || !inv.session_id) {
      return NextResponse.json(
        { error: "skill_slug and session_id are required" },
        { status: 400 }
      );
    }
  }

  // Batch insert
  const records = invocations.map((inv) => ({
    userId: user.id,
    skillSlug: inv.skill_slug,
    skillVersion: inv.skill_version ?? null,
    sessionId: inv.session_id,
    success: inv.success ?? null,
    durationMs: inv.duration_ms ?? null,
    metadata: inv.metadata ?? {},
  }));

  const result = await prisma.skillInvocation.createMany({ data: records });

  return NextResponse.json({ count: result.count }, { status: 201 });
}
```

**New file:** `packages/web/src/app/api/telemetry/feedback/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { session_id, ratings } = body;

  if (!session_id || !Array.isArray(ratings) || ratings.length === 0) {
    return NextResponse.json(
      { error: "session_id and non-empty ratings array required" },
      { status: 400 }
    );
  }

  // Validate ratings
  for (const r of ratings) {
    if (!r.skill_slug || typeof r.rating !== "number" || r.rating < 1 || r.rating > 5) {
      return NextResponse.json(
        { error: `Invalid rating for ${r.skill_slug}: must be 1-5` },
        { status: 400 }
      );
    }
    // Sanitize comment: strip HTML, limit length
    if (r.comment && typeof r.comment === "string") {
      r.comment = r.comment.replace(/<[^>]*>/g, "").slice(0, 1000);
    }
  }

  const records = ratings.map((r: { skill_slug: string; rating: number; comment?: string }) => ({
    userId: user.id,
    skillSlug: r.skill_slug,
    rating: r.rating,
    comment: r.comment ?? null,
    sessionId: session_id,
  }));

  const result = await prisma.skillFeedback.createMany({ data: records });

  return NextResponse.json({ count: result.count }, { status: 201 });
}
```

**New file:** `packages/web/src/app/api/telemetry/stats/[skillSlug]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { skillSlug: string } }
) {
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { skillSlug } = params;

  // Parallel queries for efficiency
  const [totalInvocations, uniqueUsers, successRate, avgDuration, recentFeedback, avgRating] =
    await Promise.all([
      // Total invocations (all time)
      prisma.skillInvocation.count({ where: { skillSlug } }),

      // Unique users (all time)
      prisma.skillInvocation.groupBy({
        by: ["userId"],
        where: { skillSlug },
      }).then((groups) => groups.length),

      // Success rate (where success is not null)
      prisma.skillInvocation
        .aggregate({
          where: { skillSlug, success: { not: null } },
          _count: { success: true },
        })
        .then(async (total) => {
          const successes = await prisma.skillInvocation.count({
            where: { skillSlug, success: true },
          });
          const totalKnown = total._count.success;
          return totalKnown > 0 ? Math.round((successes / totalKnown) * 100) : null;
        }),

      // Average duration (where duration is not null)
      prisma.skillInvocation.aggregate({
        where: { skillSlug, durationMs: { not: null } },
        _avg: { durationMs: true },
      }).then((r) => r._avg.durationMs ? Math.round(r._avg.durationMs) : null),

      // Recent feedback (last 10)
      prisma.skillFeedback.findMany({
        where: { skillSlug },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          rating: true,
          comment: true,
          createdAt: true,
          // Do NOT include userId -- privacy
        },
      }),

      // Average rating
      prisma.skillFeedback.aggregate({
        where: { skillSlug },
        _avg: { rating: true },
        _count: { rating: true },
      }),
    ]);

  return NextResponse.json({
    skill_slug: skillSlug,
    total_invocations: totalInvocations,
    unique_users: uniqueUsers,
    success_rate_percent: successRate,
    avg_duration_ms: avgDuration,
    avg_rating: avgRating._avg.rating ? Number(avgRating._avg.rating.toFixed(1)) : null,
    total_ratings: avgRating._count.rating,
    recent_feedback: recentFeedback,
  });
}
```

**New file:** `packages/web/src/app/api/telemetry/overview/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [topSkills, totalInvocations30d, activeUsers30d, recentSyncs, lowestRated] =
    await Promise.all([
      // Top 10 skills by invocation count (last 30 days)
      prisma.skillInvocation.groupBy({
        by: ["skillSlug"],
        where: { invokedAt: { gte: thirtyDaysAgo } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),

      // Total invocations last 30 days
      prisma.skillInvocation.count({
        where: { invokedAt: { gte: thirtyDaysAgo } },
      }),

      // Active users last 30 days
      prisma.skillInvocation.groupBy({
        by: ["userId"],
        where: { invokedAt: { gte: thirtyDaysAgo } },
      }).then((groups) => groups.length),

      // Recent sync events (last 10)
      prisma.syncEvent.findMany({
        orderBy: { syncedAt: "desc" },
        take: 10,
        include: { user: { select: { id: true } } },
      }),

      // Skills with lowest average rating (minimum 3 ratings)
      prisma.$queryRaw`
        SELECT skill_slug, AVG(rating) as avg_rating, COUNT(*) as rating_count
        FROM skill_feedback
        GROUP BY skill_slug
        HAVING COUNT(*) >= 3
        ORDER BY avg_rating ASC
        LIMIT 5
      `,
    ]);

  return NextResponse.json({
    period: "30d",
    total_invocations: totalInvocations30d,
    active_users: activeUsers30d,
    top_skills: topSkills.map((s) => ({
      skill_slug: s.skillSlug,
      invocation_count: s._count.id,
    })),
    recent_syncs: recentSyncs.map((s) => ({
      synced_at: s.syncedAt,
      skills_updated: s.skillsUpdated.length,
      skills_added: s.skillsAdded.length,
      skills_removed: s.skillsRemoved.length,
    })),
    lowest_rated: lowestRated,
  });
}
```

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

**New file:** `packages/claudefather-mcp/src/tools/__tests__/log-invocation.test.ts`

1. **Valid invocation log** -- call `handleLogInvocation` with all fields, verify fetch is called with correct URL and body
2. **Minimal invocation log** -- call with only required fields (skill_slug, session_id), verify optional fields default to null
3. **API failure** -- mock fetch to reject, verify function returns acknowledgment (does not throw)
4. **Fire-and-forget semantics** -- verify the function returns before fetch completes

**New file:** `packages/claudefather-mcp/src/tools/__tests__/session-feedback.test.ts`

1. **Valid feedback submission** -- call with session_id and ratings array, verify POST body and response parsing
2. **Invalid rating value** -- rating of 0 or 6 should be rejected by zod schema
3. **Empty ratings array** -- should be rejected by zod schema (min 1)
4. **Comment sanitization** -- HTML tags stripped, length capped at 1000 characters
5. **API failure** -- mock 500 response, verify error message returned (not thrown)

### API Endpoint Tests

**New file:** `packages/web/src/app/api/telemetry/__tests__/invocation.test.ts`

1. **Unauthenticated request** -- 401 response
2. **Single invocation** -- valid body, verify DB insert
3. **Batch invocations** -- array body, verify batch insert
4. **Missing required fields** -- 400 response
5. **Verify no extra fields stored** -- metadata JSONB is passed through but no prompt/code content

**New file:** `packages/web/src/app/api/telemetry/__tests__/feedback.test.ts`

1. **Unauthenticated request** -- 401 response
2. **Valid feedback** -- verify DB insert with correct user_id
3. **Rating out of range** -- 400 response
4. **Comment with HTML** -- verify HTML stripped in response
5. **Empty ratings array** -- 400 response

**New file:** `packages/web/src/app/api/telemetry/__tests__/stats.test.ts`

1. **Returns correct aggregations** -- seed DB, verify counts, averages, unique users
2. **Empty skill** -- no invocations, returns zeros/nulls
3. **Privacy** -- verify userId is NOT included in feedback response

**New file:** `packages/web/src/app/api/telemetry/__tests__/overview.test.ts`

1. **Returns top skills** -- seed DB with varied invocation counts
2. **30-day window** -- old invocations excluded from counts
3. **Active users count** -- deduplicated by userId

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
- **Usage telemetry schema** — Three new database tables: `skill_invocations` (per-invocation logging), `skill_feedback` (end-of-session ratings), and `sync_events` (sync tracking). Indexed for Workshop and Dashboard queries.
- **`claudefather_log_invocation` MCP tool** — Fire-and-forget skill invocation logging. Called by the PostToolUse hook or explicitly by skills that want to report duration/metadata.
- **`claudefather_session_feedback` MCP tool** — End-of-session skill ratings (1-5) with optional comments.
- **PostToolUse telemetry hook** — `posttooluse-telemetry.sh` automatically detects Skill tool invocations and logs them to a session-local JSONL file. Zero-touch for skill authors — no SKILL.md changes needed.
- **Telemetry API endpoints** — POST `/api/telemetry/invocation` (batch-friendly), POST `/api/telemetry/feedback`, GET `/api/telemetry/stats/:skillSlug`, GET `/api/telemetry/overview`.
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
| MCP server configured but API down | `handleLogInvocation` swallows error; session-handoff reports "could not submit" but does not fail |
| Very long session (100+ skill invocations) | JSONL file grows linearly; batch submission handles all entries |
| Concurrent sessions (worktrees) | Each session has unique session_id; telemetry files are per-session (`/tmp/claudefather-telemetry-<session_id>.jsonl`) |
| User declines MCP permission | MCP tools not available; hook still writes local file but session-handoff cannot submit |
| Skill invocation with no tool_response | success defaults to null |
| Malformed hook input (missing fields) | jq returns "skip"; hook exits 0 silently |
| Session crash (no handoff) | Telemetry JSONL stays in /tmp; data lost unless a future session reads orphan files |
| Feedback comment with SQL injection attempt | Prisma parameterized queries prevent injection; HTML stripped by API |
| Rating value manipulation (negative, >5) | Schema validation rejects at API layer; zod rejects at MCP tool layer |
| High-frequency invocations (rate abuse) | No rate limiting in Phase 02; consider rate limiting in Phase 04 or Phase 05 |

### Performance Considerations

- **PostToolUse hook latency:** < 10ms (single jq call + file append). No network I/O.
- **API endpoint latency:** Batch insert via `createMany` -- single DB round trip even for 50+ invocations.
- **Stats endpoint:** Six parallel Prisma queries. For a team of 20 users, table sizes will be small (thousands of rows). No query optimization needed until hundreds of thousands of rows.
- **JSONL cleanup:** Telemetry files in `/tmp` are cleaned by OS temp file cleanup. No manual retention policy needed.

---

## Verification Checklist

- [ ] Migration creates `skill_invocations`, `sync_events`, and `skill_feedback` tables
- [ ] Prisma schema updated with models and User relations
- [ ] `claudefather_log_invocation` MCP tool registered and returns immediately
- [ ] `claudefather_session_feedback` MCP tool registered and awaits response
- [ ] POST `/api/telemetry/invocation` accepts single and batch payloads
- [ ] POST `/api/telemetry/feedback` validates ratings 1-5, sanitizes comments
- [ ] GET `/api/telemetry/stats/:skillSlug` returns correct aggregations
- [ ] GET `/api/telemetry/overview` returns 30-day window stats
- [ ] All endpoints return 401 for unauthenticated requests
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
