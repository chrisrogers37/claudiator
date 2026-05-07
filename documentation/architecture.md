# Architecture

Subsystem-level documentation for everything outside the arena. For arena flow and observability, see [`arena-process-flow.md`](./arena-process-flow.md).

## Map

```
packages/
  db/              Schema + migrations + seed (Neon Postgres, Drizzle ORM)
  mcp-server/      Streamable HTTP MCP server on Railway (9 tools)
  web/             Next.js 15 app on Vercel
    src/app/        Page + API routes (App Router)
    src/lib/arena/  Arena pipeline (battles, judging, ELO, evolution)
    src/lib/pipeline/  Intelligence pipeline (sources → snapshots → learnings)
    src/lib/auth.ts NextAuth v5 + GitHub OAuth + Drizzle adapter
```

Per-package READMEs at `packages/db/README.md`, `packages/mcp-server/README.md`, `packages/web/README.md`.

---

## Intelligence pipeline

A daily scrape-distill loop that turns external sources (Anthropic docs, blog, changelogs, GitHub repos, MCP registry) into reviewable "learnings" with optional proposed changes to existing skills. Lives entirely in `packages/web/src/lib/pipeline/` and the API routes under `src/app/api/learnings/` and `src/app/api/cron/scrape/`.

### Tables

| Table | Role |
|-------|------|
| `source_configs` | Registered sources. Columns: `sourceType` enum, `checkFrequency` (`daily` \| `weekly`), `isActive`, `fetchConfig` JSONB, `lastCheckedAt`. No UI to register — insert rows manually. |
| `source_snapshots` | Fetch history. Columns: `sourceConfigId` FK, `contentHash` (SHA-256), `rawContent`, `fetchedAt`. Every scrape writes a row, even if the hash is unchanged. The weekly maintenance cron keeps only the last 30 per source. |
| `learnings` | Distilled, reviewable knowledge units. Columns: `title`, `summary`, `sourceType`, `relevanceTags[]`, `status` (`new` → `reviewed` → `applied` \| `dismissed`). |
| `learning_skill_links` | Many-to-many: which skills a learning suggests changes to. Columns: `learningId`, `skillId`, `proposedChange`, `status` (`pending` → `applied` \| `rejected`). Unique on (learning, skill). |

### Lifecycle

```
sourceConfig (active, due)
   │
   ▼
fetchSource()        ─── HTTP / GitHub API ───►  sourceSnapshot (always written)
   │
   ▼
detectChanges()      ─── SHA-256 vs prior  ──►  if changed:
   │
   ▼
distillation.ts      ─── Claude Haiku 4.5 ────►  learning (status=new)
                     ─── prompt includes:        + learning_skill_links (status=pending)
                         current content (40k)   for each LLM-named affected skill
                         prior content (10k)
                         skill catalog
                     ─── output JSON:
                         {relevance, title,
                          summary, tags,
                          affected_skills}
                     ─── if relevance=none:
                         no learning written
```

### Files

| File | Role |
|------|------|
| `app/api/cron/scrape/route.ts` | Cron entry. Auths the request, gates on `SCRAPER_ENABLED`, calls `runScraperJob()`. |
| `lib/pipeline/scraper.ts` | Selects active+due sources, fetches, detects changes, kicks off distillation. Splits `github_skill_repo` sources off to `skill-discovery.ts` (writes `intakeCandidates`, not learnings). |
| `lib/pipeline/fetchers.ts` | `fetchWebPage()` for HTTP/HTML, `fetchGitHubRepo()` for GitHub (releases, commits). |
| `lib/pipeline/change-detection.ts` | SHA-256 hash compare. |
| `lib/pipeline/distillation.ts` | LLM call. Resolves LLM-named skill slugs → `skillId`s; unknown slugs are warned and skipped. |
| `lib/pipeline/prompt.ts` | Builds the system + user prompts. Encodes the skill catalog and relevance criteria. |
| `lib/pipeline/skill-discovery.ts` | Parallel pipeline for `github_skill_repo` sources → arena intake. |

### Review UI + APIs

- `/workshop/learnings` — list view, filtered by status + sourceType
- `/workshop/learnings/[id]` — detail view with proposed changes per skill
- `POST /api/learnings/[id]/status` — set learning status. Accepts any value in the enum; **no transition validation.**
- `POST /api/learnings/[id]/apply` — body: `{skillSlug, action: "applied" | "rejected"}`. Updates the matching `learning_skill_links` row. **When all links are resolved**, the parent learning auto-transitions: → `applied` if any link was applied, else → `dismissed`. Otherwise the learning's status is left alone.

### Gotchas

- **`learnings.fullContent` is never written today.** Only `summary` is populated by distillation; the field exists for a future feature.
- **Skill resolution is fragile.** If the LLM proposes an unknown skill slug, the link is silently dropped — only a console warn. The learning is still created.
- **`source_configs` registration is manual.** No admin UI — operators insert rows via SQL or a seed.
- **Status enum is broader than the UI surfaces.** `learnings.sourceType` accepts 8 values; the workshop filter shows 5 (blog/docs/changelog/community). The other values (`anthropic_docs`, `anthropic_blog`, `github_repo`, `mcp_registry`) appear in writes but not filters.
- **Distillation is inline with scrape.** A slow LLM call blocks the cron handler; consider moving to a queue if source count grows.

---

## Cron jobs

Two scheduled routes, both POST-only and authed via a shared secret. Schedule lives in `packages/web/vercel.json`.

| Cron | Schedule | Route | What it does |
|------|----------|-------|--------------|
| Scrape | `0 6 * * *` (06:00 UTC daily) | `/api/cron/scrape` | Runs the intelligence pipeline (above) and skill discovery for `github_skill_repo` sources. Returns `{sourcesChecked, changesDetected, errors[], distillations}`. Skipped if `SCRAPER_ENABLED=false`. |
| Maintenance | `0 4 * * 0` (04:00 UTC Sunday) | `/api/cron/maintenance` | `runQualityControl()` — auto-dismisses learnings stuck in `new` for >90 days and prunes `source_snapshots` to the last 30 per source. Returns `{dismissed, snapshotsPruned}`. |

### Auth

Both routes require `Authorization: Bearer <CRON_SECRET>`. The secret is injected by Vercel for scheduled invocations and must be supplied manually if hitting the routes locally or from any other source. There is no per-user identity — the secret is the only credential.

Failures return 500 with the error string. There is no retry logic; Vercel cron does not retry failed runs by default.

---

## Admin

The `admin` role is database-only — there is no UI to grant it. Users default to `member` on signup; the only way to make someone an admin is `UPDATE users SET role = 'admin' WHERE id = …`.

### Where the role is checked

| Location | Mechanism |
|----------|-----------|
| `/admin/*` pages | Layout-level guard at `app/admin/layout.tsx`. `if (role !== "admin") redirect("/dashboard")`. Protects every admin page automatically. |
| `POST /api/arena/categories` | Inline check in route handler (the only arena admin write). |
| `POST /api/admin/*` | Inline check in each handler — returns 403 if `session.role !== "admin"`. |
| MCP `claudosseum_publish` tool | Checked server-side in `mcp-server`. |

### Admin pages

| Page | What it shows |
|------|---------------|
| `/admin` | Redirects to `/admin/team`. |
| `/admin/team` | Member list with sync health, onboarding funnel, role indicators. |
| `/admin/activity` | Activity feed (last 100 `activity_events` rows), filterable by event type. |
| `/admin/versions` | Version-adoption health: per skill+version, how many users are running it. |
| `/admin/feedback` | Feedback inbox with status filter (`new` / `acknowledged` / `in_progress` / `resolved`). |
| `/admin/skills` | Per-skill adoption metrics: 7d / 30d / total invocations + unique users. |

### Admin write APIs

| Endpoint | Effect |
|----------|--------|
| `POST /api/admin/feedback/[id]/status` | Update a feedback row's status. Logs an `activity_event`. |
| `POST /api/admin/versions/nudge` | Notifies users running an outdated version of a skill (logs one event per user). |
| `POST /api/arena/categories` | Create or modify an arena category, optionally with a scoring rubric. |

---

## AI-edit endpoint

A skill-authoring helper that proposes edits to a `SKILL.md` via Claude Sonnet 4.

- **Route:** `POST /api/skills/[slug]/ai-edit`
- **Auth:** any signed-in user (no role check, no ownership check)
- **Body:** `{ content: string, instruction: string }` — `content` is the current SKILL.md, `instruction` is a natural-language edit request
- **Model:** `claude-sonnet-4-20250514`, max 8192 output tokens
- **Returns:** `{ proposedContent: string }` — code-fence-stripped if the model wrapped it
- **Writes nothing.** The endpoint produces a proposal; nothing is persisted.

The workshop editor (`app/workshop/skills/[slug]/components/skill-editor.tsx`) calls it from `handleAiEdit`, then renders a side-by-side diff view. The user accepts (merge into draft buffer) or rejects (discard). Saving a draft is a separate action: `PUT /api/skills/[slug]/draft`.

Implications worth knowing for handoff: any logged-in user can spend Anthropic API credits via this route. There is no rate limit, no model whitelist, no input length cap beyond the SDK default. If this becomes a problem, the natural place to gate it is auth-level (require a role, or per-user quota in `apiTokens`).

---

## Cross-cutting notes

- **Kill switches** — `ARENA_ENABLED=false` short-circuits arena routes; `SCRAPER_ENABLED=false` short-circuits the scrape cron. Both are checked early in the handler, not in middleware.
- **Telemetry vs activity events** — `skill_invocations` is per-call usage telemetry written by the MCP server. `activity_events` is human-meaningful audit (sync, pin, publish, role change, feedback status). Don't conflate.
- **Append-only tables with no retention** — `arena_llm_calls`, `arena_elo_history`, `arena_pipeline_events`, `skill_invocations`, `activity_events`. All grow forever today. (`source_snapshots` is pruned weekly by maintenance; `learnings` are auto-dismissed at 90 days.) First place to add cleanup when DB cost becomes a concern.
- **No interactive transactions** — the Neon HTTP driver lacks them. For atomicity across multiple statements, use `db.batch([...])` (see `packages/db/src/publish.ts` for the pattern).
