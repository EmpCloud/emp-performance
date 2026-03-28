// ============================================================================
// NOTIFICATION ROUTES
// Manual trigger endpoints for testing email reminders, queue status, and
// notification settings management.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendError } from "../../utils/response";
import { logger } from "../../utils/logger";
import {
  processReviewDeadlineReminders,
  processPIPCheckInReminders,
  processOneOnOneReminders,
  processGoalDeadlineReminders,
} from "../../jobs/reminder.jobs";
import { getQueueStatus, isQueueSystemAvailable } from "../../jobs/queue";
import {
  getNotificationSettings,
  updateNotificationSettings,
} from "../../services/notification/notification-settings.service";
import { sendEmail } from "../../services/email/email.service";

const router = Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// POST /send-review-reminders — manually trigger review reminders
// ---------------------------------------------------------------------------
router.post(
  "/send-review-reminders",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await processReviewDeadlineReminders();
      return sendSuccess(res, { message: "Review reminders processed" });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /send-pip-reminders — manually trigger PIP reminders
// ---------------------------------------------------------------------------
router.post(
  "/send-pip-reminders",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await processPIPCheckInReminders();
      return sendSuccess(res, { message: "PIP reminders processed" });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /send-meeting-reminders — manually trigger meeting reminders
// ---------------------------------------------------------------------------
router.post(
  "/send-meeting-reminders",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await processOneOnOneReminders();
      return sendSuccess(res, { message: "Meeting reminders processed" });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /send-goal-reminders — manually trigger goal reminders
// ---------------------------------------------------------------------------
router.post(
  "/send-goal-reminders",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      await processGoalDeadlineReminders();
      return sendSuccess(res, { message: "Goal reminders processed" });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /queue-status — get queue health and pending counts
// ---------------------------------------------------------------------------
router.get(
  "/queue-status",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const available = isQueueSystemAvailable();
      const queues = available ? await getQueueStatus() : [];

      return sendSuccess(res, {
        redis_connected: available,
        queues,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /settings — get notification settings for current org
// ---------------------------------------------------------------------------
router.get(
  "/settings",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const settings = await getNotificationSettings(orgId);
      return sendSuccess(res, settings);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /settings — update notification settings for current org
// ---------------------------------------------------------------------------
router.put(
  "/settings",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const settings = await updateNotificationSettings(orgId, req.body);
      return sendSuccess(res, settings);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /send-test-email — send a test email to the current user
// ---------------------------------------------------------------------------
router.post(
  "/send-test-email",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = req.user!.email;
      const name = `${req.user!.firstName} ${req.user!.lastName}`;

      await sendEmail(
        email,
        "EMP Performance — Test Email",
        `<!DOCTYPE html>
<html><body style="margin:0;padding:32px;font-family:sans-serif;background:#f4f5f7;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <h2 style="color:#4f46e5;margin:0 0 16px;">Test Email Successful</h2>
    <p style="color:#374151;">Hi <strong>${name}</strong>,</p>
    <p style="color:#374151;">This is a test email from EMP Performance. If you received this, your email configuration is working correctly.</p>
    <p style="color:#6b7280;font-size:13px;margin-top:24px;">Sent at ${new Date().toISOString()}</p>
  </div>
</body></html>`,
      );

      return sendSuccess(res, { message: `Test email sent to ${email}` });
    } catch (err) {
      logger.error("Failed to send test email:", err);
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /pending — list pending notifications (queue items waiting/active)
// ---------------------------------------------------------------------------
router.get(
  "/pending",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const available = isQueueSystemAvailable();
      const queues = available ? await getQueueStatus() : [];
      const pending = (queues as any[]).filter((q: any) => q.waiting > 0 || q.active > 0);
      return sendSuccess(res, {
        pending,
        total: pending.reduce((sum: number, q: any) => sum + (q.waiting || 0), 0),
      });
    } catch (err) {
      next(err);
    }
  },
);

export { router as notificationRoutes };
