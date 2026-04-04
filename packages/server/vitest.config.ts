import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    globals: true,
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      "@emp-performance/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
