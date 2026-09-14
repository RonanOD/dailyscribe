import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors tsconfig.json's "@/*" -> "./*" path alias, and the plain node
// environment (no jsdom — these are server-only PDF/render/DB modules).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  // Next keeps tsconfig's jsx as "preserve" (Next's own compiler handles
  // JSX); outside Next, esbuild needs to be told to use the automatic
  // runtime itself — same reason scripts/tsconfig.json exists for tsx.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
  },
});
