# Changelog

## [Unreleased]

### Added

- **Skills platform foundation** — New `packages/` monorepo with three packages:
  - `@claudefather/db`: PostgreSQL schema (Neon serverless) with tables for users, API tokens, skills, skill versions, and user skill pins. Drizzle ORM for type-safe queries. Seed script imports all 38 skills as v1.0.0.
  - `@claudefather/mcp-server`: Railway-hosted MCP server (Streamable HTTP transport) with three tools — `claudefather_sync` (fetch skills from registry, returns content for Claude Code to write), `claudefather_check_updates` (check for newer versions), `claudefather_whoami` (show auth status). Connects directly to Neon database.
  - `@claudefather/web`: Next.js web app on Vercel with GitHub OAuth login, API token management (generate, revoke, rotate), connection health metrics, and MCP configuration snippet.
