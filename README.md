# the-claudiator

Centralized skills platform for Claude Code. Registry-backed skill distribution with versioning, telemetry, and feedback.

## Architecture

```
packages/
  db/           → PostgreSQL schema (Neon serverless), Drizzle ORM
  mcp-server/   → Railway-hosted MCP server (Streamable HTTP transport)
  web/          → Next.js web app on Vercel (GitHub OAuth, token management)
```

## Skills Platform (Beta)

Claudiator includes a centralized skills registry that replaces git-clone sync with a database-backed distribution system.

### Setup

1. Log in at https://claudiator.vercel.app with your GitHub account
2. Generate an API key on the dashboard
3. Add the MCP server to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "claudiator": {
      "type": "http",
      "url": "https://mcp.the-claudiator.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

4. Restart Claude Code. The `claudiator_sync` tool will be available.

No local installation required — the MCP server is hosted on Railway.

### MCP Tools

| Tool | Description |
|------|-------------|
| `claudiator_sync` | Fetch latest skills from registry and write to `~/.claude/skills/` |
| `claudiator_check_updates` | Check for available skill updates |
| `claudiator_whoami` | Show your identity and token status |

## Development

```bash
pnpm install
pnpm --filter @claudiator/db run build
pnpm --filter @claudiator/mcp-server run build
pnpm --filter @claudiator/web run dev
```

### Environment Variables

**Railway (MCP server):**
- `DATABASE_URL` — Neon PostgreSQL connection string

**Vercel (web app):**
- `DATABASE_URL` — Neon PostgreSQL connection string
- `GITHUB_CLIENT_ID` — GitHub OAuth App client ID
- `GITHUB_CLIENT_SECRET` — GitHub OAuth App client secret
- `NEXTAUTH_URL` — Web app URL
- `NEXTAUTH_SECRET` — Random secret for NextAuth
- `NEXT_PUBLIC_MCP_SERVER_URL` — MCP server URL for config snippet
