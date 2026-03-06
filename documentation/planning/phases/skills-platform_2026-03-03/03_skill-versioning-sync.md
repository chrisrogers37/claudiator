# Phase 03: Skill Versioning & Sync Protocol

**Status:** COMPLETE
**Started:** 2026-03-04
**Completed:** 2026-03-04
**PR:** #5

**PR Title:** add skill versioning, MCP-backed sync, rollback, and version pinning
**Risk Level:** High
**Estimated Effort:** High (~3-5 days)
**Files Modified:** 3 (`packages/mcp-server/src/tools/check-updates.ts`, `packages/mcp-server/src/tools/sync.ts`, `global/recommended-permissions.json`)
**Files Created:** 7 (`global/skills/claudefather-sync/SKILL.md`, `global/skills/claudefather-sync/references/sync-protocol.md`, `packages/mcp-server/src/tools/rollback.ts`, `packages/mcp-server/src/tools/pin.ts`, `packages/mcp-server/src/tools/unpin.ts`, `packages/mcp-server/src/tools/publish.ts`, `packages/db/src/schema.ts` — syncEvents table added)
**Files Deleted:** 0 (legacy command only exists in claudefather repo, not this repo)

---

## Context

The current `/claudefather-sync` is a git-based file-copy command (`global/commands/claudefather-sync.md`, 184 lines) that discovers the claudefather repo via a breadcrumb file (`~/.claude/.claudefather-repo`), diffs every managed file pair, and walks the user through interactive Pull/Push/Skip prompts. It has no concept of versions, no rollback capability, no diffing at the semantic level (just raw `diff -u`), and no audit trail.

At 20 users this creates real pain points (documented in `/private/tmp/claude-501/product-enhance-2026-03-03_000000/research/install-mechanism.md`):

- **Silent divergence** between syncs with no detection mechanism
- **40+ interactive prompts** per sync session because every file is checked individually
- **No rollback** on mid-sync failure or bad skill update
- **No versioning** -- cannot pin a skill version or roll back a single skill independently
- **No audit trail** -- changes applied immediately with no record of what changed when

This phase replaces the file-copy sync with an MCP-backed protocol that introduces independent semver per skill, a diff manifest (check for updates once, approve in batch), rollback to any previous version, and version pinning. The UX remains the same familiar interactive format -- the user still runs `/claudefather-sync` and approves changes interactively -- but the backend shifts from git-clone-and-diff to MCP-server-and-registry.

**Key constraint:** Skills must live on the local filesystem at `~/.claude/skills/` (Claude Code loads them at session start into the system prompt). The MCP server is the distribution layer, not the execution layer. Sync writes SKILL.md files to disk; Claude Code reads them at next session start.

---

## Dependencies

- **Depends on:** Phase 01 (Registry & MCP Server). This phase requires the `skills` table, `skill_versions` table, `user_skill_pins` table, and the Railway-hosted MCP server with authentication. Phase 03 cannot begin until Phase 01's database schema and MCP server are deployed. (The `sync_events` table is created IN this phase, not a Phase 01 dependency.)
- **Can run in parallel with:** Phase 02 (Telemetry & Feedback). Phase 02 touches `invocations` and `feedback` tables; Phase 03 touches `skill_versions`, `user_skill_pins`, and `sync_events` tables. No table overlap, no file overlap.
- **Unlocks:** Phase 04 (Workshop UI). The Workshop needs version history from `skill_versions` to display diffs, changelogs, and rollback options in the web UI.

---

## Detailed Implementation Plan

### Step 1: Migrate `/claudefather-sync` from Command to Skill

The current sync lives at `global/commands/claudefather-sync.md` (installed to `~/.claude/commands/claudefather-sync.md`). Commands are the legacy format. Migrate it to the skills format so the new implementation can use `allowed-tools` and MCP tool references.

**Create new directory:** `global/skills/claudefather-sync/`

**Create:** `global/skills/claudefather-sync/SKILL.md`

```yaml
---
name: claudefather-sync
description: "Sync skills from the claudefather registry. Checks for updates, shows diffs, and applies approved changes. Supports rollback and version pinning."
allowed-tools:
  - "Bash(git *)"
  - "Bash(diff *)"
  - "Bash(ls *)"
  - "Bash(cat *)"
  - "Bash(date *)"
  - "Bash(mkdir *)"
  - "Bash(cp *)"
  - "Bash(chmod *)"
  - "mcp__claudefather__claudefather_check_updates"
  - "mcp__claudefather__claudefather_sync"
  - "mcp__claudefather__claudefather_rollback"
  - "mcp__claudefather__claudefather_pin"
  - "mcp__claudefather__claudefather_unpin"
  - "Read(*)"
  - "Write(*)"
  - "Glob(*)"
  - "Grep(*)"
---
```

The Markdown body of SKILL.md follows below in Step 3.

**Delete:** N/A — `global/commands/claudefather-sync.md` only exists in the original claudefather repo, not in the-claudefather. No file to delete.

**Update:** `global/recommended-permissions.json` — the `claudefather-mcp` category already exists from Phase 02. Add the new tool permissions for rollback, pin, unpin, and publish. The actual MCP permission naming convention is `mcp__claudefather__claudefather_<tool_name>` (double claudefather prefix — the first is the MCP server name, the second is the tool name prefix).

**Tool naming decision (Challenge Round):** Enhance the existing `claudefather_sync` tool rather than creating a new `claudefather_sync` tool. The existing tool is extended with version-aware input and sync event logging.

### Step 2: Design the Version File Convention

Each skill directory gets a `.version` file containing a single line: the semver string.

**Location:** `~/.claude/skills/<name>/.version`

**Format:** Plain text, single line, no trailing newline. Example contents: `1.2.3`

**Why a separate file instead of SKILL.md frontmatter:**

1. The MCP `check_updates` tool needs to read installed versions quickly. Reading and parsing YAML frontmatter from 34+ SKILL.md files is slower and more error-prone than reading 34 single-line files.
2. SKILL.md content is loaded into Claude Code's system prompt at session start. Adding a `version:` field to frontmatter would waste system prompt tokens on metadata the model does not need.
3. `.version` is invisible to Claude Code's skill scanner (it only parses `SKILL.md`), so it cannot cause unexpected behavior.

**During initial migration:** When a user first runs the new MCP-backed sync, their existing skills will have no `.version` files. The `check_updates` tool treats missing `.version` as version `0.0.0` -- meaning every skill shows as "update available" on first MCP sync. This is intentional: it seeds the version files.

**The `_shared/` directory** also gets a `.version` file. Although `_shared/` has no SKILL.md, it contains `orchestration-guide.md` which is versioned content shared by 7 skills. Version it independently with the same semver convention.

### Step 3: Implement the New Sync Skill Body

The SKILL.md body for `global/skills/claudefather-sync/SKILL.md` (after the YAML frontmatter from Step 1):

```markdown
# Claudefather Sync

Check for skill updates from the claudefather registry and apply approved changes. Supports rollback and version pinning.

## Mode Detection

Check if the `claudefather` MCP server is configured:
1. Look for `mcp__claudefather__claudefather_check_updates` in available tools
2. If available → MCP MODE (Steps 1-7 below)
3. If not available → FALLBACK MODE (see Fallback section at bottom)

---

## MCP MODE

### Step 1: Gather Installed Versions

Read the `.version` file from each skill directory:

For each directory in `~/.claude/skills/`:
- Read `~/.claude/skills/<name>/.version`
- If `.version` exists → record the semver string
- If `.version` is missing → record as `0.0.0`
- Also read `~/.claude/skills/_shared/.version` (shared orchestration reference)

Build a manifest object:
```json
{
  "installed": {
    "review-pr": "1.2.0",
    "quick-commit": "1.0.3",
    "design-review": "0.0.0",
    "_shared": "1.1.0"
  }
}
```

### Step 2: Check for Updates

Call the `claudefather_check_updates` MCP tool with the installed manifest.

The MCP tool compares installed versions against the registry's latest versions and returns a diff manifest:

```json
{
  "updates": [
    {
      "slug": "review-pr",
      "installed_version": "1.2.0",
      "latest_version": "1.3.0",
      "bump_type": "MINOR",
      "changelog": "Added support for draft PR reviews",
      "is_pinned": false
    }
  ],
  "new_skills": [
    {
      "slug": "new-skill-name",
      "latest_version": "1.0.0",
      "description": "A brand new skill"
    }
  ],
  "removed_skills": [
    {
      "slug": "deprecated-skill",
      "installed_version": "1.0.0",
      "reason": "Superseded by new-skill-name"
    }
  ],
  "pinned_skills": [
    {
      "slug": "implement-plan",
      "installed_version": "2.0.0",
      "latest_version": "2.1.0",
      "pinned_at": "2.0.0"
    }
  ],
  "up_to_date": ["quick-commit", "design-review"]
}
```

### Step 3: Present Status Table

Display the results in the familiar interactive format:

```
Claudefather Sync — Registry Mode
═══════════════════════════════════════════
  Updates available:
    review-pr          v1.2.0 → v1.3.0  (MINOR)
      └ Added support for draft PR reviews

  New skills:
    new-skill-name     v1.0.0
      └ A brand new skill

  Removed from registry:
    deprecated-skill   v1.0.0  ⚠ superseded by new-skill-name

  Pinned (skipped):
    implement-plan     📌 v2.0.0 (latest: v2.1.0)

  Up to date:
    quick-commit       ✓ v1.0.3
    design-review      ✓ v1.0.0
═══════════════════════════════════════════
  N updates · N new · N removed · N pinned · N up to date
```

If everything is up to date and there are no new or removed skills, say so and stop.

If the user passed the argument `status`, stop here (report only).

### Step 4: Interactive Approval

Walk through each change category and ask for approval:

**Updates:**
For each skill with an update:
1. Show the skill name, version bump, and changelog
2. Ask: **"Update <name> from v1.2.0 to v1.3.0? [Y/n]"**

**New skills:**
For each new skill:
1. Show the name, version, and description
2. Ask: **"Install <name> v1.0.0? [Y/n]"**

**Removed skills:**
For each removed skill:
1. Show the name and reason
2. Ask: **"Remove <name>? (backed up) [y/N]"** (default: no — keep the skill locally even if removed from registry)

Collect the list of approved changes.

### Step 5: Backup Before Sync

Before making any changes, create a timestamped backup:

```bash
BACKUP_DIR=~/.local/share/claudefather/backups/$(date +%Y-%m-%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
cp -r ~/.claude/skills "$BACKUP_DIR"/skills 2>/dev/null || true
cp -r ~/.claude/commands "$BACKUP_DIR"/commands 2>/dev/null || true
cp -r ~/.claude/agents "$BACKUP_DIR"/agents 2>/dev/null || true
cp -r ~/.claude/hooks "$BACKUP_DIR"/hooks 2>/dev/null || true
```

Print: `Backed up current files to $BACKUP_DIR`

### Step 6: Apply Approved Changes

Call the `claudefather_sync` MCP tool with the list of approved skill slugs and their target versions.

The MCP tool:
1. Fetches the full content for each approved skill version from the `skill_versions` table
2. Returns the content for each skill:

```json
{
  "synced": [
    {
      "slug": "review-pr",
      "version": "1.3.0",
      "files": {
        "SKILL.md": "<full SKILL.md content>",
        "references/review-checklist.md": "<reference file content>"
      }
    }
  ]
}
```

For each synced skill:
1. Write `SKILL.md` to `~/.claude/skills/<slug>/SKILL.md` using the Write tool
2. Write each reference file to `~/.claude/skills/<slug>/references/<filename>` using the Write tool
3. Write the version string to `~/.claude/skills/<slug>/.version` using the Write tool
4. If the skill directory has `*.sh` files (hooks), run `chmod +x` on each

For removed skills (if approved):
1. The MCP tool does NOT delete files — the skill instructs Claude to remove the directory
2. Verify the skill directory exists at `~/.claude/skills/<slug>/`
3. Remove it (the backup from Step 5 preserves it)

The MCP tool logs the sync event to the `sync_events` table with:
- User ID (from API token)
- Timestamp
- Skills updated (slugs + from/to versions)
- Skills installed (new)
- Skills removed
- Skills skipped (user declined)
- Skills pinned (auto-skipped)

### Step 7: Summary

```
Sync Complete
═══════════════════════════════════════════
  Updated:    N skills
  Installed:  N new skills
  Removed:    N skills
  Skipped:    N (user declined)
  Pinned:     N (auto-skipped)

  Backup: ~/.local/share/claudefather/backups/<timestamp>/

  Changes take effect at next session start.
═══════════════════════════════════════════
```

---

## FALLBACK MODE (No MCP Server)

If the `claudefather` MCP server is not configured, fall back to the legacy git-based sync. This preserves backward compatibility for users who have not set up their API token yet.

### Fallback Procedure

1. Read `~/.claude/.claudefather-repo` to find the repo path
2. If missing, tell the user to run `/claudefather-setup` and stop
3. Follow the legacy sync protocol documented in `references/sync-protocol.md`
4. At the end, print:

```
Note: You're using git-based sync (legacy mode).
To upgrade to registry sync with versioning and rollback:
1. Set up a claudefather API token
2. Add the MCP server config to ~/.claude/settings.json
See the setup guide for details.
```

---

## Subcommands

### /claudefather-sync rollback <skill-name> [version]

Roll back a specific skill to a previous version.

1. If no version specified, use "previous" (one version back)
2. Call `claudefather_rollback` MCP tool with skill_slug and target_version
3. The MCP tool fetches the target version content from `skill_versions`
4. Write the content to disk using Write tool
5. Update `.version` file

```
Rollback Complete
═══════════════════════════════════════════
  Skill:    review-pr
  From:     v1.3.0
  To:       v1.2.0
  Reason:   user-initiated rollback

  Takes effect at next session start.
═══════════════════════════════════════════
```

### /claudefather-sync pin <skill-name> [version]

Pin a skill to a specific version. Pinned skills are skipped during sync.

1. If no version specified, pin to current installed version
2. Call `claudefather_pin` MCP tool with skill_slug and version
3. Print confirmation:

```
Pinned: review-pr at v1.2.0
This skill will be skipped during sync until unpinned.
```

### /claudefather-sync unpin <skill-name>

Unpin a skill to resume tracking latest.

1. Call `claudefather_unpin` MCP tool with skill_slug
2. Print confirmation:

```
Unpinned: review-pr (was pinned at v1.2.0, latest is v1.3.0)
Run /claudefather-sync to update.
```

### /claudefather-sync status

Report-only mode. Runs Steps 1-3 without applying changes.
```

### Step 4: Create the Fallback Reference File

**Create:** `global/skills/claudefather-sync/references/sync-protocol.md`

This file contains the legacy git-based sync protocol, extracted from the current `global/commands/claudefather-sync.md`. The content is the current sync procedure (Steps 1-7 from `global/commands/claudefather-sync.md`) preserved verbatim so the fallback mode works identically to the old command.

Copy the full content of the current `global/commands/claudefather-sync.md` (lines 1-184) into this file. The only change: remove the top-level `# Claudefather Sync` title and replace it with `# Legacy Sync Protocol (Fallback)` since this is now a reference file, not the primary skill.

Keep all steps, all notes, all the permissions merge logic (Steps 6.5, 6.6, 6.7). The fallback mode must behave identically to the current sync for users who have not yet configured the MCP server.

### Step 5: Define MCP Tool Schemas (Phase 01 Implementation)

These tool schemas must be implemented in the MCP server (Phase 01). Document them here so the Phase 01 implementer knows what Phase 03 expects.

**Tool: `claudefather_check_updates`** (already exists from Phase 01 — extend output)

```
Name: claudefather_check_updates
Description: Compare installed skill versions against the registry. Returns a diff manifest showing available updates, new skills, removed skills, and pinned skills.

Input Schema (Phase 01, unchanged):
{
  "type": "object",
  "properties": {
    "installed": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "slug": { "type": "string" },
          "version": { "type": "string" }
        },
        "required": ["slug", "version"]
      }
    }
  },
  "required": ["installed"]
}

Output: JSON object with keys: updates, new_skills, removed_skills, pinned_skills, up_to_date
(See Step 2 of the sync flow for the full response schema)
```

**Note:** The input schema matches the existing Phase 01 implementation. Phase 03 rewrites the output from plain text to structured JSON with `updates`, `new_skills`, `removed_skills`, `pinned_skills`, `up_to_date` categories (Phase 01 only returns basic text). The JSON is returned in the MCP text content field — Claude Code parses it fine.

**Challenge Round decision:** Full rewrite of check-updates.ts to return structured JSON instead of text.

**Tool: `claudefather_sync`** (already exists from Phase 01 — enhance input schema)

```
Name: claudefather_sync
Description: Fetch full content for specified skill versions from the registry. Logs the sync event.

Current Input Schema (Phase 01):
{ dryRun?: boolean, skills?: string[] }

Enhanced Input Schema (Phase 03):
{
  "type": "object",
  "properties": {
    "skills": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "slug": { "type": "string" },
          "version": { "type": "string" },
          "action": { "type": "string", "enum": ["update", "install", "remove"] }
        },
        "required": ["slug", "version", "action"]
      }
    }
  },
  "required": ["skills"]
}

Output: JSON object with key "synced" containing array of skill objects with slug, version, and files map.
For "remove" actions, the tool logs the removal but does NOT delete local files (the skill handles deletion).

Note: The existing Phase 01 interface (dryRun, string[] skills) is replaced with the version-aware format.
The actual schema uses separate content (text) + references (jsonb) columns — the tool assembles
the files map at read time (as the existing sync.ts already does).
```

**Tool: `claudefather_rollback`**

```
Name: claudefather_rollback
Description: Fetch a specific previous version of a skill from the registry.

Input Schema:
{
  "type": "object",
  "properties": {
    "skill_slug": { "type": "string" },
    "target_version": {
      "type": "string",
      "description": "Semver string or 'previous' for one version back"
    }
  },
  "required": ["skill_slug", "target_version"]
}

Output: JSON object with slug, version, files map (same format as claudefather_sync response), and previous_version field.
Logs rollback event to sync_events table.
```

**Tool: `claudefather_pin`**

```
Name: claudefather_pin
Description: Pin a skill to a specific version. Pinned skills are skipped during sync.

Input Schema:
{
  "type": "object",
  "properties": {
    "skill_slug": { "type": "string" },
    "version": {
      "type": "string",
      "description": "Semver string to pin to. If omitted, pins to user's current installed version."
    }
  },
  "required": ["skill_slug"]
}

Output: JSON object with slug, pinned_version, latest_version.
Creates/updates record in user_skill_pins table.
```

**Tool: `claudefather_unpin`**

```
Name: claudefather_unpin
Description: Remove version pin from a skill, resuming tracking of latest.

Input Schema:
{
  "type": "object",
  "properties": {
    "skill_slug": { "type": "string" }
  },
  "required": ["skill_slug"]
}

Output: JSON object with slug, was_pinned_at, latest_version.
Deletes record from user_skill_pins table.
```

**Tool: `claudefather_publish` (Admin only)**

```
Name: claudefather_publish
Description: Publish a new version of a skill to the registry. Admin-only — requires admin-scoped API token.

Input Schema:
{
  "type": "object",
  "properties": {
    "skill_slug": { "type": "string" },
    "version": {
      "type": "string",
      "description": "Explicit semver string for the new version"
    },
    "bump_type": {
      "type": "string",
      "enum": ["patch", "minor", "major"],
      "description": "Auto-bump from current latest. Ignored if 'version' is provided."
    },
    "changelog": {
      "type": "string",
      "description": "Human-readable changelog entry for this version"
    },
    "files": {
      "type": "object",
      "description": "Map of relative file paths to content. Must include 'SKILL.md'.",
      "additionalProperties": { "type": "string" }
    }
  },
  "required": ["skill_slug", "files"]
}

Output: JSON object with slug, version, previous_version, changelog, created_at.
Creates new record in skill_versions with is_latest=true, sets previous latest to is_latest=false.
```

### Step 6: Define Database Tables

`skill_versions` and `user_skill_pins` already exist from Phase 01. The `sync_events` table must be created in this phase.

**Table: `skill_versions`** (Phase 01 — exists)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `skill_id` | UUID | FK to `skills` table |
| `version` | TEXT | Semver string (e.g., "1.3.0") |
| `content` | TEXT | Full SKILL.md text including frontmatter |
| `references` | JSONB | Map of reference file paths to content (e.g., `{"references/foo.md": "..."}`) |
| `changelog` | TEXT | Human-readable changelog entry |
| `is_latest` | BOOLEAN | True for the current version, false for all others |
| `published_by` | UUID | FK to `users` table (the admin who published) |
| `published_at` | TIMESTAMP | When this version was published |

**Note:** The `content` + `references` columns are assembled into a `files` map at read time by the MCP tool (SKILL.md content + references entries). The `publish` tool accepts a `files` map and splits it into these two columns on write.

**Unique constraint:** `(skill_id, version)` -- cannot have duplicate versions for the same skill.

**Index:** `(skill_id, is_latest)` -- fast lookup of current version per skill.

**Table: `user_skill_pins`** (Phase 01 — exists)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to `users` table |
| `skill_id` | UUID | FK to `skills` table |
| `pinned_version` | VARCHAR(20) | Semver string the user is pinned to |
| `created_at` | TIMESTAMP | When the pin was created |

**Unique constraint:** `(user_id, skill_id)` -- one pin per user per skill.

**Table: `sync_events`** (NEW — created in Phase 03)

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to `users` table |
| `event_type` | VARCHAR(20) | `sync`, `rollback`, `pin`, `unpin` |
| `details` | JSONB | Event-specific payload (skills updated, versions, etc.) |
| `created_at` | TIMESTAMP | When the event occurred |

**Index:** `user_id, created_at DESC` -- for audit trail queries.

**Implementation:** Add this table to `packages/db/src/schema.ts` as a Drizzle `pgTable` definition alongside the existing tables. Generate migration with `drizzle-kit generate`.

### Step 7: Update `/claudefather-setup` to Seed Version Files

**SKIPPED (Challenge Round decision):** `claudefather-setup` does not exist in the-claudefather repo and is not needed. The first MCP sync treats missing `.version` files as `0.0.0` and offers updates for all skills, which seeds the version files automatically. This step degrades gracefully with no action required.

---

## Test Plan

### Unit Tests (MCP Server Side)

These tests verify the MCP tool implementations in the server codebase (Phase 01's server, extended in Phase 03).

1. **`check_updates` — all up to date:** Pass installed versions matching registry latest. Expect empty `updates`, `new_skills`, `removed_skills` arrays.

2. **`check_updates` — version behind:** Pass `{"review-pr": "1.2.0"}` when registry has `1.3.0`. Expect `updates` array with `review-pr` entry, correct `bump_type`.

3. **`check_updates` — first sync (all 0.0.0):** Pass all skills as `0.0.0`. Expect every skill in `updates` array.

4. **`check_updates` — pinned skill:** Pin `implement-plan` at `2.0.0`, registry has `2.1.0`. Expect it in `pinned_skills`, NOT in `updates`.

5. **`check_updates` — new skill in registry:** Registry has a skill not in installed manifest. Expect it in `new_skills`.

6. **`check_updates` — removed skill from registry:** Installed manifest has a skill not in registry. Expect it in `removed_skills`.

7. **`claudefather_sync` — basic update:** Sync `review-pr` to `1.3.0`. Verify response includes full file content. Verify `sync_events` record created.

8. **`claudefather_sync` — multi-file skill:** Sync a skill with `references/` files. Verify all files included in response.

9. **`rollback` — to previous:** Rollback `review-pr` with `target_version: "previous"`. Verify returns previous version content. Verify `sync_events` logged as rollback.

10. **`rollback` — to specific version:** Rollback to `1.1.0`. Verify correct content returned.

11. **`rollback` — nonexistent version:** Rollback to `9.9.9`. Expect error response.

12. **`pin` — basic:** Pin `review-pr` at `1.2.0`. Verify `user_skill_pins` record created.

13. **`pin` — already pinned:** Pin `review-pr` again at different version. Verify record updated (not duplicated).

14. **`unpin` — basic:** Unpin `review-pr`. Verify record deleted. Verify response includes latest version.

15. **`unpin` — not pinned:** Unpin a skill that is not pinned. Expect graceful handling (not an error).

16. **`publish` — new version:** Publish `review-pr` at `1.3.0`. Verify `skill_versions` record created with `is_latest=true`. Verify previous version set to `is_latest=false`.

17. **`publish` — auto-bump:** Publish with `bump_type: "minor"` when current latest is `1.2.0`. Verify new version is `1.3.0`.

18. **`publish` — admin auth:** Attempt publish with non-admin token. Expect authorization error.

### Integration Tests (Client Side)

These tests verify the skill's behavior end-to-end.

1. **MCP mode detection:** With MCP server configured, verify sync enters MCP mode (calls `check_updates`). Without MCP server, verify sync enters fallback mode (reads breadcrumb).

2. **Version file reading:** Create `.version` files with known values in `~/.claude/skills/`. Run sync. Verify the installed manifest sent to `check_updates` matches the file contents.

3. **Missing .version files:** Remove all `.version` files. Run sync. Verify all skills report as `0.0.0`.

4. **Write-to-disk verification:** After sync applies an update, verify:
   - `SKILL.md` content matches what the MCP tool returned
   - `.version` file contains the new version string
   - Reference files (if any) are written correctly

5. **Backup verification:** After sync, verify backup directory contains pre-sync state of all skill directories.

6. **Rollback write verification:** After rollback, verify `.version` and SKILL.md match the target version.

7. **Fallback mode full cycle:** Without MCP server, run sync end-to-end. Verify it behaves identically to the current `claudefather-sync.md` command.

### Manual Verification Steps

1. **First-time MCP sync:** Set up MCP server with a token. Run `/claudefather-sync`. Verify all skills show as "update available" (since no `.version` files exist yet). Approve all. Verify `.version` files created.

2. **Subsequent sync — no changes:** Run `/claudefather-sync` again immediately. Verify "Everything up to date."

3. **Subsequent sync — with update:** Publish a new version of one skill via `claudefather_publish`. Run sync. Verify only that skill shows as update available.

4. **Status-only mode:** Run `/claudefather-sync status`. Verify it shows the status table but does not prompt for changes.

5. **Rollback:** Run `/claudefather-sync rollback review-pr`. Verify skill content reverts to previous version.

6. **Pin and sync:** Pin a skill. Publish a new version. Run sync. Verify the pinned skill shows as "pinned (skipped)" and is NOT offered for update.

7. **Unpin and sync:** Unpin the skill. Run sync. Verify it now shows as update available.

8. **Fallback mode:** Remove MCP server URL from settings.json. Run `/claudefather-sync`. Verify it falls back to git-based sync with the legacy breadcrumb protocol.

---

## Documentation Updates

### CHANGELOG.md

Add under `## [Unreleased]`:

```markdown
### Changed
- **`/claudefather-sync` created as skill** — new skill at `global/skills/claudefather-sync/SKILL.md` with MCP-backed sync and legacy fallback via `references/sync-protocol.md`.
- **MCP-backed sync protocol** — `/claudefather-sync` now uses the claudefather MCP server for update checking, skill content delivery, and sync event logging. Interactive approval UX preserved. Falls back to git-based sync when MCP server is not configured.

### Added
- **Skill versioning** — each skill gets independent semver (MAJOR.MINOR.PATCH) tracked via `.version` files in `~/.claude/skills/<name>/`. Version history stored in the registry.
- **Rollback support** — `/claudefather-sync rollback <skill> [version]` reverts a skill to any previous version from the registry.
- **Version pinning** — `/claudefather-sync pin <skill> [version]` freezes a skill at a specific version, skipping it during sync. `/claudefather-sync unpin <skill>` resumes tracking latest.
- **Publishing workflow** — `claudefather_publish` MCP tool for admin to publish new skill versions with changelog entries.
- **Sync event logging** — all sync, rollback, pin, and unpin operations logged to `sync_events` table for audit trail.
- **MCP tools permission category** — `claudefather-mcp` category in `recommended-permissions.json` for MCP tool auto-approval.
```

### README.md

Update the Configuration section to mention the new sync capabilities:

```markdown
### Sync & Versioning

`/claudefather-sync` checks the registry for skill updates and applies them interactively.

- **Status check:** `/claudefather-sync status` — see what's changed without applying
- **Rollback:** `/claudefather-sync rollback <skill> [version]` — revert to a previous version
- **Pin:** `/claudefather-sync pin <skill>` — freeze at current version
- **Unpin:** `/claudefather-sync unpin <skill>` — resume tracking latest

Requires the claudefather MCP server. Falls back to git-based sync without it.
```

### CLAUDE.md

No changes to CLAUDE.md. The existing rules about "Never overwrite settings.json" and "Always ask before syncing" still apply and are already followed by the new sync protocol.

---

## Stress Testing and Edge Cases

### Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| No `.version` files exist (first MCP sync) | All skills report as `0.0.0`, all show as "update available" |
| `.version` file contains invalid content (e.g., "abc") | Treat as `0.0.0`, log warning |
| `.version` file exists but SKILL.md is missing | Skip this entry (orphaned version file) |
| MCP server unreachable (Railway down) | Print connection error, suggest checking API token and server URL, stop |
| MCP server returns empty registry | Print "Registry is empty — nothing to sync" and stop |
| API token expired | Railway-hosted MCP server returns 401. Print "API token expired — generate a new one" and stop |
| User declines all updates | Print "No changes applied" and stop. No backup created (nothing changed). |
| Mid-sync failure (e.g., Write tool fails) | Partial state. Backup exists. Print instructions to restore from backup. |
| Skill with large references/ directory (10+ files) | All files included in sync. No truncation. |
| Two users sync simultaneously | No conflict — each user has independent local state. Server-side tables use user-scoped records. |
| Rollback to version that was never installed | Fine — `rollback` fetches from registry by version, not from local state |
| Pin a skill that does not exist locally | Error: "Skill <name> not found locally. Install it first." |
| Publish a version that already exists | Error from MCP server: "Version 1.3.0 already exists for review-pr" (unique constraint) |
| `_shared/` directory versioning | Treated like any other skill for versioning purposes, despite having no SKILL.md |

### Performance Considerations

- **`check_updates` call:** Single request to Railway-hosted MCP server (direct DB query). Should complete in < 2 seconds even with 34+ skills.
- **`claudefather_sync` call:** Returns full file content for all approved skills in one MCP tool response. For a full sync of 34 skills, this could be 500KB-1MB of content. Acceptable for a single Streamable HTTP response.
- **Local `.version` file reads:** 34 Read tool calls. Claude Code should execute these in parallel. Total time: < 1 second.
- **Backup `cp -r`:** Copies entire `~/.claude/skills/` directory (34 skills). At ~500KB total, this completes in < 1 second.

### Security Considerations

- **API token scoping:** `claudefather_check_updates`, `claudefather_sync`, `claudefather_rollback`, `claudefather_pin`, `claudefather_unpin` require read-scoped tokens. `claudefather_publish` requires admin-scoped tokens.
- **Content integrity:** The MCP server returns skill content from the `skill_versions` table. No user input is interpolated into SKILL.md content. No injection risk.
- **Fallback mode security:** The git-based fallback uses the same local-filesystem approach as today. No new attack surface.

---

## Verification Checklist

- [ ] `global/skills/claudefather-sync/SKILL.md` exists with correct YAML frontmatter
- [ ] `global/skills/claudefather-sync/references/sync-protocol.md` contains the full legacy sync procedure
- [ ] N/A — no legacy command file exists in the-claudefather repo
- [ ] `global/recommended-permissions.json` updated with new tool permissions (rollback, pin, unpin, publish)
- [ ] MCP mode: `claudefather_check_updates` tool returns structured JSON with updates/new/removed/pinned/up_to_date
- [ ] MCP mode: `claudefather_sync` tool called with version-aware input and only user-approved skills
- [ ] MCP mode: `.version` files written after each skill update
- [ ] MCP mode: `sync_events` record created for each sync
- [ ] Fallback mode: breadcrumb file read, legacy sync protocol followed
- [ ] Fallback mode: upgrade suggestion printed at end
- [ ] Rollback: correct version content fetched, written to disk, `.version` updated
- [ ] Pin: `user_skill_pins` record created, pinned skills skipped during sync
- [ ] Unpin: `user_skill_pins` record deleted, skill available for sync
- [ ] Publish: `skill_versions` record created, `is_latest` flags updated correctly
- [ ] Publish: admin-only authorization enforced
- [ ] Backup created before any disk modifications
- [ ] Status-only mode (`/claudefather-sync status`) reports without modifying
- [ ] Interactive approval for every change (no auto-apply)
- [ ] CHANGELOG.md updated
- [ ] README.md updated with sync subcommands

---

## What NOT to Do

1. **Do NOT delete the legacy sync protocol.** Move it to `references/sync-protocol.md` so the fallback mode works. Users without MCP configuration must still be able to sync via git.

2. **Do NOT embed version in SKILL.md frontmatter.** Versions belong in `.version` files. SKILL.md content is loaded into the system prompt -- version metadata wastes tokens and could confuse the model.

3. **Do NOT auto-sync without confirmation.** Every change requires explicit user approval, same as the current sync. The MCP backend does not change this UX requirement.

4. **Do NOT store `.version` files in the git repo.** Version files are local-only state reflecting what version each user has installed. They are generated during sync, not distributed.

5. **Do NOT make the `claudefather-mcp` permission category `default: true`.** It requires the MCP server URL to be configured. Users without MCP setup would see permission errors for tools that do not exist.

6. **Do NOT build a version history UI.** That is Phase 04 (Workshop). This phase only provides the MCP tools that the Workshop will later consume.

7. **Do NOT implement automatic version bumping.** Version bumps are manual via `claudefather_publish`. Automatic bumping from the intelligence pipeline is Phase 06.

8. **Do NOT modify `~/.claude/settings.json` in this phase.** The sync protocol writes to `~/.claude/skills/` only. Settings management (permissions merge, sandbox check, etc.) is preserved in the fallback protocol but not reimplemented in MCP mode -- that is a future enhancement.

9. **Do NOT skip the backup step.** Even with rollback support, the local filesystem backup is the safety net of last resort. Rollback depends on the MCP server being reachable; backups do not.

10. **Do NOT use `Bash(git *)` in the MCP sync flow.** The MCP mode does not interact with git at all -- it fetches content from the registry via MCP tools. Git commands are only needed in fallback mode.

11. **FUTURE: Settings/permissions management in MCP mode.** The legacy sync includes Steps 6.5-6.7 for permissions, settings defaults, and sandbox checks. MCP mode intentionally omits these (skills only, no settings). A future phase should address how permissions travel with skills — flagged during Challenge Round.

---
