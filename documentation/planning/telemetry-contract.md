# Telemetry Ingestion Contract: Claudlobby → Claudosseum

> Spec for issue #44. Defines how opt-in fleet telemetry reaches Claudosseum and feeds into arena scoring.

## Overview

Claudlobby fleets generate structured JSONL event streams (tool calls, session lifecycle, skill invocations). A subset of these events — skill usage signals — are valuable for Claudosseum's ranking system. This contract defines:

1. Which events Claudosseum ingests
2. How they're transported
3. What gets stripped before leaving the fleet
4. How the signal blends into rankings

## Design Principles

- **Opt-in and scrubbed.** No skill content, no prompts, no outputs cross the boundary.
- **Graceful degradation.** Claudlobby never blocks on Claudosseum availability.
- **Schema-enforced privacy.** The contract defines an allowlist of fields — anything not listed is never transmitted.
- **Additive signal.** Fleet telemetry supplements arena ELO; it never overrides it.

---

## 1. Events Claudosseum Cares About

From Claudlobby's event stream (`{ts, bot, type, source, data}`), Claudosseum ingests three event types:

### `skill_invocation`

Emitted when a bot invokes a skill (slash command) and it completes.

```json
{
  "ts": "2026-05-16T14:22:01-04:00",
  "bot": "astrid",
  "type": "skill_invocation",
  "source": "vitals",
  "data": {
    "skill_slug": "quick-commit",
    "session_id": "sess_abc123",
    "success": true,
    "duration_ms": 4200
  }
}
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `skill_slug` | string | yes | Skill directory name (e.g., `quick-commit`, `review-pr`) |
| `session_id` | string | yes | Claude Code session identifier |
| `success` | boolean | no | Whether the skill completed without error |
| `duration_ms` | integer | no | Wall-clock execution time |

### `skill_feedback`

Emitted when a user provides a rating for a skill used in a session.

```json
{
  "ts": "2026-05-16T14:25:00-04:00",
  "bot": "astrid",
  "type": "skill_feedback",
  "source": "vitals",
  "data": {
    "skill_slug": "quick-commit",
    "session_id": "sess_abc123",
    "rating": 4
  }
}
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `skill_slug` | string | yes | Skill directory name |
| `session_id` | string | yes | Session that triggered the feedback |
| `rating` | integer (1-5) | yes | User satisfaction rating |

> **Phase 1: rating-only.** Comment transmission deferred to follow-up issue pending scoping decision (privacy implications of free-text across fleet boundary).

### `skill_error`

Emitted when a skill invocation fails with a classifiable error.

```json
{
  "ts": "2026-05-16T14:23:00-04:00",
  "bot": "astrid",
  "type": "skill_error",
  "source": "vitals",
  "data": {
    "skill_slug": "railway-deploy",
    "session_id": "sess_abc123",
    "error_class": "auth_failure"
  }
}
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `skill_slug` | string | yes | Skill directory name |
| `session_id` | string | yes | Session where error occurred |
| `error_class` | enum | yes | One of: `auth_failure`, `timeout`, `invalid_input`, `dependency_error`, `unknown` |

---

## 2. Transport

### Mechanism: Batch HTTP Push

Claudlobby pushes batched events to a Claudosseum REST endpoint on a periodic schedule.

```
POST /api/telemetry/ingest
Content-Type: application/json
Authorization: Bearer <fleet_telemetry_token>
X-Fleet-ID: <fleet_id>

{
  "schema_version": "1",
  "fleet_id": "crog-eng-team",
  "batch": [
    { "ts": "...", "type": "skill_invocation", "data": { ... } },
    { "ts": "...", "type": "skill_feedback", "data": { ... } }
  ]
}
```

### Why batch HTTP push (not MCP, not pull)

| Option | Verdict | Reason |
|--------|---------|--------|
| MCP tool (existing path) | Rejected | MCP tools fire per-invocation, inside a Claude session. Fleet telemetry is a background process — no Claude session available. |
| Webhook (Claudosseum → Claudlobby) | Rejected | Requires Claudlobby to expose an endpoint. Fleets run on home hardware behind NAT. |
| Pull (Claudosseum fetches from fleets) | Rejected | Same NAT problem. Fleets aren't addressable. |
| **Batch HTTP push** | **Chosen** | Fleet-side cron job reads local JSONL, filters telemetry events, pushes to Claudosseum. Degrades gracefully (retries next cycle if Claudosseum is down). |

### Push schedule

- **Default interval:** Every 15 minutes (configurable in `fleet.yaml`)
- **Retry on failure:** Exponential backoff, max 3 retries per batch. Failed batches are retained locally and retried next cycle.
- **Deduplication:** Each event gets a deterministic ID (`sha256(fleet_id + bot + ts + type + skill_slug)`). Claudosseum deduplicates on ingest.

### Graceful degradation

If Claudosseum is unreachable:
1. Events accumulate in the local JSONL files (existing 7-day retention applies).
2. Push job logs the failure and retries next cycle.
3. No data loss within the 7-day window. Events older than 7 days are accepted as lost.
4. Claudlobby never blocks bot operations on telemetry push success.

---

## 3. Auth Model

### Fleet registration (one-time)

1. Fleet operator opts in via `fleet.yaml`:
   ```yaml
   telemetry:
     claudosseum:
       enabled: true
       endpoint: https://claudosseum.example.com/api/telemetry/ingest
       fleet_id: crog-eng-team
   ```
2. Fleet operator generates a telemetry token via Claudosseum UI or CLI (`claudosseum register-fleet`).
3. Token is stored in fleet's `.env` as `CLAUDOSSEUM_TELEMETRY_TOKEN`.

### Token scope

The telemetry token authorizes **only**:
- `POST /api/telemetry/ingest` — write telemetry events
- Scoped to the registered `fleet_id` — cannot write events attributed to other fleets

It does **not** authorize:
- Reading telemetry data
- Accessing arena endpoints
- Modifying skills or rankings
- Any admin operations

### Token rotation

Tokens expire after 90 days. Claudosseum returns `401` with `X-Token-Expires-In: <seconds>` header. The push job warns the fleet operator 7 days before expiry via a `telemetry_auth_warning` event in the local event stream.

---

## 4. Schema: Extending Existing Tables

### Approach: Add `source` discriminator to existing tables

Rather than creating a separate `telemetry_events` table, extend `skillInvocations` and `skillFeedback` with a `source` column:

```sql
-- Migration: add source discriminator
ALTER TABLE "skillInvocations"
  ADD COLUMN "source" text NOT NULL DEFAULT 'mcp';

ALTER TABLE "skillFeedback"
  ADD COLUMN "source" text NOT NULL DEFAULT 'mcp';

-- New: fleet attribution
ALTER TABLE "skillInvocations"
  ADD COLUMN "fleetId" text;

ALTER TABLE "skillFeedback"
  ADD COLUMN "fleetId" text;
```

**Source values:**
| Value | Meaning |
|-------|---------|
| `mcp` | Existing path — logged via MCP tool during Claude session |
| `fleet` | Pushed from a Claudlobby fleet via telemetry endpoint |

### Why not a separate table

- `skillInvocations` already has exactly the right shape (skill_slug, session_id, success, duration_ms).
- A `source` discriminator lets existing queries work unchanged (they implicitly include all sources).
- Arena scoring queries can weight by source if needed (see section 5).
- One table = one index = simpler operational model.

### Ingest mapping

| Fleet event field | → Claudosseum column |
|-------------------|---------------------|
| `data.skill_slug` | `skillInvocations.skillSlug` → resolved to `skillId` |
| `data.session_id` | `skillInvocations.sessionId` |
| `data.success` | `skillInvocations.success` |
| `data.duration_ms` | `skillInvocations.durationMs` |
| `ts` | `skillInvocations.invokedAt` |
| `fleet_id` (envelope) | `skillInvocations.fleetId` |
| (hardcoded) | `skillInvocations.source = 'fleet'` |
| (no user) | `skillInvocations.userId = NULL` |

> **Note:** The fleet event's top-level `source` field (`"vitals"` / `"pulse"`) is NOT transmitted to the DB. The DB `source` column is hardcoded to `"fleet"` by the push job — it distinguishes MCP-originated vs fleet-originated records, not the internal fleet subsystem that emitted the event.

For `skill_feedback`:

| Fleet event field | → Claudosseum column |
|-------------------|---------------------|
| `data.skill_slug` | `skillFeedback.skillSlug` → resolved to `skillId` |
| `data.session_id` | `skillFeedback.sessionId` |
| `data.rating` | `skillFeedback.rating` |
| `fleet_id` (envelope) | `skillFeedback.fleetId` |
| (hardcoded) | `skillFeedback.source = 'fleet'` |
| (no user) | `skillFeedback.userId = NULL` |

### `skill_error` events

These do **not** map to existing tables. They are stored in a new lightweight table:

```sql
CREATE TABLE "skillErrors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "skillId" uuid REFERENCES "skills"("id"),
  "skillSlug" text NOT NULL,
  "fleetId" text,
  "sessionId" text,
  "errorClass" text NOT NULL,
  "source" text NOT NULL DEFAULT 'fleet',
  "occurredAt" timestamp with time zone NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_skill_errors_skill_id ON "skillErrors"("skillId");
CREATE INDEX idx_skill_errors_occurred_at ON "skillErrors"("occurredAt");
```

---

## 5. Ranking Blend: How Fleet Signal Feeds ELO

### Current state

Arena rankings are purely battle-driven: ELO changes when skills compete head-to-head in judged battles.

### Fleet signal as secondary weight

Fleet telemetry provides a **usage confidence signal** — skills used heavily in production with high success rates deserve more confidence in their ELO. This is not a replacement for battles; it's a stabilizer.

### Blend method: K-factor modulation

The ELO system uses a K-factor to control rating volatility (how much a single battle changes the rating). Fleet telemetry modulates K:

```
K_effective = K_base * confidence_multiplier(skill)

confidence_multiplier(skill) = clamp(
  1.0 - (fleet_signal_strength(skill) * 0.3),
  min = 0.5,
  max = 1.0
)

fleet_signal_strength(skill) = min(
  (invocations_30d / 100) * success_rate_30d,
  1.0
)
```

**Effect:**
- A skill with 0 fleet usage: `confidence_multiplier = 1.0` (full K, rating is volatile — needs more battles to stabilize)
- A skill with 100+ invocations and 95% success rate: `confidence_multiplier = 0.7` (lower K, rating is more stable — fleet usage confirms its quality)
- Floor of 0.5 ensures battles always matter — fleet signal can dampen volatility but never freeze ratings

### Secondary leaderboard: "Field-Tested"

In addition to K-factor modulation, expose a secondary view:

```
Field-Tested Score = (0.7 * normalized_elo) + (0.3 * fleet_composite)

fleet_composite = (
  0.5 * success_rate_30d +
  0.3 * normalized_usage_volume +
  0.2 * avg_rating_if_available
)
```

This gives operators a "battle-proven in production" ranking alongside the pure-arena ranking. Both are visible in the UI; the pure ELO remains the primary.

---

## 6. Privacy: What Gets Stripped

### Allowlist (transmitted)

Only these fields cross the fleet boundary:

| Field | Example | Why allowed |
|-------|---------|-------------|
| `skill_slug` | `"quick-commit"` | Public skill identifier, no PII |
| `session_id` | `"sess_abc123"` | Opaque identifier, no content |
| `success` | `true` | Boolean outcome, no detail |
| `duration_ms` | `4200` | Numeric, no content |
| `rating` | `4` | Numeric, no content |
| `error_class` | `"timeout"` | Enum, no detail |
| `bot` | `"astrid"` | Bot name (not a person) |
| `fleet_id` | `"crog-eng-team"` | Fleet identifier |
| `ts` | ISO timestamp | When, not what |

### Blocklist (never transmitted)

The push job **actively strips** these before sending:

| Stripped | Why |
|----------|-----|
| Prompt content | Privacy: user instructions are private |
| Skill output / responses | Privacy: generated content is private |
| Tool call arguments | May contain file paths, code, credentials |
| File paths | Leak directory structure, project names |
| Environment variables | May contain secrets |
| Error messages (full text) | May contain paths, tokens, PII |
| User identity | Fleet users are not Claudosseum users |
| IP addresses | Infrastructure detail |

### Enforcement

Privacy is enforced at the **push boundary**, not at the event-emission boundary:

1. `bot-vitals.sh` emits rich events locally (including tool args, for fleet debugging).
2. The telemetry push job reads local JSONL and extracts **only** the allowlisted fields into the push payload.
3. The push job runs a validation pass: if any field value matches patterns for tokens (`ghp_`, `sk-`, `xoxb-`), paths (`/home/`, `/Users/`), or emails (`*@*.*`), the event is dropped and a local warning is logged.

This two-layer design means local observability stays rich while the external contract stays minimal.

---

## 7. Claudlobby Implementation Surface

### New event emission (in `bot-vitals.sh`)

The existing `tool_call` event type already fires on every tool use. Skill invocations are a subset: when the tool is `Skill` (the Claude Code skill tool), emit an additional `skill_invocation` event:

```bash
# In bot-vitals.sh, after classifying event type:
if [ "$tool_name" = "Skill" ] && [ "$hook_event" = "PostToolUse" ]; then
  # Extract skill_slug from tool input, emit skill_invocation event
fi
```

### New push script: `lib/telemetry-push.sh`

```bash
#!/usr/bin/env bash
# Reads today's + yesterday's JSONL for all bots,
# filters to skill_invocation|skill_feedback|skill_error,
# extracts allowlisted fields,
# POSTs batch to configured endpoint.
# Cron: */15 * * * *
```

### `fleet.yaml` configuration

```yaml
telemetry:
  claudosseum:
    enabled: false  # opt-in
    endpoint: ""    # e.g., https://claudosseum.example.com/api/telemetry/ingest
    fleet_id: ""    # registered fleet identifier
    push_interval_minutes: 15
    events:
      - skill_invocation
      - skill_feedback
      - skill_error
```

---

## 8. Claudosseum Implementation Surface

### New endpoint

```
POST /api/telemetry/ingest
```

- Auth: Bearer token (fleet telemetry token)
- Rate limit: 100 requests/hour per fleet
- Max batch size: 1000 events
- Response: `202 Accepted` with `{ "ingested": N, "dropped": M, "errors": [...] }`

### Ingest pipeline

1. Validate token → resolve fleet_id
2. Validate schema_version (reject unknown versions with 400)
3. For each event in batch:
   a. Validate against event type schema (unknown types → drop + count)
   b. Resolve `skill_slug` → `skillId` (unknown slugs → drop + count, don't create skills)
   c. Deduplicate by event ID
   d. Insert into appropriate table
4. Return counts

### Schema migration

Single migration adding:
- `source` column to `skillInvocations` (default: `'mcp'`)
- `source` column to `skillFeedback` (default: `'mcp'`)
- `fleetId` column to both tables (nullable)
- New `skillErrors` table
- Indexes on `source` and `fleetId`

---

## 9. Rollout Plan

| Phase | What | Gate |
|-------|------|------|
| 1. Contract lock | This spec reviewed + approved | Maintainer sign-off |
| 2. Claudosseum endpoint | Implement `/api/telemetry/ingest` + migration | Tests pass, staging deploy |
| 3. Claudlobby emitter | Extend `bot-vitals.sh` for skill events | Local JSONL verified |
| 4. Claudlobby push job | `lib/telemetry-push.sh` + fleet.yaml config | Push to staging Claudosseum |
| 5. Production opt-in | Enable on one fleet, monitor for 7 days | No PII leaks, rankings stable |
| 6. K-factor blend | Implement confidence multiplier | A/B against pure-ELO |
| 7. Field-Tested view | Secondary leaderboard in UI | User feedback positive |

---

## Open Questions

### Resolved

1. **Comment privacy:** Rating-only for Phase 1. Comment transmission deferred to a follow-up issue pending scoping decision on free-text privacy across the fleet boundary.
2. **Skill slug resolution:** Drop events with unknown slugs. The push job logs a local warning; Claudosseum returns the count in its `"dropped"` response field. No auto-registration — skills must exist in the registry before fleet signal can attach to them.
3. **Historical backfill:** No. Forward-looking only. On first enable the push job begins from the current cycle — it does not replay the 7-day local window. This avoids a burst of stale data skewing recent rankings.

### Unresolved (for maintainer review)

1. **Fleet identity in UI:** Should Claudosseum surface which fleets contributed signal to a skill's ranking? Or keep fleet identity internal-only for debugging?
