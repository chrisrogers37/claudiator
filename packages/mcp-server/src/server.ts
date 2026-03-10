import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createDbClient } from "./lib/db.js";
import { syncSkills, syncSchema } from "./tools/sync.js";
import { checkUpdates } from "./tools/check-updates.js";
import { whoami } from "./tools/whoami.js";
import { logInvocation, logInvocationSchema } from "./tools/log-invocation.js";
import { sessionFeedback, sessionFeedbackSchema } from "./tools/session-feedback.js";
import { rollback, rollbackSchema } from "./tools/rollback.js";
import { pin, pinSchema } from "./tools/pin.js";
import { unpin, unpinSchema } from "./tools/unpin.js";
import { publish, publishSchema } from "./tools/publish.js";

interface ServerConfig {
  user: { id: string; githubUsername: string; role: string };
  databaseUrl: string;
}

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer({
    name: "claudiator",
    version: "1.0.0",
  });

  const db = createDbClient(config.databaseUrl);

  // ─── claudiator_sync ─────────────────────────────────────────────────────
  server.registerTool(
    "claudiator_sync",
    {
      title: "Sync Skills from Registry",
      description:
        "Fetches specific skill versions from the claudiator registry. " +
        "Returns skill content that Claude Code should write to ~/.claude/skills/. " +
        "Logs the sync event for audit trail.",
      inputSchema: syncSchema,
    },
    async (args) => syncSkills(db, config.user, args)
  );

  // ─── claudiator_check_updates ────────────────────────────────────────────
  server.registerTool(
    "claudiator_check_updates",
    {
      title: "Check for Skill Updates",
      description:
        "Compares installed skill versions against the registry. " +
        "Returns structured JSON with updates, new_skills, removed_skills, pinned_skills, and up_to_date categories.",
      inputSchema: z.object({
        installed: z
          .array(
            z.object({
              slug: z.string().describe("Skill directory name"),
              version: z.string().describe("Currently installed version"),
            })
          )
          .describe("List of installed skills with their current versions"),
      }),
    },
    async (args) => checkUpdates(db, config.user, args)
  );

  // ─── claudiator_whoami ───────────────────────────────────────────────────
  server.registerTool(
    "claudiator_whoami",
    {
      title: "Current User Info",
      description:
        "Returns the authenticated user's GitHub identity, role, and token status.",
      inputSchema: z.object({}),
    },
    async () => whoami(config.user)
  );

  // ─── claudiator_log_invocation ──────────────────────────────────────────
  server.registerTool(
    "claudiator_log_invocation",
    {
      title: "Log Skill Invocation",
      description:
        "Log a skill invocation for usage telemetry. Fire-and-forget — returns immediately.",
      inputSchema: logInvocationSchema,
    },
    async (args) => logInvocation(db, config.user, args)
  );

  // ─── claudiator_session_feedback ──────────────────────────────────────────
  server.registerTool(
    "claudiator_session_feedback",
    {
      title: "Submit Session Feedback",
      description:
        "Submit end-of-session skill ratings and optional comments.",
      inputSchema: sessionFeedbackSchema,
    },
    async (args) => sessionFeedback(db, config.user, args)
  );

  // ─── claudiator_rollback ────────────────────────────────────────────────
  server.registerTool(
    "claudiator_rollback",
    {
      title: "Rollback Skill Version",
      description:
        "Fetch a specific previous version of a skill from the registry. " +
        "Returns the version's content for Claude Code to write to disk.",
      inputSchema: rollbackSchema,
    },
    async (args) => rollback(db, config.user, args)
  );

  // ─── claudiator_pin ────────────────────────────────────────────────────
  server.registerTool(
    "claudiator_pin",
    {
      title: "Pin Skill Version",
      description:
        "Pin a skill to a specific version. Pinned skills are skipped during sync.",
      inputSchema: pinSchema,
    },
    async (args) => pin(db, config.user, args)
  );

  // ─── claudiator_unpin ──────────────────────────────────────────────────
  server.registerTool(
    "claudiator_unpin",
    {
      title: "Unpin Skill Version",
      description:
        "Remove version pin from a skill, resuming tracking of latest.",
      inputSchema: unpinSchema,
    },
    async (args) => unpin(db, config.user, args)
  );

  // ─── claudiator_publish ────────────────────────────────────────────────
  server.registerTool(
    "claudiator_publish",
    {
      title: "Publish Skill Version",
      description:
        "Publish a new version of a skill to the registry. Admin-only — requires admin role.",
      inputSchema: publishSchema,
    },
    async (args) => publish(db, config.user, args)
  );

  return server;
}
