# Changelog

## [Unreleased]

### Added

- **Usage telemetry schema** — Two new Drizzle tables: `skill_invocations` (per-invocation logging) and `skill_feedback` (end-of-session ratings). Indexed for Workshop and Dashboard queries. `sync_events` deferred to Phase 03.
- **`claudefather_log_invocation` MCP tool** — Fire-and-forget skill invocation logging. Called by the PostToolUse hook or explicitly by skills that want to report duration/metadata.
- **`claudefather_session_feedback` MCP tool** — End-of-session skill ratings (1-5) with optional comments.
- **PostToolUse telemetry hook** — `posttooluse-telemetry.sh` automatically detects Skill tool invocations and logs them to a session-local JSONL file. Zero-touch for skill authors.
- **Telemetry API endpoints (read-only)** — GET `/api/telemetry/stats/:skillSlug`, GET `/api/telemetry/overview`. Write operations handled exclusively by MCP tools.
- **Claudefather Platform permission category** — New opt-in category in `recommended-permissions.json` for MCP tool auto-approval.
- **Shared telemetry instructions** — `global/skills/_shared/telemetry-instructions.md` reference for skills that want to report duration/metadata.

- **`sync_events` audit trail table** — Drizzle table for logging sync, rollback, pin, and unpin operations with JSONB details.
- **`claudefather_rollback` MCP tool** — Fetch a previous version of a skill from the registry for rollback. Supports specific version or "previous" shorthand.
- **`claudefather_pin` MCP tool** — Pin a skill to a specific version. Pinned skills are skipped during sync.
- **`claudefather_unpin` MCP tool** — Remove version pin from a skill, resuming tracking of latest.
- **`claudefather_publish` MCP tool** — Admin-only tool to publish new skill versions with changelog entries. Supports explicit version or auto-bump (patch/minor/major).
- **`/claudefather-sync` skill** — New skill at `global/skills/claudefather-sync/SKILL.md` with MCP-backed sync protocol and legacy git-based fallback via `references/sync-protocol.md`.

### Changed

- **`claudefather_check_updates` enhanced** — Now returns structured JSON with `updates`, `new_skills`, `removed_skills`, `pinned_skills`, and `up_to_date` categories instead of plain text.
- **`claudefather_sync` enhanced** — Now accepts version-aware input `{skills: [{slug, version, action}]}` and logs sync events to the audit trail.
- **`/session-handoff` telemetry integration** — New Steps 3.5 (submit telemetry) and 3.6 (collect feedback) between changelog and handoff file writing. Telemetry submission is silent; feedback collection is one-prompt opt-in.

---

- **Skills platform foundation** — New `packages/` monorepo with three packages:
  - `@claudefather/db`: PostgreSQL schema (Neon serverless) with tables for users, API tokens, skills, skill versions, and user skill pins. Drizzle ORM for type-safe queries. Seed script imports all 38 skills as v1.0.0.
  - `@claudefather/mcp-server`: Railway-hosted MCP server (Streamable HTTP transport) with three tools — `claudefather_sync` (fetch skills from registry, returns content for Claude Code to write), `claudefather_check_updates` (check for newer versions), `claudefather_whoami` (show auth status). Connects directly to Neon database.
  - `@claudefather/web`: Next.js web app on Vercel with GitHub OAuth login, API token management (generate, revoke, rotate), connection health metrics, and MCP configuration snippet.
