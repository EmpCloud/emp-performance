// ============================================================================
// CONTINUOUS FEEDBACK SERVICE
// Manages giving/receiving feedback, kudos wall, and feedback visibility.
// ============================================================================

import { getDB } from "../../db/adapters";
import { NotFoundError, ForbiddenError } from "../../utils/errors";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Feedback {
  id: string;
  organization_id: number;
  from_user_id: number;
  to_user_id: number;
  type: string;
  visibility: string;
  message: string;
  tags: string | null;
  is_anonymous: boolean;
  created_at: Date;
}

interface GiveFeedbackData {
  to_user_id: number;
  type: string; // "kudos" | "constructive" | "suggestion"
  message: string;
  visibility?: string; // "public" | "manager_visible" | "private"
  tags?: string[];
  is_anonymous?: boolean;
}

interface ListFeedbackParams {
  page?: number;
  limit?: number;
  type?: string;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function giveFeedback(
  orgId: number,
  fromUserId: number,
  data: GiveFeedbackData,
): Promise<Feedback> {
  const db = getDB();

  const feedback = await db.create<Feedback>("continuous_feedback", {
    organization_id: orgId,
    from_user_id: fromUserId,
    to_user_id: data.to_user_id,
    type: data.type,
    visibility: data.visibility || "manager_visible",
    message: data.message,
    tags: data.tags ? JSON.stringify(data.tags) : null,
    is_anonymous: data.is_anonymous || false,
  });

  logger.info(`Feedback given: ${data.type} from user ${fromUserId} to user ${data.to_user_id} (org: ${orgId})`);
  return feedback;
}

export async function listReceived(
  orgId: number,
  userId: number,
  params?: ListFeedbackParams,
) {
  const db = getDB();
  const filters: Record<string, any> = {
    organization_id: orgId,
    to_user_id: userId,
  };
  if (params?.type) filters.type = params.type;

  return db.findMany<Feedback>("continuous_feedback", {
    page: params?.page || 1,
    limit: params?.limit || 20,
    filters,
    sort: { field: "created_at", order: "desc" },
  });
}

export async function listGiven(
  orgId: number,
  userId: number,
  params?: ListFeedbackParams,
) {
  const db = getDB();
  const filters: Record<string, any> = {
    organization_id: orgId,
    from_user_id: userId,
  };
  if (params?.type) filters.type = params.type;

  return db.findMany<Feedback>("continuous_feedback", {
    page: params?.page || 1,
    limit: params?.limit || 20,
    filters,
    sort: { field: "created_at", order: "desc" },
  });
}

export async function getPublicWall(
  orgId: number,
  params?: { page?: number; limit?: number },
) {
  const db = getDB();
  return db.findMany<Feedback>("continuous_feedback", {
    page: params?.page || 1,
    limit: params?.limit || 20,
    filters: {
      organization_id: orgId,
      visibility: "public",
    },
    sort: { field: "created_at", order: "desc" },
  });
}

export async function deleteFeedback(orgId: number, id: string): Promise<void> {
  const db = getDB();
  const feedback = await db.findOne<Feedback>("continuous_feedback", {
    id,
    organization_id: orgId,
  });
  if (!feedback) {
    throw new NotFoundError("Feedback", id);
  }

  await db.delete("continuous_feedback", id);
  logger.info(`Feedback deleted: ${id} (org: ${orgId})`);
}
