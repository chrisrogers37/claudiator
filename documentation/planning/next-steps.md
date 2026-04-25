# Claudiator -- Next Steps

**Date:** 2026-04-25
**Status:** Planning
**Context:** All prior development plans (skills-platform, arena-quality-signal) are COMPLETED and archived. The system is fully built but has never processed real skills or run a real battle. This document captures the path from "built" to "running."

## Current State

- **Database:** Clean (all tables truncated 2026-04-12). No skills, categories, or rankings.
- **Test suite:** 66 unit tests covering pure arena logic (ELO, judgments, votes, costs, etc.)
- **Schema:** Consolidated on two-level taxonomy (domain/function via categoryId FK). Old text enum removed.
- **Migration runner:** Working with neon-http driver (breakpoint markers, journal synced).
- **Pipeline code:** Complete but untested against real data.

## Immediate Priorities

### 1. Populate Skills from Local Directory

The ~45 skills at `~/.claude/skills/` need to enter the system. The GitHub discovery pipeline expects a repo with SKILL.md files, but most skills aren't in the claudiator repo anymore (only 2 remain in `global/skills/`).

**Options:**
- **A) Commit skills back to repo** -- add `~/.claude/skills/*` contents into `global/skills/`, then run the GitHub discovery pipeline against `chrisrogers37/claudiator`
- **B) Build a local intake path** -- new script that reads from `~/.claude/skills/` directly and creates intake candidates, bypassing GitHub
- **C) Seed directly** -- update `seed.ts` to read from `~/.claude/skills/` and populate skills + versions, then run the category council on each

**Recommendation:** Option C is fastest. The seed script already reads from `global/skills/` -- update the path to `~/.claude/skills/` or make it configurable. After seeding, run categorization to assign each skill to the taxonomy.

### 2. Seed Skill Categories with Custom Rubrics

The category council creates categories on-the-fly, but for meaningful battles, key categories need curated rubrics. Priority categories to seed with rubrics:

| Domain | Function | Rubric Focus |
|--------|----------|-------------|
| workflow | handoff | Actionability, context preservation, completeness, parsability |
| workflow | resume | Speed, accuracy, signal-to-noise, suggested actions |
| git | commit | Message quality, scope detection, conventional format |
| code-review | pr | Coverage, actionability, tone, false positive rate |
| planning | implement | Plan adherence, phasing, error handling, verification |

Use `POST /api/arena/categories` to create each with a custom 4-dimension rubric.

### 3. Run First Real Battle

End-to-end validation:
1. Pick two skills in the same category (e.g., two `workflow/handoff` implementations)
2. Submit both as intake candidates
3. Run categorization + scoring
4. Execute a battle via the Web UI
5. Verify: scenarios are domain-relevant, judges use the custom rubric, verdict synthesis is coherent, ELO updates correctly

### 4. Arena Test Harness Validation

The test harness (`cd packages/web && pnpm arena-test`) supports `discover`, `status`, `battle`, and `full` modes. After seeding:
- `pnpm arena-test status` -- verify skills and categories are populated
- `pnpm arena-test battle` -- run an automated battle
- `pnpm arena-test full` -- full pipeline test

## Follow-up Work

### Testing
- Extract more pure logic for unit tests (matchmaker config, intake thresholds, prompt builders) -- follows the pattern established with the existing 10 test files
- Integration tests for DB-dependent functions (publishNewVersion, updateRankings) -- requires test DB strategy

### Infrastructure
- Clean up 14 stale local branches (all merged)
- Vercel redeploy to pick up latest code (category consolidation, migration fixes)
- Railway MCP server redeploy if schema changes affect sync/publish tools

### Documentation
- Environment setup guide (local dev, GitHub OAuth, Neon connection)
- Deployment guide (Vercel + Railway + Neon)
- CHANGELOG: consider cutting a version tag for the current state

## Open Questions

- Should skills be committed to the repo for GitHub discovery, or should the system support local-directory intake natively?
- How to handle skill versioning when ingesting from `~/.claude/skills/` (no git history for versions)?
- Should the arena auto-discover and battle skills on a schedule, or remain manually triggered?
