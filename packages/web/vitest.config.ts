import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    name: "web-unit",
    include: ["src/**/__tests__/unit/**/*.test.ts"],
    environment: "node",
  },
});
