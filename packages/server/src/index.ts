// ============================================================================
// EMP-PERFORMANCE SERVER ENTRY POINT
// ============================================================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
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
import { authRoutes } from "./api/routes/auth.routes";
import { careerPathRoutes } from "./api/routes/career-path.routes";
import { oneOnOneRoutes } from "./api/routes/one-on-one.routes";
import { feedbackRoutes } from "./api/routes/feedback.routes";
import { analyticsRoutes } from "./api/routes/analytics.routes";
import { peerReviewRoutes } from "./api/routes/peer-review.routes";
import { successionRoutes } from "./api/routes/succession.routes";
import { notificationRoutes } from "./api/routes/notification.routes";
import { letterRoutes } from "./api/routes/letter.routes";
import { aiSummaryRoutes } from "./api/routes/ai-summary.routes";
import { managerEffectivenessRoutes } from "./api/routes/manager-effectiveness.routes";
import { authenticate, authorize } from "./api/middleware/auth.middleware";
import { errorHandler } from "./api/middleware/error.middleware";
import { apiLimiter, authLimiter } from "./api/middleware/rate-limit.middleware";
import { swaggerUIHandler, openapiHandler } from "./api/docs";
import * as analyticsService from "./services/analytics/analytics.service";
import * as letterService from "./services/letter/performance-letter.service";
import { sendSuccess } from "./utils/response";
import { ValidationError } from "./utils/errors";

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (config.cors.origin === "*") return callback(null, true);
      // Allow empcloud.com subdomains (production & test)
      if (origin.endsWith(".empcloud.com") && origin.startsWith("https://")) {
        return callback(null, true);
      }
      if (
        config.env === "development" &&
        (origin.startsWith("http://localhost") ||
          origin.startsWith("http://127.0.0.1") ||
          origin.endsWith(".ngrok-free.dev"))
      ) {
        return callback(null, true);
      }
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
app.use(morgan("combined", { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.use("/health", healthRoutes);

// ---------------------------------------------------------------------------
// API Routes (v1)
// ---------------------------------------------------------------------------
const v1 = express.Router();
v1.use(apiLimiter);

// Feature routes
v1.use("/goals", goalRoutes);
v1.use("/goal-alignment", goalRoutes); // alias — /goal-alignment/tree -> /goals/tree (#870)
v1.use("/pips", pipRoutes);

// Feature routes
v1.use("/review-cycles", reviewCycleRoutes);
v1.use("/reviews", reviewRoutes);
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
v1.get("/skills-gap/:employeeId", authenticate,
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const employeeId = parseInt(String(req.params.employeeId));
      if (isNaN(employeeId)) throw new ValidationError("employeeId must be a number");
      const result = await analyticsService.getSkillsGap(orgId, employeeId);
      const recommendations = analyticsService.getLearningRecommendations(result.competencies);
      sendSuccess(res, { ...result, recommendations });
    } catch (err) { next(err); }
  },
);

// #873: GET /letter-templates -> /letters/templates
v1.get("/letter-templates", authenticate, authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const type = req.query.type as letterService.LetterType | undefined;
      const result = await letterService.listTemplates(orgId, type);
      return sendSuccess(res, result);
    } catch (err) { next(err); }
  },
);

v1.use("/auth", authLimiter, authRoutes);

app.use("/api/v1", v1);

// API Documentation
app.get("/api/docs", swaggerUIHandler);
app.get("/api/docs/openapi.json", openapiHandler);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function start() {
  try {
    // Validate configuration
    const { validateConfig } = await import("./config/validate");
    validateConfig();

    // Initialize EmpCloud master database (users, orgs, auth)
    await initEmpCloudDB();
    await migrateEmpCloudDB();

    // Initialize performance module database
    const db = await initDB();
    logger.info("Performance database connected");

    // Run migrations
    await db.migrate();
    logger.info("Performance database migrations applied");

    // Initialize job queues (Redis-backed, graceful if unavailable)
    const { initJobQueues } = await import("./jobs/queue");
    await initJobQueues();

    // Start server
    app.listen(config.port, config.host, () => {
      logger.info(`emp-performance server running at http://${config.host}:${config.port}`);
      logger.info(`   Environment: ${config.env}`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
const shutdown = async () => {
  logger.info("Shutting down...");
  try {
    const { closeJobQueues } = await import("./jobs/queue");
    await closeJobQueues();
  } catch {
    // Queue may not have been initialized
  }
  await closeDB();
  await closeEmpCloudDB();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();

export { app };
