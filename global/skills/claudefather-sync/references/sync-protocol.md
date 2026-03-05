# Legacy Sync Protocol (Fallback)

Compare managed files between the claudefather repo and `~/.claude/`, then interactively sync differences in either direction.

## Backup Policy

Before any sync that would modify files, back up existing managed files to:

```
~/.local/share/claudefather/backups/<YYYY-MM-DD_HHMMSS>/
```

This location is outside `~/.claude/` so Claude Code will never discover it and confuse itself with duplicate commands.

## Procedure

Follow these steps exactly in order.

### Step 1: Find the Repo

Read `~/.claude/.claudefather-repo` to get the repo path. If the file doesn't exist, tell the user: "Run `/claudefather-setup` from the claudefather repo, or run `./install.sh`" and stop.

Verify the path exists and contains `install.sh`. If not, report the stale breadcrumb and stop.

### Step 2: Build the File Map

These are the managed file pairs (repo path → local path):

| Repo | Local |
|------|-------|
| `global/skills/<name>/**` | `~/.claude/skills/<name>/**` |
| `global/commands/*.md` | `~/.claude/commands/*.md` |
| `global/agents/*.md` | `~/.claude/agents/*.md` |
| `global/hooks/*.sh` | `~/.claude/hooks/*.sh` |

Note: `_shared/` directories under `skills/` contain shared reference files used by orchestration skills. They have no `SKILL.md` but are synced like any other skill directory.

**Excluded from sync** (never touched, never compared):
- `~/.claude/settings.json` — user-managed, NEVER synced
- `~/.claude/notes/` — personal notes, lessons, decisions
- `~/.claude/docs/` — installed copies of documentation

For each category, list all files on both sides. Match files by filename.

### Step 3: Diff Every Pair

For each matched file pair, run `diff` to check for differences. Categorize each file:

| Status | Meaning |
|--------|---------|
| **In sync** | Identical content |
| **Modified** | File exists in both but content differs |
| **Repo only** | File exists in repo but not locally |
| **Local only** | File exists locally but not in repo |

Note: Since we can't know which side is "newer" from content alone, report diverged files as **Modified** and show the diff when walking through them.

### Step 4: Report Status Table

Print a summary table like:

```
Claudefather Sync Status
═══════════════════════════════════════════
  commands/techdebt.md           ✓ in sync
  commands/lessons.md            ✓ in sync
  commands/claudefather-sync.md  ⚡ modified
  hooks/auto-format.sh           ✓ in sync
  commands/my-custom.md          📁 local only
═══════════════════════════════════════════
  8 in sync · 1 modified · 1 local only
```

If everything is in sync, say so and stop.

If the user passed the argument `status`, stop here (report only, no sync).

### Step 5: Backup Before Sync

**Before making any changes**, create a timestamped backup:

```bash
BACKUP_DIR=~/.local/share/claudefather/backups/$(date +%Y-%m-%d_%H%M%S)
mkdir -p "$BACKUP_DIR"
cp -r ~/.claude/commands "$BACKUP_DIR"/commands 2>/dev/null || true
cp -r ~/.claude/skills "$BACKUP_DIR"/skills 2>/dev/null || true
cp -r ~/.claude/agents "$BACKUP_DIR"/agents 2>/dev/null || true
cp -r ~/.claude/hooks "$BACKUP_DIR"/hooks 2>/dev/null || true
```

Print: `Backed up current files to $BACKUP_DIR`

### Step 6: Walk Through Differences

For each file that is NOT in sync, in order:

1. Show the filename and status
2. Show the diff (use `diff -u` between the two files, or note which side is missing)
3. Ask the user what to do:
   - **Modified** files: **Pull to repo** / **Push to local** / **Skip**
   - **Repo only** files: **Push to local** / **Skip**
   - **Local only** files: **Pull to repo** / **Delete local** / **Skip**
4. Execute the chosen action immediately using Read/Write tools (not `cp`)

### Step 6.5: Permissions Check

After syncing files, check `~/.claude/settings.json` against the repo's `global/recommended-permissions.json` and offer to add any missing recommended permissions.

Follow the same two-sub-step procedure as Step 4.5 in `/claudefather-setup`:

**Sub-step A: Deprecated Syntax Migration**
1. Scan `permissions.allow` for `Bash(<cmd>:<args>)` patterns
2. Skip non-Bash entries
3. Handle `Bash(npx:neonctl*)` correctly — replace first colon with space
4. Present count, example, and migration prompt
5. If accepted: rewrite entries (replace first colon with space), preserve all other fields
6. If declined: proceed normally

**Sub-step B: Missing Permissions Check**
1. Compare permissions against recommended baseline — exact match
2. Label colon-syntax matches as "present (deprecated syntax)", not "missing"
3. Present a report of missing permissions by category
4. Let user choose: All recommended / By category / Skip
5. Merge selected (additive only, never remove, never touch non-permissions fields)

This ensures every sync run surfaces deprecated syntax until migrated, and newly added recommended permissions from updated repos are detected.

### Step 6.6: Settings Defaults Check

After permissions, check if `statusLine` and `hooks` configs are present in `~/.claude/settings.json`. These activate the hook scripts synced in Step 6.

Follow the same procedure as Step 4.6 in `/claudefather-setup`:
1. Read `global/settings.json` from the repo for recommended values
2. Check if `statusLine` and `hooks` keys exist in user's settings
3. Offer to add any that are missing (never overwrite existing values)
4. **PreToolUse check:** If `hooks` is present but `hooks.PreToolUse` is missing, offer to add the PreToolUse block. This auto-approves compound commands where every sub-command matches an allow pattern.

This ensures newly added settings defaults from updated repos are surfaced on sync.

### Step 6.7: Sandbox Configuration Check

After settings defaults, check if sandbox configuration is present in `~/.claude/settings.json`.

Follow the same procedure as Step 4.7 in `/claudefather-setup`:
1. Read `global/settings.json` from the repo for the recommended `sandbox` value
2. Check if the `sandbox` key exists in user's settings (any value → skip)
3. If missing, present the sandbox recommendation with tradeoffs
4. Ask: **"Enable sandbox? [Y/n]"**
5. If accepted: merge the `sandbox` object from repo's `global/settings.json` into user's settings
6. If sandbox was accepted, optionally offer `sandbox-extensions` permissions from `recommended-permissions.json` (default: no)

This ensures newly added sandbox recommendations from updated repos are surfaced on sync.

### Step 7: Summary

After walking through all differences:

1. List all actions taken
2. Show the backup restore note:

```
Backup
═══════════════════════════════════════════
Your previous files were backed up to:
  ~/.local/share/claudefather/backups/<timestamp>/

To restore any file, copy it back:
  cp ~/.local/share/claudefather/backups/<timestamp>/commands/my-file.md ~/.claude/commands/
═══════════════════════════════════════════
```

3. If any files were pulled to repo, remind the user: "Don't forget to commit the changes pulled into the repo."
4. If any files were pushed to local, note they're active immediately

## Notes

- Never auto-sync without asking. Every file change requires explicit confirmation.
- `settings.json` is always excluded — it is user-managed and never synced or compared.
- `~/.claude/notes/` is never synced — that's user data, not managed config.
- `~/.claude/docs/` is never synced — installed once during setup, not managed afterward.
- If the user passes the argument `status`, only run Steps 1–4 (report, don't sync).
- Use Read/Write tools for file operations, not shell `cp`. Exception: backup copies use shell `cp -r` since they're preservation, not reviewed changes.
- Backups go to `~/.local/share/claudefather/backups/` — outside `~/.claude/` so Claude Code never discovers them.
