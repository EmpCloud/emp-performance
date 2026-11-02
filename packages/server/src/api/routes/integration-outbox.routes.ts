import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";

import * as outboxAdminService from "../../services/integration/outbox-admin.service";
import { sendPaginated, sendSuccess } from "../../utils/response";
import { authenticate, authorize } from "../middleware/auth.middleware";

const router = Router();
const OUTBOX_READER_ROLES = ["super_admin", "org_admin", "hr_admin"] as const;
const OUTBOX_REPLAY_ROLES = ["super_admin", "org_admin"] as const;

const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(["pending", "processing", "retry", "delivered", "dead"])
    .optional(),
  eventType: z.string().trim().min(1).max(128).optional(),
});

router.use(authenticate);

export async function getIntegrationOutboxSummary(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const summary = await outboxAdminService.getOutboxSummary(
      req.user!.empcloudOrgId,
      req.actor!,
    );
    return sendSuccess(res, summary);
  } catch (error) {
    next(error);
  }
}

export async function listIntegrationOutboxEvents(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = listSchema.parse(req.query);
    const result = await outboxAdminService.listOutboxEvents(
      req.user!.empcloudOrgId,
      req.actor!,
      query,
    );
    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (error) {
    next(error);
  }
}

export async function getIntegrationOutboxEvent(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = idSchema.parse(req.params);
    const event = await outboxAdminService.getOutboxEvent(
      req.user!.empcloudOrgId,
      id,
      req.actor!,
    );
    return sendSuccess(res, event);
  } catch (error) {
    next(error);
  }
}

export async function replayIntegrationOutboxEvent(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = idSchema.parse(req.params);
    const event = await outboxAdminService.replayOutboxEvent(
      req.user!.empcloudOrgId,
      id,
      req.actor!,
    );
    return sendSuccess(res, event, 202);
  } catch (error) {
    next(error);
  }
}

router.get(
  "/summary",
  authorize(...OUTBOX_READER_ROLES),
  getIntegrationOutboxSummary,
);
router.get(
  "/",
  authorize(...OUTBOX_READER_ROLES),
  listIntegrationOutboxEvents,
);
router.get(
  "/:id",
  authorize(...OUTBOX_READER_ROLES),
  getIntegrationOutboxEvent,
);
router.post(
  "/:id/replay",
  authorize(...OUTBOX_REPLAY_ROLES),
  replayIntegrationOutboxEvent,
);

export { router as integrationOutboxRoutes };
