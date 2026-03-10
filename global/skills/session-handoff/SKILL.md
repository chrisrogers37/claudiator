---
name: session-handoff
description: "End-of-session capture. Scans git/PR/plan activity, captures learnings to MEMORY.md or global notes, catches up changelog, and writes a context-resume file for the next session. Counterpart to /context-resume."
allowed-tools: Bash(git *), Bash(gh *), Bash(ls *), Bash(wc *), Bash(date *), Bash(cat *), Read, Write, Edit, Glob, Grep, mcp__claudiator__claudiator_log_invocation, mcp__claudiator__claudiator_session_feedback
---

# Session Handoff

Capture session state so the next session can resume seamlessly. Counterpart to `/context-resume`.

Target: 2-3 minutes. The handoff file is the essential deliverable — everything else is optional.

## Step 1: Scan Session

Gather everything automatically — no user interaction needed.

**Run in parallel:**
- `git log --oneline --since="8 hours ago"` (adjust if user specifies a timeframe)
- `git diff --stat` + `git stash list`
- `gh pr list --author @me --json number,title,state,updatedAt`
- Search `documentation/planning/` for status markers (IN PROGRESS, PENDING, COMPLETE)

Present a brief summary of findings. If the working tree is dirty, ask once: "Uncommitted changes — commit first or leave them?"

## Step 2: Capture Learnings

Review the session for knowledge worth persisting. Look for:
- Patterns, gotchas, debugging insights discovered
- Times the user corrected your approach
- Commands or workflows that worked well

**Scope each item:**
- **Project-scoped** → write to auto-memory at `~/.claude/projects/<project-path>/memory/MEMORY.md`
- **Cross-project** → write to `~/.claude/notes/` (use `/notes` or `/lessons` conventions)

Present all candidates in a numbered list grouped by destination. Ask once: "Add any? Pick numbers, edit, or skip." Do not ask separate rounds for notes vs lessons — combine them.

**Size checks (mention only if exceeded):**
- MEMORY.md > 150 lines → nudge to prune
- Global notes > 100 lines → nudge to prune

## Step 3: Changelog + Stale Plans (Optional)

**Changelog:** If `CHANGELOG.md` exists, compare session commits against `[Unreleased]`. Flag missing entries, offer to add them. If no changelog, skip silently.

**Stale plans:** If `documentation/planning/` exists, check for two issues:
1. **Completed but unarchived** — sessions where all phases are marked `✅ COMPLETE` but still in `documentation/planning/`. Offer to move to `documentation/archive/` via `git mv`.
2. **Stale and abandoned** — sessions idle 14+ days with incomplete phases. Offer archive/delete/skip.
If none found, skip silently.

## Step 3.5: Submit Telemetry

Check if the claudiator MCP server is available by checking if the
`claudiator_log_invocation` tool exists. If it does not, skip this step silently.

Read the session telemetry file:
- Determine session_id from the current session context
- Read `/tmp/claudiator-telemetry-<session_id>.jsonl` if it exists
- Parse each line as a JSON object

For each invocation record, call `claudiator_log_invocation` with:
- `skill_slug`: from the record
- `session_id`: from the record
- `success`: from the record (may be null)

Make all calls in parallel (fire-and-forget). Do not wait for responses.
Do not report telemetry results to the user — this is silent background work.

If the file does not exist or is empty, skip silently.

## Step 3.6: Collect Feedback (Optional)

If the telemetry file from Step 3.5 contained skill invocations, present the
skills used in this session and ask for quick feedback:

```
Skills used this session:
  1. product-enhance
  2. review-pr
  3. session-handoff

Rate any skills? (1-5, or skip)
Format: <number> <rating> [comment]
Example: 1 4 "worked great but slow"
Or just: skip
```

Parse the user's response. If they provide ratings:
- Call `claudiator_session_feedback` with the session_id and ratings array
- Confirm: "Feedback submitted. Thanks!"

If the user says "skip" or provides no input within one prompt, move on immediately.
This step gets ONE prompt — never ask follow-up questions about feedback.

If the claudiator MCP server is not available, skip this step silently.

## Step 4: Write Handoff File

**Location:** `~/.claude/notes/projects/<project-slug>/context-resume.md`

**Slug derivation:** Git remote `org/repo` with `/` replaced by `--`. Fallback: directory name. Must match what `/context-resume` uses.

Write tool creates parent directories automatically. See [templates.md](references/templates.md) for the output format.

The handoff file is agent-optimized — structured for machine parsing, not human reading. It is ephemeral and overwritten each session.

After writing: "Handoff written to `~/.claude/notes/projects/<slug>/context-resume.md`. Use `/context-resume` next session."

## Rules

- **Speed over thoroughness.** Scan, summarize, write. Do not turn this into a documentation exercise.
- **One approval round per step.** Do not ask multiple rounds of questions within a step.
- **No compound commands.** Never chain commands with `&&`, `||`, or `;`. Make separate parallel tool calls instead — `allowed-tools` patterns only match simple commands, not compound ones.
- **User says skip, you skip.** The handoff file is the only non-optional output.
- **Never auto-commit knowledge.** Notes, lessons, and changelog entries all require user approval.
- **Handoff file is ephemeral.** Not a log. Overwritten each session.
- **Telemetry is silent.** Never show telemetry submission details to the user. If MCP is unavailable, skip without comment.
- **Feedback gets one prompt.** Ask once, accept the answer, move on.
