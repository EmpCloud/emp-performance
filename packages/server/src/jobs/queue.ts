// ============================================================================
// BULLMQ QUEUE SETUP
// Creates Redis connection, queues, workers, and schedules recurring reminder
// jobs. Handles graceful Redis unavailability — logs warning, does not crash.
// ============================================================================

import { Queue, Worker, QueueScheduler } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config";
import { logger } from "../utils/logger";
import {
  processReviewDeadlineReminders,
  processPIPCheckInReminders,
  processOneOnOneReminders,
  processGoalDeadlineReminders,
} from "./reminder.jobs";

// ---------------------------------------------------------------------------
// Redis connection
// ---------------------------------------------------------------------------

let redisConnection: IORedis | null = null;
let isRedisAvailable = false;

function createRedisConnection(): IORedis {
  const connection = new IORedis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: true,
    retryStrategy(times: number) {
      if (times > 5) {
        logger.warn("Redis: max retry attempts reached, stopping reconnection");
        return null;
      }
      return Math.min(times * 500, 5000);
    },
  });

  connection.on("connect", () => {
    isRedisAvailable = true;
    logger.info("Redis connected for job queues");
  });

  connection.on("error", (err) => {
    isRedisAvailable = false;
    logger.warn(`Redis connection error: ${err.message}`);
  });

  connection.on("close", () => {
    isRedisAvailable = false;
    logger.warn("Redis connection closed");
  });

  return connection;
}

function getRedisConnection(): IORedis {
  if (!redisConnection) {
    redisConnection = createRedisConnection();
  }
  return redisConnection;
}

// ---------------------------------------------------------------------------
// Queue names
// ---------------------------------------------------------------------------

export const QUEUE_NAMES = {
  REVIEW_REMINDERS: "performance:review-reminders",
  PIP_REMINDERS: "performance:pip-reminders",
  MEETING_REMINDERS: "performance:meeting-reminders",
  GOAL_REMINDERS: "performance:goal-reminders",
} as const;

// ---------------------------------------------------------------------------
// Queue instances
// ---------------------------------------------------------------------------

let queues: Record<string, Queue> = {};
let workers: Worker[] = [];

export function getQueue(name: string): Queue | null {
  return queues[name] ?? null;
}

export function isQueueSystemAvailable(): boolean {
  return isRedisAvailable;
}

// ---------------------------------------------------------------------------
// Status helper for API
// ---------------------------------------------------------------------------

export async function getQueueStatus(): Promise<
  { name: string; waiting: number; active: number; completed: number; failed: number; delayed: number }[]
> {
  const statuses = [];
  for (const [, queue] of Object.entries(queues)) {
    try {
      const counts = await queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
      );
      statuses.push({
        name: queue.name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      });
    } catch {
      statuses.push({
        name: queue.name,
        waiting: -1,
        active: -1,
        completed: -1,
        failed: -1,
        delayed: -1,
      });
    }
  }
  return statuses;
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

export async function initJobQueues(): Promise<void> {
  try {
    const connection = getRedisConnection();

    // Wait briefly for Redis to connect
    await new Promise<void>((resolve) => {
      if (isRedisAvailable) return resolve();
      const timer = setTimeout(() => resolve(), 3000);
      connection.once("ready", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    if (!isRedisAvailable) {
      logger.warn(
        "Redis is not available — job queues will not be started. Email reminders will only work via manual trigger.",
      );
      return;
    }

    const connectionOpts = { connection };

    // Create queues
    queues = {
      [QUEUE_NAMES.REVIEW_REMINDERS]: new Queue(QUEUE_NAMES.REVIEW_REMINDERS, connectionOpts),
      [QUEUE_NAMES.PIP_REMINDERS]: new Queue(QUEUE_NAMES.PIP_REMINDERS, connectionOpts),
      [QUEUE_NAMES.MEETING_REMINDERS]: new Queue(QUEUE_NAMES.MEETING_REMINDERS, connectionOpts),
      [QUEUE_NAMES.GOAL_REMINDERS]: new Queue(QUEUE_NAMES.GOAL_REMINDERS, connectionOpts),
    };

    // Create workers
    workers = [
      new Worker(
        QUEUE_NAMES.REVIEW_REMINDERS,
        async () => {
          await processReviewDeadlineReminders();
        },
        connectionOpts,
      ),
      new Worker(
        QUEUE_NAMES.PIP_REMINDERS,
        async () => {
          await processPIPCheckInReminders();
        },
        connectionOpts,
      ),
      new Worker(
        QUEUE_NAMES.MEETING_REMINDERS,
        async () => {
          await processOneOnOneReminders();
        },
        connectionOpts,
      ),
      new Worker(
        QUEUE_NAMES.GOAL_REMINDERS,
        async () => {
          await processGoalDeadlineReminders();
        },
        connectionOpts,
      ),
    ];

    // Attach error handlers to workers
    for (const worker of workers) {
      worker.on("failed", (job, err) => {
        logger.error(`Job ${job?.name} in ${worker.name} failed:`, err);
      });
      worker.on("completed", (job) => {
        logger.info(`Job ${job?.name} in ${worker.name} completed`);
      });
    }

    // Schedule recurring jobs — every day at 9:00 AM
    const cronSchedule = "0 9 * * *"; // 9 AM daily

    await queues[QUEUE_NAMES.REVIEW_REMINDERS].upsertJobScheduler(
      "daily-review-reminders",
      { pattern: cronSchedule },
      { name: "review-deadline-check" },
    );

    await queues[QUEUE_NAMES.PIP_REMINDERS].upsertJobScheduler(
      "daily-pip-reminders",
      { pattern: cronSchedule },
      { name: "pip-checkin-check" },
    );

    await queues[QUEUE_NAMES.MEETING_REMINDERS].upsertJobScheduler(
      "daily-meeting-reminders",
      { pattern: cronSchedule },
      { name: "meeting-reminder-check" },
    );

    await queues[QUEUE_NAMES.GOAL_REMINDERS].upsertJobScheduler(
      "daily-goal-reminders",
      { pattern: cronSchedule },
      { name: "goal-deadline-check" },
    );

    logger.info("Job queues initialized — recurring reminders scheduled at 9:00 AM daily");
  } catch (error) {
    logger.warn("Failed to initialize job queues — email reminders disabled:", error);
  }
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

export async function closeJobQueues(): Promise<void> {
  for (const worker of workers) {
    await worker.close();
  }
  for (const queue of Object.values(queues)) {
    await queue.close();
  }
  if (redisConnection) {
    redisConnection.disconnect();
    redisConnection = null;
  }
  logger.info("Job queues shut down");
}
