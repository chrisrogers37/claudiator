import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createDbClient } from "./lib/db.js";
import { syncSkills } from "./tools/sync.js";
import { checkUpdates } from "./tools/check-updates.js";
import { whoami } from "./tools/whoami.js";

interface ServerConfig {
  user: { id: string; githubUsername: string; role: string };
  databaseUrl: string;
}

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer({
    name: "claudefather",
    version: "1.0.0",
  });

  const db = createDbClient(config.databaseUrl);

  // ─── claudefather_sync ─────────────────────────────────────────────────────
  server.registerTool(
    "claudefather_sync",
    {
      title: "Sync Skills from Registry",
      description:
        "Fetches latest skills from the claudefather registry. Returns skill content " +
        "that Claude Code should write to ~/.claude/skills/. " +
        "Skills are loaded by Claude Code at session start from the local filesystem.",
      inputSchema: z.object({
        dryRun: z
          .boolean()
          .optional()
          .describe(
            "If true, shows what would change without returning file content. Default: false."
          ),
        skills: z
          .array(z.string())
          .optional()
          .describe(
            "Specific skill slugs to sync. If omitted, syncs all skills."
          ),
      }),
    },
    async (args) => syncSkills(db, config.user, args)
  );

  // ─── claudefather_check_updates ────────────────────────────────────────────
  server.registerTool(
    "claudefather_check_updates",
    {
      title: "Check for Skill Updates",
      description:
        "Compares your installed skill versions against the registry. " +
        "Pass your installed skills with their versions to see what's outdated.",
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

  // ─── claudefather_whoami ───────────────────────────────────────────────────
  server.registerTool(
    "claudefather_whoami",
    {
      title: "Current User Info",
      description:
        "Returns the authenticated user's GitHub identity, role, and token status.",
      inputSchema: z.object({}),
    },
    async () => whoami(config.user)
  );

  return server;
}
