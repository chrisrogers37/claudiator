import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/web/vitest.config.ts",
  "packages/mcp-server/vitest.config.ts",
]);
