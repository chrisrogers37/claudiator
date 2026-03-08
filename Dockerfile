FROM node:20-slim AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace config and all package.json files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc* ./
COPY packages/db/package.json ./packages/db/
COPY packages/mcp-server/package.json ./packages/mcp-server/

# Install dependencies with shamefully-hoist so all deps are in root node_modules
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy source for db and mcp-server
COPY packages/db/ ./packages/db/
COPY packages/mcp-server/ ./packages/mcp-server/

# Build db first (dependency), then mcp-server
RUN pnpm --filter @claudefather/db run build
RUN pnpm --filter @claudefather/mcp-server run build

FROM node:20-slim
WORKDIR /app

# Copy built artifacts and production deps (shamefully-hoisted to root)
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/mcp-server/dist ./packages/mcp-server/dist
COPY --from=builder /app/packages/mcp-server/package.json ./packages/mcp-server/
COPY --from=builder /app/node_modules ./node_modules
COPY pnpm-workspace.yaml package.json ./

EXPOSE 3001
CMD ["node", "packages/mcp-server/dist/index.js"]
