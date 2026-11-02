import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

/**
 * Deterministic release suite.
 *
 * The excluded folders are historical coverage-push mocks coupled to obsolete
 * service signatures, tests that require an unmanaged developer database, and
 * HTTP suites that default to an external environment. They remain available
 * through `test:all`, but cannot make the release gate flaky or silently hit a
 * remote system. CI compensates with a fresh MySQL migration and a local
 * readiness smoke test after this suite.
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: [
        "src/__tests__/coverage-push/**",
        "src/__tests__/real-db/**",
        "src/__tests__/api.test.ts",
        "src/__tests__/e2e*.test.ts",
      ],
    },
  }),
);
