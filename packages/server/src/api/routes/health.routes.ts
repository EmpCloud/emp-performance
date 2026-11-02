import { Router, Request, Response } from "express";
import { config } from "../../config";
import { getReadinessReport } from "../../runtime/health";
import { runtimeState } from "../../runtime/runtime-state";

const router = Router();
const VERSION = "0.1.0";

function livenessPayload() {
  return {
    status: "ok",
    version: VERSION,
    release: config.runtime.releaseSha,
    timestamp: new Date().toISOString(),
  };
}

router.get("/", (_req: Request, res: Response) => {
  // Backwards-compatible liveness endpoint. New orchestrators should use the
  // explicit /live and /ready endpoints below.
  res.json(livenessPayload());
});

router.get("/live", (_req: Request, res: Response) => {
  res.json(livenessPayload());
});

router.get("/ready", async (_req: Request, res: Response) => {
  const report = await getReadinessReport();
  res.status(report.status === "ready" ? 200 : 503).json(report);
});

router.get("/detailed", async (_req: Request, res: Response) => {
  if (config.env === "production" && !config.security.diagnosticsEnabled) {
    return res.sendStatus(404);
  }

  const start = Date.now();
  const readiness = await getReadinessReport();
  const checks: Record<string, unknown> = { ...readiness.checks };

  // Memory
  const mem = process.memoryUsage();
  checks.memory = {
    rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
  };

  // Uptime
  const uptime = process.uptime();
  const d = Math.floor(uptime / 86400);
  const h = Math.floor((uptime % 86400) / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);

  checks.uptime = {
    process: `${Math.round(uptime)}s`,
    formatted: parts.join(" "),
  };

  res.status(readiness.status === "ready" ? 200 : 503).json({
    status: readiness.status === "ready" ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    responseTime: `${Date.now() - start}ms`,
    version: VERSION,
    release: config.runtime.releaseSha,
    environment: config.env,
    runtime: runtimeState.snapshot(),
    checks,
  });
});

export { router as healthRoutes };
