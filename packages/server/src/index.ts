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
import { errorHandler } from "./api/middleware/error.middleware";
import { apiLimiter, authLimiter } from "./api/middleware/rate-limit.middleware";
import { swaggerUIHandler, openapiHandler } from "./api/docs";

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
