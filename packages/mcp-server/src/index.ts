import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import express from "express";
import { createServer } from "./server.js";
import { validateToken } from "@claudefather/db/auth";
import { createDb } from "@claudefather/db/client";
import { users } from "@claudefather/db/schema";
import { eq } from "drizzle-orm";

const PORT = parseInt(process.env.PORT || "3001", 10);
const DATABASE_URL = process.env.DATABASE_URL;

console.log(`Starting claudefather MCP server...`);

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const db = createDb(DATABASE_URL);
const app = express();
app.use(express.json());

// Health check for Railway
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Session storage: maps session IDs to transports
const transports = new Map<string, StreamableHTTPServerTransport>();

// Streamable HTTP endpoint — handles all MCP communication on a single path
app.all("/mcp", async (req, res) => {
  // Extract API key from Authorization header
  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) {
    res.status(401).json({ error: "API key required" });
    return;
  }

  // Validate the API key against the database
  const tokenResult = await validateToken(db, apiKey);
  if (!tokenResult) {
    res.status(401).json({ error: "Invalid or expired API key" });
    return;
  }

  // Look up the user record
  const [user] = await db
    .select({
      id: users.id,
      githubUsername: users.githubUsername,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, tokenResult.userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    // Existing session — route to the stored transport
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, req.body);
  } else if (!sessionId && isInitializeRequest(req.body)) {
    // New session — create transport and MCP server
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, transport);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };

    const mcpServer = createServer({
      user: { id: user.id, githubUsername: user.githubUsername, role: user.role },
      databaseUrl: DATABASE_URL!,
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } else {
    // Invalid request — no session ID and not an initialize request
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: missing session or not an initialize request" },
      id: null,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Claudefather MCP server listening on port ${PORT}`);
});
