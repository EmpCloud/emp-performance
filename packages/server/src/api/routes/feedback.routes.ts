// ============================================================================
// FEEDBACK ROUTES
// POST give, GET received/given/wall, DELETE feedback.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware";
import * as feedbackService from "../../services/feedback/feedback.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();
router.use(authenticate);

// POST /feedback — give feedback
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const fromUserId = req.user!.empcloudUserId;
    const { to_user_id, type, message, visibility, tags, is_anonymous } = req.body;
    if (!to_user_id || !type || !message) {
      throw new ValidationError("to_user_id, type, and message are required");
    }
    const result = await feedbackService.giveFeedback(orgId, fromUserId, {
      to_user_id,
      type,
      message,
      visibility,
      tags,
      is_anonymous,
    });
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// GET /feedback/received
router.get("/received", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const userId = req.user!.empcloudUserId;
    const result = await feedbackService.listReceived(orgId, userId, {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      type: req.query.type as string | undefined,
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /feedback/given
router.get("/given", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const userId = req.user!.empcloudUserId;
    const result = await feedbackService.listGiven(orgId, userId, {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      type: req.query.type as string | undefined,
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /feedback/wall — public kudos feed
router.get("/wall", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await feedbackService.getPublicWall(orgId, {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// DELETE /feedback/:id
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    await feedbackService.deleteFeedback(orgId, req.params.id);
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export { router as feedbackRoutes };
