# Phase 06: Intelligence Pipeline

**PR Title:** add intelligence pipeline for automated source monitoring and learning distillation
**Risk Level:** Medium
**Estimated Effort:** High (~3-5 days)
**Files Created:** 12
**Files Modified:** 3

---

## Implementation Corrections (added 2026-03-05)

This plan was generated before Phase 01-03 implementation. Code snippets contain schema and path errors. **Do NOT copy code verbatim.** Use feature descriptions as requirements, implement against the actual codebase.

### Key corrections (same pattern as Phase 04/05)
- All IDs must be `uuid`, not `SERIAL` or `INTEGER` — match `packages/db/src/schema.ts` conventions
- Use Drizzle ORM table definitions in `packages/db/src/schema.ts`, not raw SQL migration files
- All file paths under `packages/web/src/` not `services/` or `src/`
- Use `timestamp('...', { withTimezone: true })` not `TIMESTAMPTZ`
- `learnings` and `learning_skill_links` tables are created by Phase 04 — verify their actual schema before depending on them
- Auth: use `auth()` from NextAuth, not custom session functions
- `activityEvents` table (renamed from `syncEvents` per Phase 05 decision) replaces any separate audit log needs

---

## Context

The platform currently has no automated mechanism for staying current with Claude Code, MCP, and AI ecosystem changes. The maintainer manually reads docs, blogs, and changelogs, then translates findings into skill improvements. This phase automates the monitoring and distillation steps, feeding actionable learnings into the Workshop UI (Phase 04) where the maintainer reviews and approves proposed skill changes. The key design principle is that no learning ever modifies a skill autonomously -- everything is staged for human review.

## Dependencies

- Depends on Phase 01 (database infrastructure, auth, API framework) -- needs Neon PostgreSQL, API routes, auth middleware
- Depends on Phase 04 (learnings browser UI) -- this phase populates the data that Phase 04 displays
- Optionally benefits from Phase 02 (telemetry data helps prioritize which skills matter most)
- Unlocks: None directly, but completes the platform's intelligence feedback loop

## Detailed Implementation Plan

**Step 1: Database Schema -- New Tables**

Three new tables added via migration file (e.g., `migrations/006_intelligence_pipeline.sql`):

```sql
-- Source configurations: which URLs to monitor and how often
CREATE TABLE source_configs (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    url             TEXT NOT NULL UNIQUE,
    source_type     TEXT NOT NULL CHECK (source_type IN ('anthropic_docs', 'anthropic_blog', 'changelog', 'github_repo', 'newsletter', 'mcp_registry')),
    check_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (check_frequency IN ('daily', 'weekly')),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    fetch_config    JSONB DEFAULT '{}',  -- CSS selectors, API params, auth headers (encrypted)
    last_checked_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Raw content snapshots for change detection
CREATE TABLE source_snapshots (
    id                SERIAL PRIMARY KEY,
    source_config_id  INTEGER NOT NULL REFERENCES source_configs(id) ON DELETE CASCADE,
    content_hash      TEXT NOT NULL,  -- SHA-256 of raw_content
    raw_content       TEXT NOT NULL,  -- Full fetched content (can be large)
    fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snapshots_source_fetched ON source_snapshots(source_config_id, fetched_at DESC);

-- Audit log for all pipeline actions
CREATE TABLE learning_audit_log (
    id            SERIAL PRIMARY KEY,
    learning_id   INTEGER REFERENCES learnings(id) ON DELETE SET NULL,
    action        TEXT NOT NULL CHECK (action IN ('created', 'reviewed', 'applied', 'dismissed', 'archived', 'auto_archived')),
    performed_by  TEXT,  -- GitHub username or 'system' for automated actions
    performed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes         TEXT
);

CREATE INDEX idx_audit_learning ON learning_audit_log(learning_id);
CREATE INDEX idx_audit_action ON learning_audit_log(action, performed_at DESC);
```

This assumes the `learnings` and `learning_skill_links` tables are already defined in Phase 04's migration. The `learnings` table schema (referenced but not redefined here):

```sql
-- Defined in Phase 04 migration:
-- learnings: id, title, summary, source_url, source_type, relevance_tags (TEXT[]), distilled_at, status ('new'|'reviewed'|'applied'|'dismissed'|'archived')
-- learning_skill_links: id, learning_id FK, skill_slug, proposed_change, status ('proposed'|'applied'|'dismissed')
```

**Step 2: Seed Data -- Initial Source Configurations**

Create `migrations/006b_seed_sources.sql` with the initial monitored sources:

```sql
INSERT INTO source_configs (name, url, source_type, check_frequency, fetch_config) VALUES
    ('Claude Code Docs', 'https://docs.anthropic.com/en/docs/claude-code', 'anthropic_docs', 'daily', '{"sections": ["overview", "skills", "hooks", "mcp", "permissions"]}'),
    ('Claude Code Changelog', 'https://docs.anthropic.com/en/docs/claude-code/changelog', 'changelog', 'daily', '{}'),
    ('Anthropic API Docs', 'https://docs.anthropic.com/en/docs/build-with-claude', 'anthropic_docs', 'weekly', '{}'),
    ('Anthropic Blog', 'https://www.anthropic.com/blog', 'anthropic_blog', 'daily', '{"filter_tags": ["claude", "claude-code", "mcp", "tool-use"]}'),
    ('Claude Model Card', 'https://docs.anthropic.com/en/docs/about-claude/models', 'anthropic_docs', 'weekly', '{}'),
    ('MCP Specification', 'https://github.com/modelcontextprotocol/specification', 'github_repo', 'weekly', '{"watch": "releases"}'),
    ('MCP Servers Registry', 'https://github.com/modelcontextprotocol/servers', 'mcp_registry', 'weekly', '{"watch": "commits"}'),
    ('Claude Code GitHub', 'https://github.com/anthropics/claude-code', 'github_repo', 'daily', '{"watch": "releases,issues"}'),
    ('Anthropic Cookbook', 'https://github.com/anthropics/anthropic-cookbook', 'github_repo', 'weekly', '{"watch": "commits"}'),
    ('Claude Code SDK', 'https://github.com/anthropics/claude-code-sdk-python', 'github_repo', 'weekly', '{"watch": "releases"}');
```

**Step 3: Scraper Service**

Create `services/scraper/` directory with the following files:

`services/scraper/index.ts`:
```typescript
import { fetchSource } from './fetchers';
import { detectChanges } from './change-detection';
import { triggerDistillation } from '../distillation';
import { db } from '../db';

export async function runScraperJob(): Promise<{
    sourcesChecked: number;
    changesDetected: number;
    distillationsTriggered: number;
}> {
    const sources = await db.query(
        `SELECT * FROM source_configs
         WHERE is_active = true
         AND (last_checked_at IS NULL OR
              CASE check_frequency
                WHEN 'daily' THEN last_checked_at < NOW() - INTERVAL '23 hours'
                WHEN 'weekly' THEN last_checked_at < NOW() - INTERVAL '6 days 20 hours'
              END)
         ORDER BY last_checked_at ASC NULLS FIRST`
    );

    let changesDetected = 0;
    let distillationsTriggered = 0;

    for (const source of sources.rows) {
        try {
            const content = await fetchSource(source);
            const hasChanged = await detectChanges(source.id, content);

            await db.query(
                'UPDATE source_configs SET last_checked_at = NOW() WHERE id = $1',
                [source.id]
            );

            if (hasChanged) {
                changesDetected++;
                await triggerDistillation(source, content);
                distillationsTriggered++;
            }
        } catch (error) {
            console.error(`Failed to scrape ${source.name}:`, error);
            // Log error but continue with other sources
        }
    }

    return {
        sourcesChecked: sources.rows.length,
        changesDetected,
        distillationsTriggered,
    };
}
```

`services/scraper/fetchers.ts` -- Source-type-specific fetchers:

```typescript
import { SourceConfig } from '../types';

export async function fetchSource(source: SourceConfig): Promise<string> {
    switch (source.source_type) {
        case 'anthropic_docs':
        case 'anthropic_blog':
        case 'changelog':
            return fetchWebPage(source.url);
        case 'github_repo':
            return fetchGitHubRepo(source.url, source.fetch_config);
        case 'mcp_registry':
            return fetchGitHubRepo(source.url, source.fetch_config);
        default:
            throw new Error(`Unknown source type: ${source.source_type}`);
    }
}

async function fetchWebPage(url: string): Promise<string> {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'claudefather-intelligence-pipeline/1.0' },
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const html = await response.text();
    // Strip HTML tags, scripts, styles -- extract text content
    return extractTextContent(html);
}

async function fetchGitHubRepo(
    url: string,
    config: Record<string, string>
): Promise<string> {
    // Parse owner/repo from URL
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
    const [, owner, repo] = match;
    const watchTypes = (config.watch || 'releases').split(',');

    const parts: string[] = [];

    if (watchTypes.includes('releases')) {
        const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`,
            { headers: githubHeaders() }
        );
        if (res.ok) {
            const releases = await res.json();
            parts.push('RELEASES:\n' + JSON.stringify(releases.map(
                (r: any) => ({ tag: r.tag_name, name: r.name, body: r.body, date: r.published_at })
            )));
        }
    }

    if (watchTypes.includes('commits')) {
        const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/commits?per_page=20`,
            { headers: githubHeaders() }
        );
        if (res.ok) {
            const commits = await res.json();
            parts.push('RECENT_COMMITS:\n' + JSON.stringify(commits.map(
                (c: any) => ({ sha: c.sha.slice(0, 7), message: c.commit.message, date: c.commit.author.date })
            )));
        }
    }

    if (watchTypes.includes('issues')) {
        const res = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=10&sort=updated`,
            { headers: githubHeaders() }
        );
        if (res.ok) {
            const issues = await res.json();
            parts.push('OPEN_ISSUES:\n' + JSON.stringify(issues.map(
                (i: any) => ({ number: i.number, title: i.title, labels: i.labels.map((l: any) => l.name) })
            )));
        }
    }

    return parts.join('\n\n');
}

function githubHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'User-Agent': 'claudefather-intelligence-pipeline/1.0',
        'Accept': 'application/vnd.github.v3+json',
    };
    if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return headers;
}

function extractTextContent(html: string): string {
    // Remove script and style blocks
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    // Truncate to 50K chars to stay within API limits
    return text.slice(0, 50_000);
}
```

`services/scraper/change-detection.ts`:

```typescript
import { createHash } from 'crypto';
import { db } from '../db';

export async function detectChanges(
    sourceConfigId: number,
    content: string
): Promise<boolean> {
    const contentHash = createHash('sha256').update(content).digest('hex');

    // Get most recent snapshot for this source
    const prev = await db.query(
        `SELECT content_hash FROM source_snapshots
         WHERE source_config_id = $1
         ORDER BY fetched_at DESC LIMIT 1`,
        [sourceConfigId]
    );

    // Store new snapshot regardless
    await db.query(
        `INSERT INTO source_snapshots (source_config_id, content_hash, raw_content)
         VALUES ($1, $2, $3)`,
        [sourceConfigId, contentHash, content]
    );

    // First fetch ever, or content changed
    if (prev.rows.length === 0) return true;
    return prev.rows[0].content_hash !== contentHash;
}
```

**Step 4: Distillation Service**

`services/distillation/index.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db';
import { buildDistillationPrompt } from './prompt';
import { SourceConfig, DistillationResult } from '../types';

const anthropic = new Anthropic();

export async function triggerDistillation(
    source: SourceConfig,
    content: string
): Promise<void> {
    // Get previous snapshot content for diff context
    const prevSnapshot = await db.query(
        `SELECT raw_content FROM source_snapshots
         WHERE source_config_id = $1
         ORDER BY fetched_at DESC
         OFFSET 1 LIMIT 1`,
        [source.id]
    );
    const previousContent = prevSnapshot.rows[0]?.raw_content || null;

    const systemPrompt = buildDistillationPrompt();
    const userPrompt = buildUserPrompt(source, content, previousContent);

    // Use Haiku for cost-effective high-volume distillation
    const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20250315',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
    });

    const resultText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

    // Parse structured JSON response
    const result: DistillationResult = JSON.parse(resultText);

    // Filter out noise
    if (result.relevance === 'none') return;

    // Store learning
    const learning = await db.query(
        `INSERT INTO learnings (title, summary, source_url, source_type, relevance_tags, status, distilled_at)
         VALUES ($1, $2, $3, $4, $5, 'new', NOW())
         RETURNING id`,
        [result.title, result.summary, source.url, source.source_type, result.relevance_tags]
    );

    const learningId = learning.rows[0].id;

    // Store proposed skill changes
    for (const skillChange of result.affected_skills) {
        await db.query(
            `INSERT INTO learning_skill_links (learning_id, skill_slug, proposed_change, status)
             VALUES ($1, $2, $3, 'proposed')`,
            [learningId, skillChange.skill_slug, skillChange.proposed_change]
        );
    }

    // Audit log
    await db.query(
        `INSERT INTO learning_audit_log (learning_id, action, performed_by, notes)
         VALUES ($1, 'created', 'system', $2)`,
        [learningId, `Distilled from ${source.name}`]
    );
}

function buildUserPrompt(
    source: SourceConfig,
    content: string,
    previousContent: string | null
): string {
    let prompt = `## Source: ${source.name}\n`;
    prompt += `URL: ${source.url}\n`;
    prompt += `Type: ${source.source_type}\n\n`;

    if (previousContent) {
        prompt += `## Previous Content (for diff context, abbreviated)\n`;
        prompt += previousContent.slice(0, 10_000) + '\n\n';
        prompt += `## Current Content\n`;
    } else {
        prompt += `## Content (first fetch)\n`;
    }
    prompt += content.slice(0, 40_000) + '\n';

    return prompt;
}
```

**Step 5: Distillation Prompt Design**

`services/distillation/prompt.ts` -- This is the critical component. The system prompt must encode the claudefather skill ecosystem knowledge:

```typescript
export function buildDistillationPrompt(): string {
    return `You are an intelligence analyst for "claudefather," a Claude Code skills platform that manages ${SKILL_COUNT} skills for a team of ~20 developers. Your job is to analyze content from AI/Claude ecosystem sources and determine what is relevant to maintaining and improving these skills.

## The Claudefather Skill Ecosystem

### Skill Categories and Descriptions
${SKILL_CATALOG}

### Skill Authoring Conventions
Skills are SKILL.md files with YAML frontmatter. Critical conventions:
- \`allowed-tools\` uses space-wildcard format: \`Bash(git *)\` NOT \`Bash(git:*)\`
- Shell operators (&&, ||, ;, |, 2>&1) in Bash commands break \`allowed-tools\` pattern matching. Skills must instruct Claude to make separate parallel tool calls.
- For Python venvs: use \`./venv/bin/python -m black\` not \`source venv/bin/activate && python -m black\`
- Two-layer permission model: both \`allowed-tools\` in SKILL.md AND \`permissions.allow\` in settings.json must cover a command
- \`user-invocable: false\` makes a skill context-only (auto-loaded, not a slash command)
- \`disable-model-invocation: true\` blocks ALL invocation including user-initiated — avoid on slash commands

### What Constitutes a Relevant Change
HIGH relevance:
- New Claude Code features (hooks, skills format changes, MCP protocol changes)
- Breaking changes in Claude Code SDK or API
- New best practices for tool use, prompt engineering, or skill authoring
- Security advisories affecting Claude Code or MCP
- New model capabilities that skills should leverage

MEDIUM relevance:
- New MCP servers or tools that could enhance existing skills
- Community patterns for skill organization or distribution
- Performance improvements in Claude API (caching, batching)
- Documentation clarifications that affect skill behavior

LOW relevance:
- General AI industry news without Claude Code implications
- Marketing announcements without technical substance
- Minor bug fixes in unrelated tools

NOISE (ignore):
- Blog posts about AI ethics/policy without technical changes
- Hiring announcements
- Conference talk summaries without new technical content
- Typo fixes, minor formatting changes in docs

## Your Task

Analyze the provided content and output ONLY valid JSON in this format:

\`\`\`json
{
    "relevance": "high" | "medium" | "low" | "none",
    "title": "Concise title describing what changed",
    "summary": "2-4 sentence summary: what changed, why it matters for claudefather, what action to take",
    "relevance_tags": ["tag1", "tag2"],
    "urgency": "immediate" | "soon" | "informational",
    "affected_skills": [
        {
            "skill_slug": "skill-name",
            "proposed_change": "Specific description of what should change in this skill and why"
        }
    ]
}
\`\`\`

Rules:
- If relevance is "none", output: {"relevance": "none"}
- relevance_tags should be from: ["claude-code", "mcp", "skill-authoring", "api-changes", "permissions", "hooks", "models", "security", "tool-use", "prompt-engineering", "breaking-change"]
- affected_skills can be empty if the change is informational only
- Be specific in proposed_change — reference the skill's current behavior and exactly what should change
- When in doubt about relevance, lean toward "low" rather than "medium"
- Never propose changes you are uncertain about — flag uncertainty in the summary instead`;
}

// These constants should be generated from the actual skill inventory
// at build time or loaded from the database
const SKILL_COUNT = 37;

const SKILL_CATALOG = `
**Deployment & Infrastructure:** modal-deploy, modal-logs, modal-status (Modal), railway-deploy, railway-logs, railway-status (Railway), vercel-deploy, vercel-logs, vercel-status (Vercel)
**Database & Data:** neon-branch, neon-info, neon-query (Neon PostgreSQL), snowflake-query (Snowflake), dbt (dbt + Snowflake)
**Code Review & QA:** review-pr (structured PR review), review-changes (uncommitted change review), review-self (pre-work lesson review), security-audit (8-category security scan)
**Planning & Documentation:** product-enhance (gap analysis + phased plans), product-brainstorm (divergent ideation), implement-plan (execute design docs), tech-debt (debt scan + remediation), docs-review (documentation audit), investigate-app (production debugging)
**Design & Performance:** design-review (visual audit with screenshots), frontend-performance-audit (render cascade analysis)
**Development Workflow:** quick-commit, commit-push-pr (git workflows), context-resume + session-handoff (session continuity), find-skills (skill discovery), worktree (parallel sessions), lessons (learning capture)
**Utilities:** notes (persistent notes), notifications (macOS alerts, context-only), claudefather-migrate (legacy cleanup)
**Platform:** cache-audit (prompt cache diagnostics)
`;
```

**Step 6: Quality Control -- Relevance Scoring and Deduplication**

`services/distillation/quality-control.ts`:

```typescript
import { db } from '../db';

/**
 * Run periodic quality control on learnings.
 * Called by the weekly maintenance cron job.
 */
export async function runQualityControl(): Promise<{
    archived: number;
    deduplicated: number;
}> {
    // 1. Auto-archive stale learnings (>90 days without action)
    const staleResult = await db.query(
        `UPDATE learnings
         SET status = 'archived'
         WHERE status = 'new'
         AND distilled_at < NOW() - INTERVAL '90 days'
         RETURNING id`
    );

    // Log auto-archives
    for (const row of staleResult.rows) {
        await db.query(
            `INSERT INTO learning_audit_log (learning_id, action, performed_by, notes)
             VALUES ($1, 'auto_archived', 'system', 'Stale: no action for 90 days')`,
            [row.id]
        );
    }

    // 2. Deduplicate: find learnings with same source_url and similar titles
    const dupes = await db.query(
        `SELECT l1.id AS keep_id, l2.id AS dupe_id
         FROM learnings l1
         JOIN learnings l2 ON l1.source_url = l2.source_url
            AND l1.id < l2.id
            AND l2.status = 'new'
            AND l1.status IN ('new', 'reviewed')
         WHERE similarity(l1.title, l2.title) > 0.6`
    );

    let deduplicated = 0;
    for (const dupe of dupes.rows) {
        await db.query(
            `UPDATE learnings SET status = 'archived' WHERE id = $1`,
            [dupe.dupe_id]
        );
        await db.query(
            `INSERT INTO learning_audit_log (learning_id, action, performed_by, notes)
             VALUES ($1, 'auto_archived', 'system', $2)`,
            [dupe.dupe_id, `Deduplicated: similar to learning #${dupe.keep_id}`]
        );
        deduplicated++;
    }

    return { archived: staleResult.rows.length, deduplicated };
}
```

Note: The `similarity()` function requires the PostgreSQL `pg_trgm` extension. Add to the migration:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**Step 7: Scheduled Job Entry Points**

`api/cron/scrape.ts` (Vercel Cron or similar serverless function):

```typescript
import { runScraperJob } from '../../services/scraper';

export const config = {
    // Run daily at 06:00 UTC
    cron: '0 6 * * *',
};

export default async function handler(req: Request): Promise<Response> {
    // Verify cron secret to prevent unauthorized invocation
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const result = await runScraperJob();
        return Response.json({
            ok: true,
            ...result,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Scraper job failed:', error);
        return Response.json(
            { ok: false, error: String(error) },
            { status: 500 }
        );
    }
}
```

`api/cron/maintenance.ts` (weekly cleanup):

```typescript
import { runQualityControl } from '../../services/distillation/quality-control';

export const config = {
    // Run weekly on Sundays at 04:00 UTC
    cron: '0 4 * * 0',
};

export default async function handler(req: Request): Promise<Response> {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const result = await runQualityControl();
        return Response.json({
            ok: true,
            ...result,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Maintenance job failed:', error);
        return Response.json(
            { ok: false, error: String(error) },
            { status: 500 }
        );
    }
}
```

**Step 8: API Routes for Workshop Integration**

`api/routes/learnings.ts` -- REST endpoints consumed by the Workshop UI:

```typescript
import { Router } from 'express';  // or framework-appropriate router
import { db } from '../../services/db';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

// GET /api/learnings -- list learnings with filters
router.get('/', requireAuth, async (req, res) => {
    const { status, source_type, skill, limit = 50, offset = 0 } = req.query;

    let query = `
        SELECT l.*, array_agg(DISTINCT lsl.skill_slug) FILTER (WHERE lsl.skill_slug IS NOT NULL) AS affected_skills
        FROM learnings l
        LEFT JOIN learning_skill_links lsl ON l.id = lsl.learning_id
        WHERE 1=1
    `;
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
        query += ` AND l.status = $${paramIdx++}`;
        params.push(status);
    }
    if (source_type) {
        query += ` AND l.source_type = $${paramIdx++}`;
        params.push(source_type);
    }
    if (skill) {
        query += ` AND EXISTS (SELECT 1 FROM learning_skill_links WHERE learning_id = l.id AND skill_slug = $${paramIdx++})`;
        params.push(skill);
    }

    query += ` GROUP BY l.id ORDER BY l.distilled_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(Number(limit), Number(offset));

    const result = await db.query(query, params);
    res.json({ learnings: result.rows, total: result.rowCount });
});

// GET /api/learnings/:id -- single learning with full details
router.get('/:id', requireAuth, async (req, res) => {
    const learning = await db.query('SELECT * FROM learnings WHERE id = $1', [req.params.id]);
    if (!learning.rows.length) return res.status(404).json({ error: 'Not found' });

    const links = await db.query(
        'SELECT * FROM learning_skill_links WHERE learning_id = $1',
        [req.params.id]
    );
    const audit = await db.query(
        'SELECT * FROM learning_audit_log WHERE learning_id = $1 ORDER BY performed_at DESC',
        [req.params.id]
    );

    res.json({
        ...learning.rows[0],
        skill_links: links.rows,
        audit_log: audit.rows,
    });
});

// PATCH /api/learnings/:id/status -- update learning status (admin only)
router.patch('/:id/status', requireAdmin, async (req, res) => {
    const { status, notes } = req.body;
    const validStatuses = ['reviewed', 'applied', 'dismissed', 'archived'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    await db.query('UPDATE learnings SET status = $1 WHERE id = $2', [status, req.params.id]);
    await db.query(
        `INSERT INTO learning_audit_log (learning_id, action, performed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, status, req.user.github_username, notes || null]
    );

    res.json({ ok: true });
});

// GET /api/learnings/stats -- dashboard statistics
router.get('/stats', requireAuth, async (req, res) => {
    const stats = await db.query(`
        SELECT
            COUNT(*) FILTER (WHERE status = 'new') AS pending,
            COUNT(*) FILTER (WHERE status = 'reviewed') AS reviewed,
            COUNT(*) FILTER (WHERE status = 'applied') AS applied,
            COUNT(*) FILTER (WHERE status = 'dismissed') AS dismissed,
            COUNT(*) FILTER (WHERE status = 'archived') AS archived,
            COUNT(*) AS total
        FROM learnings
    `);

    const recentSources = await db.query(`
        SELECT sc.name, sc.source_type, sc.last_checked_at,
               COUNT(ss.id) AS snapshot_count
        FROM source_configs sc
        LEFT JOIN source_snapshots ss ON sc.id = ss.source_config_id
        WHERE sc.is_active = true
        GROUP BY sc.id
        ORDER BY sc.last_checked_at DESC NULLS LAST
    `);

    res.json({
        learnings: stats.rows[0],
        sources: recentSources.rows,
    });
});

// POST /api/learnings/:id/apply -- mark a skill link as applied (admin only)
router.post('/:id/apply', requireAdmin, async (req, res) => {
    const { skill_slug } = req.body;

    await db.query(
        `UPDATE learning_skill_links SET status = 'applied'
         WHERE learning_id = $1 AND skill_slug = $2`,
        [req.params.id, skill_slug]
    );

    // Check if all links are resolved
    const remaining = await db.query(
        `SELECT COUNT(*) FROM learning_skill_links
         WHERE learning_id = $1 AND status = 'proposed'`,
        [req.params.id]
    );
    if (Number(remaining.rows[0].count) === 0) {
        await db.query(`UPDATE learnings SET status = 'applied' WHERE id = $1`, [req.params.id]);
    }

    await db.query(
        `INSERT INTO learning_audit_log (learning_id, action, performed_by, notes)
         VALUES ($1, 'applied', $2, $3)`,
        [req.params.id, req.user.github_username, `Applied to skill: ${skill_slug}`]
    );

    res.json({ ok: true });
});

export default router;
```

**Step 9: Workshop UI Integration**

This phase adds to the Workshop learnings page built in Phase 04. The Phase 04 UI should already have a learnings list/browser. This phase adds:

1. **Learning "bubble" cards** with visual relevance indicators:
   - Red border = high relevance / immediate urgency
   - Yellow border = medium relevance / soon
   - Gray border = low relevance / informational
   - Each card shows: title, source name, affected skills as tags, time since distilled

2. **Learning detail view** (clicking a bubble):
   - Full summary text
   - Source link (opens in new tab)
   - List of affected skills with proposed changes
   - "Apply to skill" button per skill -- navigates to the skill editor (Phase 04) with the proposed change pre-loaded as a diff suggestion
   - "Dismiss" button -- marks the skill link as dismissed
   - Audit log timeline at bottom

3. **Status filter tabs** at top of learnings page: All | New (count) | Reviewed | Applied | Dismissed

4. **Source health dashboard** (sub-page or accordion): Shows each source_config with name, last_checked_at, snapshot_count, and is_active toggle (admin only)

The exact React/component implementation depends on Phase 04's UI framework choice. The API contract defined in Step 8 is the integration surface.

**Step 10: Environment Variables**

Add to the platform's `.env.example`:

```
# Intelligence Pipeline
ANTHROPIC_API_KEY=sk-ant-...          # For distillation API calls
GITHUB_TOKEN=ghp_...                  # For GitHub API (higher rate limits)
CRON_SECRET=...                       # Authenticates cron job invocations
SCRAPER_ENABLED=true                  # Kill switch for scraper jobs
```

**Step 11: Snapshot Retention**

Add to the weekly maintenance job -- prevent unbounded growth of source_snapshots:

```typescript
// Keep only last 30 snapshots per source (covers ~1 month of daily checks)
async function pruneSnapshots(): Promise<number> {
    const result = await db.query(`
        DELETE FROM source_snapshots
        WHERE id IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY source_config_id ORDER BY fetched_at DESC
                ) AS rn
                FROM source_snapshots
            ) ranked
            WHERE rn > 30
        )
    `);
    return result.rowCount || 0;
}
```

**Step 12: Types**

`services/types.ts` -- Shared TypeScript types:

```typescript
export interface SourceConfig {
    id: number;
    name: string;
    url: string;
    source_type: 'anthropic_docs' | 'anthropic_blog' | 'changelog' | 'github_repo' | 'newsletter' | 'mcp_registry';
    check_frequency: 'daily' | 'weekly';
    is_active: boolean;
    fetch_config: Record<string, string>;
    last_checked_at: string | null;
    created_at: string;
}

export interface DistillationResult {
    relevance: 'high' | 'medium' | 'low' | 'none';
    title: string;
    summary: string;
    relevance_tags: string[];
    urgency: 'immediate' | 'soon' | 'informational';
    affected_skills: Array<{
        skill_slug: string;
        proposed_change: string;
    }>;
}

export interface Learning {
    id: number;
    title: string;
    summary: string;
    source_url: string;
    source_type: string;
    relevance_tags: string[];
    status: 'new' | 'reviewed' | 'applied' | 'dismissed' | 'archived';
    distilled_at: string;
}

export interface LearningSkillLink {
    id: number;
    learning_id: number;
    skill_slug: string;
    proposed_change: string;
    status: 'proposed' | 'applied' | 'dismissed';
}

export interface AuditLogEntry {
    id: number;
    learning_id: number | null;
    action: 'created' | 'reviewed' | 'applied' | 'dismissed' | 'archived' | 'auto_archived';
    performed_by: string;
    performed_at: string;
    notes: string | null;
}
```

---

## Test Plan

**Unit Tests:**

1. `services/scraper/change-detection.test.ts`:
   - First fetch (no previous snapshot) returns `true`
   - Same content hash returns `false`
   - Different content hash returns `true`
   - Snapshot is stored on every call regardless of change

2. `services/distillation/prompt.test.ts`:
   - Prompt includes all skill categories
   - Prompt includes authoring conventions (space-wildcard, shell operators, venv paths)
   - Prompt output format matches DistillationResult schema

3. `services/distillation/quality-control.test.ts`:
   - Learnings older than 90 days with status 'new' are archived
   - Learnings with status 'reviewed' or 'applied' are NOT auto-archived
   - Duplicate learnings (same source_url, similar title) are deduplicated
   - Audit log entries are created for all auto-archives

4. `api/routes/learnings.test.ts`:
   - GET /api/learnings returns paginated results
   - Filters by status, source_type, and skill work correctly
   - PATCH /api/learnings/:id/status requires admin auth
   - Invalid status values return 400
   - POST /api/learnings/:id/apply marks skill link and auto-resolves learning when all links resolved

**Integration Tests:**

5. `services/scraper/fetchers.test.ts`:
   - Web page fetcher strips HTML correctly
   - GitHub fetcher handles missing GITHUB_TOKEN gracefully (lower rate limits, not failure)
   - Timeout handling for unresponsive sources
   - HTTP error status codes logged, not thrown to caller

6. End-to-end scraper flow:
   - Insert a source_config, run scraper, verify snapshot created
   - Modify source content, run again, verify distillation triggered
   - Run with unchanged content, verify no distillation

**Manual Verification:**

7. Cron endpoints:
   - POST to /api/cron/scrape with correct CRON_SECRET returns 200 with stats
   - POST without CRON_SECRET returns 401
   - POST to /api/cron/maintenance runs quality control

8. Workshop UI:
   - Learning bubbles appear with correct color coding
   - Clicking a bubble shows detail view with proposed changes
   - Status filter tabs show correct counts
   - "Apply to skill" navigates to skill editor with pre-loaded diff
   - Source health dashboard shows all configured sources

---

## Documentation Updates

**CHANGELOG.md addition:**

```markdown
### Added
- **Intelligence Pipeline** -- automated monitoring of Anthropic docs, Claude Code changelog, GitHub repos, and MCP ecosystem. Detects content changes via SHA-256 hashing, distills through Claude Haiku with claudefather-aware system prompt, produces actionable learnings with proposed skill changes. All proposals staged for admin review in Workshop UI -- no autonomous modifications.
- **Source monitoring** -- 10 pre-configured sources (docs.anthropic.com, anthropic.com/blog, Claude Code changelog, MCP spec/servers, Claude Code GitHub, Anthropic Cookbook, Claude Code SDK) with daily/weekly check frequencies.
- **Learning quality control** -- automated 90-day staleness archival, trigram-based deduplication, and snapshot retention pruning (30 snapshots per source).
- **Learnings API** -- REST endpoints for listing, filtering, status updates, and statistics. Admin-only mutation operations with full audit logging.
```

**README.md:** Add "Intelligence Pipeline" to platform capabilities section when it exists.

---

## Stress Testing and Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Source URL returns 404 | Log error, skip source, continue with others |
| Source URL times out (>30s) | AbortSignal fires, error logged, source skipped |
| GitHub API rate limit hit | 403 response logged, source skipped for this run |
| Anthropic API returns error | Distillation skipped, raw snapshot still stored |
| Distillation returns invalid JSON | Parse error caught, logged, learning not created |
| Distillation returns `relevance: "none"` | No learning created, no audit entry |
| Same content fetched twice rapidly | Content hash matches, no distillation triggered |
| 100+ learnings in "new" status | Pagination in API prevents UI/memory issues |
| Very large page content (>1MB) | Truncated to 50K chars before storage and API call |
| Source config deactivated (`is_active = false`) | Skipped by scraper query WHERE clause |
| Database connection failure | Scraper job returns 500, cron retries next cycle |
| Missing ANTHROPIC_API_KEY | Distillation fails with clear error, scraper still stores snapshots |
| Missing GITHUB_TOKEN | GitHub fetcher works with reduced rate limits (60/hr vs 5000/hr) |
| pg_trgm extension not available | Migration fails cleanly -- must be enabled before quality control runs |

**Cost Estimation:**
- 10 sources, daily check: ~10 fetch operations/day
- Assume 30% change rate: ~3 distillations/day
- Claude Haiku at ~$0.001/distillation: ~$0.003/day = ~$0.09/month
- Peak scenario (all sources change daily): ~$0.30/month for distillation
- GitHub API: well within free tier (60 unauthenticated or 5000 authenticated requests/hour)
- Total estimated cost: $2-5/month (dominated by Neon DB, not API calls)

---

## Verification Checklist

- [ ] Migration `006_intelligence_pipeline.sql` creates `source_configs`, `source_snapshots`, `learning_audit_log` tables with correct constraints and indexes
- [ ] Migration enables `pg_trgm` extension
- [ ] Seed data inserts 10 source configurations
- [ ] `fetchSource()` handles all 6 source_types
- [ ] `detectChanges()` stores snapshot and returns correct boolean
- [ ] `extractTextContent()` strips HTML and truncates to 50K chars
- [ ] Distillation system prompt includes all 37 skills with descriptions
- [ ] Distillation system prompt includes authoring conventions (space-wildcard, shell operators, venv, permission model)
- [ ] Distillation result parser handles `relevance: "none"` by skipping storage
- [ ] Quality control archives learnings >90 days old with status 'new'
- [ ] Quality control deduplicates by source_url + title similarity
- [ ] Snapshot retention prunes to 30 per source
- [ ] Cron endpoints authenticate with CRON_SECRET
- [ ] API routes require auth; mutation routes require admin
- [ ] Learning status transitions create audit log entries
- [ ] "Apply to skill" workflow records which user applied which change
- [ ] Workshop UI displays learning bubbles with relevance color coding
- [ ] Source health dashboard shows last_checked_at and snapshot counts
- [ ] `.env.example` includes all 4 new environment variables
- [ ] CHANGELOG.md updated
- [ ] No raw scraped content is ever injected into skills -- always distilled first

---

## What NOT to Do

1. **Do NOT auto-apply learnings to skills.** Every proposed change must be staged in the Workshop and require explicit admin approval. The distillation prompt can propose changes, but the pipeline NEVER modifies SKILL.md files.
2. **Do NOT follow arbitrary URLs from scraped content.** Only fetch from `source_configs` entries. If a blog post links to another page, do not crawl it -- stay within the configured source list.
3. **Do NOT store raw HTML.** Always extract text content before storing in `source_snapshots.raw_content`. HTML is noise and wastes storage.
4. **Do NOT use Claude Sonnet/Opus for routine distillation.** Haiku is sufficient and cost-effective for summarization. Reserve Sonnet for complex analysis if needed later (manual admin trigger, not automated).
5. **Do NOT skip the content_hash check.** Always compare before triggering distillation. Redundant API calls waste money and create duplicate learnings.
6. **Do NOT store GitHub API tokens in the database.** `fetch_config` in `source_configs` is for CSS selectors and watch parameters, never credentials. Tokens live in environment variables only.
7. **Do NOT make the scraper user-configurable initially.** Source configs are admin-only, seeded in migrations, modified via direct DB access or admin API. A full UI for source management is out of scope.
8. **Do NOT build real-time streaming.** Batch processing on a daily/weekly cron schedule is sufficient. WebSocket or SSE for live scraping updates is unnecessary complexity.
9. **Do NOT send distillation results to users as notifications.** Learnings appear in the Workshop UI for the admin to review. Push notifications are noise until the admin has reviewed relevance.
10. **Do NOT include the full `raw_content` in API responses.** The learnings API returns `title`, `summary`, and `source_url`. Raw content stays in the database for re-distillation if needed, never exposed to the frontend.

---
