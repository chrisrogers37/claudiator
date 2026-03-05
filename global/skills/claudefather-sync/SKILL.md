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

Build an installed manifest as an array:
```json
[
  { "slug": "review-pr", "version": "1.2.0" },
  { "slug": "quick-commit", "version": "1.0.3" },
  { "slug": "design-review", "version": "0.0.0" },
  { "slug": "_shared", "version": "1.1.0" }
]
```

### Step 2: Check for Updates

Call the `claudefather_check_updates` MCP tool with `{ "installed": <manifest array> }`.

The tool returns JSON with these categories:
- `updates` — skills with newer versions available (includes `bump_type`, `changelog`)
- `new_skills` — skills in registry but not installed locally
- `removed_skills` — skills installed locally but removed from registry
- `pinned_skills` — skills pinned by the user (skipped during sync)
- `up_to_date` — skills at the latest version

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
    deprecated-skill   v1.0.0  ⚠ no longer in registry

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
1. Show the name
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

Call the `claudefather_sync` MCP tool with the list of approved skills:

```json
{
  "skills": [
    { "slug": "review-pr", "version": "1.3.0", "action": "update" },
    { "slug": "new-skill-name", "version": "1.0.0", "action": "install" },
    { "slug": "deprecated-skill", "version": "1.0.0", "action": "remove" }
  ]
}
```

The tool returns JSON with a `synced` array. For each synced skill:
1. Write `SKILL.md` to `~/.claude/skills/<slug>/SKILL.md` using the Write tool
2. Write each reference file to `~/.claude/skills/<slug>/<path>` using the Write tool
3. Write the version string to `~/.claude/skills/<slug>/.version` using the Write tool
4. If the skill directory has `*.sh` files (hooks), run `chmod +x` on each

For removed skills (if approved):
1. The MCP tool does NOT delete files — remove the directory locally
2. Verify the skill directory exists at `~/.claude/skills/<slug>/`
3. Remove it (the backup from Step 5 preserves it)

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
3. The MCP tool fetches the target version content from the registry
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

---

## Notes

- Never auto-sync without asking. Every file change requires explicit confirmation.
- `settings.json` is always excluded — it is user-managed and never synced or compared.
- `~/.claude/notes/` is never synced — that's user data, not managed config.
- `~/.claude/docs/` is never synced — installed once during setup, not managed afterward.
- If the user passes the argument `status`, only run Steps 1-3 (report, don't sync).
- Use Read/Write tools for file operations, not shell `cp`. Exception: backup copies use shell `cp -r` since they're preservation, not reviewed changes.
- Backups go to `~/.local/share/claudefather/backups/` — outside `~/.claude/` so Claude Code never discovers them.
