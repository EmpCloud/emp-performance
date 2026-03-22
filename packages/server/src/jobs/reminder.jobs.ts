// ============================================================================
// REMINDER JOB PROCESSORS
// BullMQ job handlers that query the database for upcoming deadlines and
// send the appropriate email reminders.
// ============================================================================

import dayjs from "dayjs";
import { getDB } from "../db/adapters";
import { logger } from "../utils/logger";
import {
  sendReviewReminder,
  sendPIPCheckInReminder,
  sendOneOnOneReminder,
  sendGoalDeadlineReminder,
} from "../services/email/email.service";
import { getNotificationSettings } from "../services/notification/notification-settings.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import type { EmpCloudUser } from "../db/empcloud";
import { findUserById } from "../db/empcloud";

/**
 * Look up a user from the empcloud master database.
 * Returns null if not found (e.g. user was deleted).
 */
async function lookupUser(userId: number): Promise<EmpCloudUser | null> {
  try {
    return await findUserById(userId);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Review Deadline Reminder
// Finds active review cycles where the review_deadline is within N days
// (configurable via org notification settings, default 3).
// Sends reminders to participants with pending/draft reviews.
// ---------------------------------------------------------------------------

export async function processReviewDeadlineReminders(): Promise<void> {
  logger.info("Processing review deadline reminders...");
  const db = getDB();

  try {
    // Get all active cycles
    const cycles = await db.findMany<any>("review_cycles", {
      filters: { status: "active" },
      limit: 10000,
    });

    let sentCount = 0;

    for (const cycle of cycles.data) {
      if (!cycle.review_deadline) continue;

      // Load org notification settings
      const settings = await getNotificationSettings(cycle.organization_id);
      if (!settings.review_reminders_enabled) continue;

      const deadline = dayjs(cycle.review_deadline);
      const daysUntil = deadline.diff(dayjs(), "day");

      if (daysUntil < 0 || daysUntil > settings.reminder_days_before_deadline) continue;

      // Find participants with pending reviews
      const participants = await db.findMany<any>("review_cycle_participants", {
        filters: { cycle_id: cycle.id, status: "pending" },
        limit: 10000,
      });

      for (const participant of participants.data) {
        const user = await lookupUser(participant.employee_id);
        if (!user) continue;

        try {
          await sendReviewReminder(
            user.email,
            `${user.first_name} ${user.last_name}`,
            cycle.name,
            deadline.format("YYYY-MM-DD"),
            cycle.type ?? "performance",
          );
          sentCount++;
        } catch (err) {
          logger.error(`Failed to send review reminder to ${user.email}:`, err);
        }
      }
    }

    logger.info(`Review deadline reminders sent: ${sentCount}`);
  } catch (error) {
    logger.error("Error processing review deadline reminders:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// PIP Check-In Reminder
// Finds active PIPs and sends weekly check-in reminders to both the employee
// and the manager. Runs daily but only sends on the same weekday the PIP
// was created (or every Monday as fallback).
// ---------------------------------------------------------------------------

export async function processPIPCheckInReminders(): Promise<void> {
  logger.info("Processing PIP check-in reminders...");
  const db = getDB();

  try {
    const pips = await db.findMany<any>("performance_improvement_plans", {
      filters: { status: "active" },
      limit: 10000,
    });

    let sentCount = 0;
    const today = dayjs();

    for (const pip of pips.data) {
      const settings = await getNotificationSettings(pip.organization_id);
      if (!settings.pip_reminders_enabled) continue;

      // Send weekly — check if today is the same day of week as PIP creation, or Monday
      const createdDay = dayjs(pip.created_at).day();
      const sendDay = createdDay || 1; // default to Monday (1) if Sunday (0)
      if (today.day() !== sendDay) continue;

      const pipTitle = pip.title || pip.reason?.substring(0, 50) || "Performance Improvement Plan";
      const nextCheckIn = today.format("YYYY-MM-DD");

      // Notify employee
      const employee = await lookupUser(pip.employee_id);
      if (employee) {
        try {
          await sendPIPCheckInReminder(
            employee.email,
            `${employee.first_name} ${employee.last_name}`,
            pipTitle,
            nextCheckIn,
          );
          sentCount++;
        } catch (err) {
          logger.error(`Failed to send PIP reminder to employee ${employee.email}:`, err);
        }
      }

      // Notify manager
      if (pip.manager_id) {
        const manager = await lookupUser(pip.manager_id);
        if (manager) {
          try {
            await sendPIPCheckInReminder(
              manager.email,
              `${manager.first_name} ${manager.last_name}`,
              pipTitle,
              nextCheckIn,
            );
            sentCount++;
          } catch (err) {
            logger.error(`Failed to send PIP reminder to manager ${manager.email}:`, err);
          }
        }
      }
    }

    logger.info(`PIP check-in reminders sent: ${sentCount}`);
  } catch (error) {
    logger.error("Error processing PIP check-in reminders:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// One-on-One Meeting Reminder
// Finds meetings scheduled for tomorrow and sends reminders to both parties.
// ---------------------------------------------------------------------------

export async function processOneOnOneReminders(): Promise<void> {
  logger.info("Processing 1-on-1 meeting reminders...");
  const db = getDB();

  try {
    const tomorrow = dayjs().add(1, "day");
    const tomorrowStart = tomorrow.startOf("day").toISOString();
    const tomorrowEnd = tomorrow.endOf("day").toISOString();

    // Find meetings scheduled for tomorrow
    // We query all scheduled meetings and filter by date range in-memory
    // since the DB adapter uses simple equality filters
    const meetings = await db.findMany<any>("one_on_one_meetings", {
      filters: { status: "scheduled" },
      limit: 10000,
    });

    let sentCount = 0;

    for (const meeting of meetings.data) {
      const scheduledAt = dayjs(meeting.scheduled_at);
      if (!scheduledAt.isAfter(tomorrowStart) || !scheduledAt.isBefore(tomorrowEnd)) continue;

      // Check org notification settings
      const settings = await getNotificationSettings(meeting.organization_id);
      if (!settings.meeting_reminders_enabled) continue;

      const manager = await lookupUser(meeting.manager_id);
      const employee = await lookupUser(meeting.employee_id);

      if (!manager || !employee) continue;

      try {
        await sendOneOnOneReminder(
          manager.email,
          employee.email,
          meeting.title,
          scheduledAt.format("YYYY-MM-DD HH:mm"),
        );
        sentCount++;
      } catch (err) {
        logger.error(`Failed to send meeting reminder for ${meeting.id}:`, err);
      }
    }

    logger.info(`1-on-1 meeting reminders sent: ${sentCount}`);
  } catch (error) {
    logger.error("Error processing 1-on-1 meeting reminders:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Goal Deadline Reminder
// Finds goals with due dates within N days (default 3) that are not completed.
// ---------------------------------------------------------------------------

export async function processGoalDeadlineReminders(): Promise<void> {
  logger.info("Processing goal deadline reminders...");
  const db = getDB();

  try {
    // Get all non-completed, non-cancelled goals
    const goals = await db.findMany<any>("goals", {
      filters: {},
      limit: 100000,
    });

    let sentCount = 0;
    const today = dayjs();

    for (const goal of goals.data) {
      if (!goal.due_date) continue;
      if (goal.status === "completed" || goal.status === "cancelled") continue;

      const settings = await getNotificationSettings(goal.organization_id);
      if (!settings.goal_reminders_enabled) continue;

      const dueDate = dayjs(goal.due_date);
      const daysUntil = dueDate.diff(today, "day");

      if (daysUntil < 0 || daysUntil > settings.reminder_days_before_deadline) continue;

      const user = await lookupUser(goal.employee_id);
      if (!user) continue;

      try {
        await sendGoalDeadlineReminder(
          user.email,
          `${user.first_name} ${user.last_name}`,
          goal.title,
          dueDate.format("YYYY-MM-DD"),
        );
        sentCount++;
      } catch (err) {
        logger.error(`Failed to send goal reminder to ${user.email}:`, err);
      }
    }

    logger.info(`Goal deadline reminders sent: ${sentCount}`);
  } catch (error) {
    logger.error("Error processing goal deadline reminders:", error);
    throw error;
  }
}
