FROM node:20-slim AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config and all package.json files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/mcp-server/package.json ./packages/mcp-server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source for db and mcp-server
COPY packages/db/ ./packages/db/
COPY packages/mcp-server/ ./packages/mcp-server/

# Build db first (dependency), then mcp-server
RUN pnpm --filter @claudefather/db run build
RUN pnpm --filter @claudefather/mcp-server run build

FROM node:20-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built artifacts and production deps
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/mcp-server/dist ./packages/mcp-server/dist
COPY --from=builder /app/packages/mcp-server/package.json ./packages/mcp-server/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/db/node_modules ./packages/db/node_modules 2>/dev/null || true
COPY --from=builder /app/packages/mcp-server/node_modules ./packages/mcp-server/node_modules 2>/dev/null || true
COPY pnpm-workspace.yaml package.json ./

EXPOSE 3001
CMD ["node", "packages/mcp-server/dist/index.js"]
