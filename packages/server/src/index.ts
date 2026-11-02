// ============================================================================
// EMP-PERFORMANCE SERVER ENTRY POINT
// ============================================================================

import express from "express";
import type { Server } from "node:http";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { config } from "./config";
import { initDB, closeDB } from "./db/adapters";
import { initEmpCloudDB, migrateEmpCloudDB, closeEmpCloudDB } from "./db/empcloud";
import { logger } from "./utils/logger";

// Route imports
import { healthRoutes } from "./api/routes/health.routes";
import { goalRoutes } from "./api/routes/goal.routes";
import { pipRoutes } from "./api/routes/pip.routes";
import { competencyRoutes } from "./api/routes/competency.routes";
import { reviewCycleRoutes } from "./api/routes/review-cycle.routes";
import { reviewRoutes } from "./api/routes/review.routes";
import { reviewOutcomeRoutes } from "./api/routes/review-outcome.routes";
import { integrationOutboxRoutes } from "./api/routes/integration-outbox.routes";
import { authRoutes } from "./api/routes/auth.routes";
import { careerPathRoutes } from "./api/routes/career-path.routes";
import { oneOnOneRoutes } from "./api/routes/one-on-one.routes";
import { feedbackRoutes } from "./api/routes/feedback.routes";
import { analyticsRoutes, skillsGapHandler } from "./api/routes/analytics.routes";
import { peerReviewRoutes } from "./api/routes/peer-review.routes";
import { successionRoutes } from "./api/routes/succession.routes";
import { notificationRoutes } from "./api/routes/notification.routes";
import { letterRoutes } from "./api/routes/letter.routes";
import { aiSummaryRoutes } from "./api/routes/ai-summary.routes";
import { managerEffectivenessRoutes } from "./api/routes/manager-effectiveness.routes";
import { usersRoutes } from "./api/routes/users.routes";
import { authenticate, authorize } from "./api/middleware/auth.middleware";
import { errorHandler } from "./api/middleware/error.middleware";
import { requestContext } from "./api/middleware/request-context.middleware";
import { apiLimiter, authLimiter } from "./api/middleware/rate-limit.middleware";
import { swaggerUIHandler, openapiHandler } from "./api/docs";
import * as analyticsService from "./services/analytics/analytics.service";
import * as letterService from "./services/letter/performance-letter.service";
import { sendSuccess } from "./utils/response";
import { ValidationError } from "./utils/errors";
import { recordMounts } from "./api/route-recorder";
import { runGracefulShutdown } from "./runtime/graceful-shutdown";
import { runtimeState } from "./runtime/runtime-state";

const app = express();
const SHUTDOWN_TIMEOUT_MS = (
  Number.isFinite(config.runtime.shutdownTimeoutMs) && config.runtime.shutdownTimeoutMs >= 1_000
    ? config.runtime.shutdownTimeoutMs
    : 30_000
);

let httpServer: Server | null = null;
let shutdownPromise: Promise<void> | null = null;
let requestedExitCode = 0;

app.set("trust proxy", config.runtime.trustProxy);

// Record route mounts for OpenAPI auto-discovery (before any .use mounts).
recordMounts(app);

// Self-hosted Swagger UI assets — served same-origin from /api/docs/ui so the
// proxy/helmet CSP ('self') allows them (the old unpkg CDN is blocked).
const swaggerUiAssetPath = (
  require("swagger-ui-dist") as { getAbsoluteFSPath(): string }
).getAbsoluteFSPath();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
// Strict helmet everywhere except the Swagger UI page, which needs a relaxed
// CSP (inline initializer + Swagger's inline styles / eval). swaggerUIHandler
// sets its own permissive CSP for that route.
const helmetStrict = helmet();
const helmetNoCsp = helmet({ contentSecurityPolicy: false });
app.use(requestContext);
app.use((req, res, next) =>
  config.security.docsEnabled && req.path.startsWith("/api/docs")
    ? helmetNoCsp(req, res, next)
    : helmetStrict(req, res, next),
);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.cors.origin === "*") return callback(null, true);
      const allowed = config.cors.origin.split(",").map((s) => s.trim());
      if (allowed.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.use("/health", healthRoutes);

// ---------------------------------------------------------------------------
// API Routes (v1)
// ---------------------------------------------------------------------------
const v1 = express.Router();
// Record v1's sub-mounts (v1.use('/x', routes)) for OpenAPI auto-discovery,
// prefixed with /api/v1 — must run before the v1.use(...) calls below.
recordMounts(v1, "/api/v1");
v1.use(apiLimiter);

// Feature routes
v1.use("/goals", goalRoutes);
v1.use("/goal-alignment", goalRoutes); // alias — /goal-alignment/tree -> /goals/tree (#870)
v1.use("/pips", pipRoutes);

// Feature routes
v1.use("/review-cycles", reviewCycleRoutes);
v1.use("/reviews", reviewRoutes);
v1.use("/review-outcomes", reviewOutcomeRoutes);
v1.use("/integrations/outbox", integrationOutboxRoutes);
v1.use("/competencies", competencyRoutes);
v1.use("/competency-frameworks", competencyRoutes); // alias
v1.use("/career-paths", careerPathRoutes);
v1.use("/meetings", oneOnOneRoutes);
v1.use("/one-on-ones", oneOnOneRoutes); // alias
v1.use("/feedback", feedbackRoutes);
v1.use("/analytics", analyticsRoutes);
v1.use("/peer-reviews", peerReviewRoutes);
v1.use("/succession-plans", successionRoutes);
v1.use("/notifications", notificationRoutes);
v1.use("/letters", letterRoutes);
v1.use("/ai-summary", aiSummaryRoutes);
v1.use("/manager-effectiveness", managerEffectivenessRoutes);
v1.use("/users", usersRoutes);

// ---------------------------------------------------------------------------
// Alias routes for client compatibility (#870–#874)
// ---------------------------------------------------------------------------

// #871: GET /nine-box -> /analytics/nine-box
v1.get("/nine-box", authenticate, authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const cycleId = req.query.cycleId as string;
      if (!cycleId) throw new ValidationError("cycleId query parameter is required");
      const result = await analyticsService.getNineBoxData(orgId, cycleId);
      sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

// #872: GET /skills-gap/:employeeId -> /analytics/skills-gap/:employeeId
v1.get("/skills-gap/:employeeId", authenticate, skillsGapHandler);

// #873: GET /letter-templates -> /letters/templates
v1.get("/letter-templates", authenticate, authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const type = letterService.isLetterType(req.query.type) ? req.query.type : undefined;
      const result = await letterService.listTemplates(orgId, { type, perPage: 1000 });
      return sendSuccess(res, result.data);
    } catch (err) { next(err); }
  },
);

v1.use("/auth", authLimiter, authRoutes);

app.use("/api/v1", v1);

// API Documentation. Production exposure is opt-in through configuration.
if (config.security.docsEnabled) {
  // Self-hosted Swagger UI assets (swagger-ui-dist) served same-origin.
  app.use("/api/docs/ui", express.static(swaggerUiAssetPath, { maxAge: "7d", immutable: true }));
  app.get("/api/docs", swaggerUIHandler);
  app.get("/api/docs/openapi.json", openapiHandler);
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function listen(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const candidate = app.listen(config.port, config.host);
    httpServer = candidate;

    const onError = (error: Error) => {
      candidate.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      candidate.off("error", onError);
      resolve();
    };

    candidate.once("error", onError);
    candidate.once("listening", onListening);
  });
}

async function start() {
  try {
    // Validate configuration
    const { validateConfig } = await import("./config/validate");
    validateConfig();

    // Initialize EmpCloud master database (users, orgs, auth)
    await initEmpCloudDB();
    if (config.runtime.migrateEmpCloudOnStartup) {
      await migrateEmpCloudDB();
    } else {
      logger.info("EmpCloud startup migration skipped by runtime configuration");
    }

    // Initialize performance module database
    const db = await initDB();
    logger.info("Performance database connected");

    // Run migrations
    if (config.runtime.migrateOnStartup) {
      await db.migrate();
      logger.info("Performance database migrations applied");
    } else {
      logger.info("Performance database startup migration skipped by runtime configuration");
    }

    // Deliver transactional integration events from the database outbox. This
    // dispatcher is intentionally independent of Redis so release durability
    // does not depend on the optional reminder queue infrastructure.
    const { startOutboxDispatcher } = await import("./jobs/outbox.dispatcher");
    startOutboxDispatcher();

    // Initialize job queues (Redis-backed, graceful if unavailable)
    const { initJobQueues } = await import("./jobs/queue");
    await initJobQueues();

    // Start accepting traffic only after every required dependency and
    // background subsystem has completed initialization.
    await listen();
    if (!runtimeState.markReady()) {
      throw new Error("Server startup completed after shutdown was requested");
    }
    logger.info(`emp-performance server running at http://${config.host}:${config.port}`);
    logger.info(`   Environment: ${config.env}`);
  } catch (error) {
    logger.error("Failed to start server:", error);
    runtimeState.markFailed();
    await requestShutdown("startup_failure", 1);
  }
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
async function closeRuntimeDependencies(): Promise<void> {
  const errors: unknown[] = [];
  const attempt = async (name: string, close: () => Promise<void>) => {
    try {
      await close();
    } catch (error) {
      errors.push(error);
      logger.error(`Failed to close ${name} during shutdown`, error);
    }
  };

  await attempt("outbox dispatcher", async () => {
    const { stopOutboxDispatcher } = await import("./jobs/outbox.dispatcher");
    await stopOutboxDispatcher();
  });
  await attempt("job queues", async () => {
    const { closeJobQueues } = await import("./jobs/queue");
    await closeJobQueues();
  });
  await attempt("performance database", closeDB);
  await attempt("EmpCloud database", closeEmpCloudDB);

  if (errors.length > 0) {
    throw new AggregateError(errors, "One or more runtime dependencies failed to close");
  }
}

async function performShutdown(reason: string): Promise<void> {
  runtimeState.markDraining();
  logger.info("Shutting down...", { reason });

  const result = await runGracefulShutdown({
    server: httpServer,
    closeDependencies: closeRuntimeDependencies,
    timeoutMs: SHUTDOWN_TIMEOUT_MS,
    onTimeout: () => {
      logger.error(`Graceful shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms; forcing exit`);
      httpServer?.closeAllConnections?.();
    },
  });

  if (result.timedOut || result.errors.length > 0 || requestedExitCode > 0) {
    requestedExitCode = 1;
    runtimeState.markFailed();
    if (result.errors.length > 0) {
      logger.error("Graceful shutdown completed with errors", {
        errorCount: result.errors.length,
      });
    }
  } else {
    runtimeState.markStopped();
  }

  process.exit(requestedExitCode);
}

function requestShutdown(reason: string, exitCode = 0): Promise<void> {
  requestedExitCode = Math.max(requestedExitCode, exitCode);
  if (!shutdownPromise) {
    shutdownPromise = performShutdown(reason);
  }
  return shutdownPromise;
}

function fatalDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }
  return { reason: String(error) };
}

function handleFatalError(source: string, error: unknown): void {
  logger.error(`Fatal process error: ${source}`, fatalDetails(error));
  runtimeState.markFailed();
  void requestShutdown(source, 1);
}

process.on("SIGTERM", () => void requestShutdown("SIGTERM"));
process.on("SIGINT", () => void requestShutdown("SIGINT"));
process.on("uncaughtException", (error) => handleFatalError("uncaughtException", error));
process.on("unhandledRejection", (reason) => handleFatalError("unhandledRejection", reason));

void start();

export { app };
