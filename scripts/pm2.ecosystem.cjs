const path = require("node:path");

const releaseDir = path.resolve(process.env.RELEASE_DIR || path.join(__dirname, ".."));
const instances = Number.parseInt(process.env.PM2_INSTANCES || "1", 10);

if (!Number.isInteger(instances) || instances < 1) {
  throw new Error("PM2_INSTANCES must be a positive integer");
}

module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || "emp-performance",
      cwd: path.join(releaseDir, "packages", "server"),
      script: "dist/server/src/index.js",
      interpreter: "node",
      instances,
      exec_mode: instances > 1 ? "cluster" : "fork",
      autorestart: true,
      watch: false,
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 2_000,
      kill_timeout: 35_000,
      listen_timeout: 30_000,
      merge_logs: true,
      env: {
        NODE_ENV: "production",
        ENV_FILE: process.env.ENV_FILE || path.join(releaseDir, ".env"),
        RELEASE_SHA: process.env.RELEASE_SHA || "unknown",
      },
    },
  ],
};
