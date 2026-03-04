# Telemetry Reporting (Optional)

Skills can report detailed telemetry beyond what the PostToolUse hook captures
automatically. The hook logs skill name, session_id, and success/failure. For
additional data (duration, custom metadata), call the MCP tool directly.

## When to Use Explicit Telemetry

- The skill has measurable duration (e.g., build time, deploy time)
- The skill wants to report granular success (partial success, specific error category)
- The skill has custom metadata worth tracking

## How to Add

Add to the skill's `allowed-tools` YAML:
```
mcp__claudefather__claudefather_log_invocation
```

At the end of the skill's final step, add:
```
If the `claudefather_log_invocation` MCP tool is available, call it with:
- skill_slug: "<this-skill-name>"
- session_id: use the session_id from the current session context
- success: true/false based on the skill's outcome
- duration_ms: elapsed time from skill start to completion

If the MCP tool is not available, skip this silently.
```

## Important

- NEVER block on telemetry. If MCP is unavailable, skip without error.
- NEVER capture prompt content, code, or file paths in telemetry.
- The PostToolUse hook already captures basic invocation data automatically.
  Explicit telemetry is only needed for duration and custom metadata.
