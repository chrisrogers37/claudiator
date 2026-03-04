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

### Changed

- **`/session-handoff` telemetry integration** — New Steps 3.5 (submit telemetry) and 3.6 (collect feedback) between changelog and handoff file writing. Telemetry submission is silent; feedback collection is one-prompt opt-in.

---

- **Skills platform foundation** — New `packages/` monorepo with three packages:
  - `@claudefather/db`: PostgreSQL schema (Neon serverless) with tables for users, API tokens, skills, skill versions, and user skill pins. Drizzle ORM for type-safe queries. Seed script imports all 38 skills as v1.0.0.
  - `@claudefather/mcp-server`: Railway-hosted MCP server (Streamable HTTP transport) with three tools — `claudefather_sync` (fetch skills from registry, returns content for Claude Code to write), `claudefather_check_updates` (check for newer versions), `claudefather_whoami` (show auth status). Connects directly to Neon database.
  - `@claudefather/web`: Next.js web app on Vercel with GitHub OAuth login, API token management (generate, revoke, rotate), connection health metrics, and MCP configuration snippet.
