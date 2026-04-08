import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

// Load .env from project root so DB_PASSWORD and other secrets are available
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    globals: true,
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      all: true,
      reportOnFailure: true,
      include: ["src/services/**/*.ts", "src/utils/**/*.ts", "src/api/middleware/**/*.ts"],
      exclude: ["src/__tests__/**", "tests/**", "src/db/migrations/**", "src/db/seeds/**", "src/utils/logger.ts", "src/services/auth/**", "src/services/email/**", "src/api/middleware/rate-limit.middleware.ts", "src/jobs/**", "**/*.test.ts"],
      reporter: ["text", "text-summary", "json"],
      reportsDirectory: "./coverage",
    },
  },
  resolve: {
    alias: {
      "@emp-performance/shared": path.resolve(__dirname, "../shared/src"),
    },
  },
});
