# Skills Platform — Session Overview

**Session:** skills-platform
**Date:** 2026-03-03
**Scope:** Evolve claudefather from a file-copy skill distribution tool into a centralized skills platform with a registry, MCP-backed sync, telemetry, feedback, a Workshop UI, and an intelligence pipeline.

## Context

Claudefather manages 38 skills for a team of ~20 users. Today it uses git-clone + file-copy distribution with zero visibility into adoption, quality, or best practices. The maintainer is flying blind.

This session designs a 6-phase platform that adds:
1. A central skill registry with MCP-based distribution
2. Usage telemetry and feedback collection
3. Skill versioning with rollback and pinning
4. A Workshop UI for skill editing, diffing, and AI-assisted refinement
5. A team dashboard for adoption and health monitoring
6. An intelligence pipeline that scrapes AI ecosystem changes and proposes skill improvements

## Phase Summary

| # | Phase | Impact | Effort | Risk | Depends On | Unlocks | Status |
|---|-------|--------|--------|------|------------|---------|--------|
| 01 | Skill Registry, MCP Server & Auth | High | High (~3-4 weeks) | High | None | 02, 03, 04, 05 | COMPLETE |
| 02 | Usage Telemetry & Feedback | High | High (~3-4 days) | Medium | 01 | 04, 05 | COMPLETE |
| 03 | Skill Versioning & Sync Protocol | High | High (~3-5 days) | High | 01 | 04 | COMPLETE |
| 04 | Workshop UI | High | High (~3-4 weeks) | High | 01, 02, 03 | 06 | COMPLETE |
| 05 | Team Dashboard | Medium | High (~40-50 hours) | Medium | 01, 02, 03 | 06 | COMPLETE |
| 06 | Intelligence Pipeline | Medium | High (~3-5 days) | Medium | 01, 04 | None | COMPLETE |

## Dependency Graph

```
Phase 01: Registry + MCP + Auth  ─────┬──────┬──────────────────┐
                                       │      │                  │
Phase 02: Telemetry & Feedback   ◄─────┘      │                  │
                                  │            │                  │
Phase 03: Versioning & Sync      ◄────────────┘                  │
                                  │                               │
Phase 04: Workshop UI            ◄────(depends on 01, 02, 03)    │
                                  │                               │
Phase 05: Team Dashboard         ◄────(depends on 01, 02, 03)    │
                                  │    (parallel with Phase 04)   │
Phase 06: Intelligence Pipeline  ◄────(depends on 01, 04)────────┘
```

## Parallel Safety

- **Phases 02 and 03** can run in parallel after Phase 01 (touch different tables and tools)
- **Phases 04 and 05** can run in parallel after 02+03 (different routes/pages in same Next.js app)
- **Phase 06** must wait for 01 and 04

## Tech Stack

| Component | Technology | Hosting |
|-----------|-----------|---------|
| Database | PostgreSQL (Neon serverless) | Neon |
| Web App + API | Next.js 14+ / TypeScript | Vercel |
| MCP Server | TypeScript (@modelcontextprotocol/sdk, Streamable HTTP transport) | Railway |
| Auth | GitHub OAuth | Via Next.js app |
| AI Editing | Anthropic API (Claude Sonnet) | API calls from server |
| Intelligence Distillation | Anthropic API (Claude Haiku) | Scheduled serverless functions |
| Scraping | Vercel Cron + fetch | Vercel |

## Key Design Decisions

1. **Skills must live on local filesystem** — Claude Code loads skills from `~/.claude/skills/` at session start. MCP tools return skill content; Claude Code writes to disk. MCP cannot serve skills at runtime.
2. **MCP is a remote server on Railway** — No local npm package to install. Users configure a URL + token in `settings.json`. The MCP server handles auth, sync, telemetry, and feedback over Streamable HTTP transport.
3. **MCP replaces git-clone distribution** — Same UX (interactive `/claudefather-sync`), but backed by registry instead of file diff.
4. **GitHub OAuth for identity** — Any GitHub account, not org-specific. Tokens linked to GitHub identity with expiration and rotation.
5. **Workshop is a staging area** — AI proposes changes, maintainer reviews and approves. No autonomous skill modification.
6. **Backward compatible** — Users without MCP configured fall back to legacy git-based sync.

## Phase Documents

- `01_skill-registry-mcp-server.md` — Database schema, MCP server, GitHub OAuth, token management UI
- `02_telemetry-feedback.md` — Invocation logging, feedback collection, PostToolUse hook, session-handoff integration
- `03_skill-versioning-sync.md` — Semver per skill, MCP-backed sync, rollback, pinning, publish workflow
- `04_workshop-ui.md` — Skill editor, side-by-side diffing, AI-assisted editing, feedback dashboard, learnings browser
- `05_team-dashboard.md` — Admin views for adoption, version health, feedback triage, activity feed
- `06_intelligence-pipeline.md` — Source monitoring, distillation via Claude API, learnings integration

## Implementation

Run `/implement-plan documentation/planning/phases/skills-platform_2026-03-03/` to start building — it will handle challenge review, branching, implementation, and PRs for each phase doc.
