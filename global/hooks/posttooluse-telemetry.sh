#!/usr/bin/env bash
# PostToolUse telemetry hook for Claude Code
#
# Detects skill invocations and logs them to a session-local JSONL file.
# The /session-handoff skill reads this file and submits telemetry
# via the claudiator_log_invocation MCP tool.
#
# This hook ONLY logs Skill tool invocations. All other tools are ignored.
# No prompt content, code, or file paths are captured.

set -eo pipefail

command -v jq &>/dev/null || exit 0

INPUT=$(cat)

# Extract fields -- single jq call
RESULT=$(printf '%s' "$INPUT" | jq -r '
  if .tool_name != "Skill" then "skip"
  else
    (.tool_input.skill // .tool_input.name // "unknown") + "\t" +
    (.session_id // "unknown") + "\t" +
    (if .tool_response.success == true then "true"
     elif .tool_response.success == false then "false"
     else "null" end)
  end
' 2>/dev/null) || exit 0

[ "$RESULT" = "skip" ] && exit 0

IFS=$'\t' read -r SKILL_SLUG SESSION_ID SUCCESS <<< "$RESULT"

# Append to session telemetry file (JSONL format)
TELEMETRY_FILE="/tmp/claudiator-telemetry-${SESSION_ID}.jsonl"

printf '{"skill_slug":"%s","session_id":"%s","success":%s,"invoked_at":"%s"}\n' \
  "$SKILL_SLUG" "$SESSION_ID" "$SUCCESS" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  >> "$TELEMETRY_FILE" 2>/dev/null

exit 0
