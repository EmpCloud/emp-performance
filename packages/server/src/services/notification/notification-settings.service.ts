// ============================================================================
// NOTIFICATION SETTINGS SERVICE
// Manages per-organization notification preferences for automated reminders.
// Settings are stored in the performance database.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NotificationSettings {
  id: string;
  organization_id: number;
  review_reminders_enabled: boolean;
  pip_reminders_enabled: boolean;
  meeting_reminders_enabled: boolean;
  goal_reminders_enabled: boolean;
  reminder_days_before_deadline: number;
  rating_scale: number;
  default_framework: string;
  created_at: Date;
  updated_at: Date;
}

export interface UpdateNotificationSettingsInput {
  review_reminders_enabled?: boolean;
  pip_reminders_enabled?: boolean;
  meeting_reminders_enabled?: boolean;
  goal_reminders_enabled?: boolean;
  reminder_days_before_deadline?: number;
  rating_scale?: number;
  default_framework?: string;
}

// Default settings for organizations without explicit configuration
const DEFAULTS: Omit<NotificationSettings, "id" | "organization_id" | "created_at" | "updated_at"> = {
  review_reminders_enabled: true,
  pip_reminders_enabled: true,
  meeting_reminders_enabled: true,
  goal_reminders_enabled: true,
  reminder_days_before_deadline: 3,
  rating_scale: 5,
  default_framework: "",
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Get notification settings for an organization.
 * Returns default values if no settings row exists.
 */
export async function getNotificationSettings(orgId: number): Promise<NotificationSettings> {
  const db = getDB();

  try {
    const existing = await db.findOne<NotificationSettings>("notification_settings", {
      organization_id: orgId,
    });

    if (existing) return existing;
  } catch {
    // Table might not exist yet — return defaults
    logger.debug(`notification_settings table not found or query failed for org ${orgId}, using defaults`);
  }

  // Return default settings (not persisted yet)
  return {
    id: "",
    organization_id: orgId,
    ...DEFAULTS,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

/**
 * Update notification settings for an organization.
 * Creates the settings row if it does not exist.
 */
export async function updateNotificationSettings(
  orgId: number,
  data: UpdateNotificationSettingsInput,
): Promise<NotificationSettings> {
  const db = getDB();

  let existing: NotificationSettings | null = null;
  try {
    existing = await db.findOne<NotificationSettings>("notification_settings", {
      organization_id: orgId,
    });
  } catch {
    // Table might not exist — will be created by migration
  }

  const updates: Record<string, any> = {};
  if (data.review_reminders_enabled !== undefined) updates.review_reminders_enabled = data.review_reminders_enabled;
  if (data.pip_reminders_enabled !== undefined) updates.pip_reminders_enabled = data.pip_reminders_enabled;
  if (data.meeting_reminders_enabled !== undefined) updates.meeting_reminders_enabled = data.meeting_reminders_enabled;
  if (data.goal_reminders_enabled !== undefined) updates.goal_reminders_enabled = data.goal_reminders_enabled;
  if (data.reminder_days_before_deadline !== undefined) updates.reminder_days_before_deadline = data.reminder_days_before_deadline;
  if (data.rating_scale !== undefined) updates.rating_scale = data.rating_scale;
  if (data.default_framework !== undefined) updates.default_framework = data.default_framework;

  if (existing) {
    return db.update<NotificationSettings>("notification_settings", existing.id, updates);
  }

  // Create new settings row with defaults + overrides
  const newSettings = {
    id: uuidv4(),
    organization_id: orgId,
    ...DEFAULTS,
    ...updates,
  };

  return db.create<NotificationSettings>("notification_settings", newSettings as any);
}
