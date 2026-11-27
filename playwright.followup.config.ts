import { defineConfig } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "./tests/followup",
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5188",
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5188 --strictPort",
    cwd: path.resolve(__dirname, "packages/client"),
    url: "http://127.0.0.1:5188",
    env: { VITE_API_URL: "/api/v1" },
    reuseExistingServer: false,
  },
});
