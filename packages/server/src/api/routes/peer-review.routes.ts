// ============================================================================
// PEER REVIEW ROUTES
// POST nominate, GET nominations, PUT approve/decline.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as peerReviewService from "../../services/peer-review/peer-review.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();
router.use(authenticate);

// POST /peer-reviews/nominate
router.post("/nominate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { cycleId, employeeId, peerId } = req.body;
    if (!cycleId || !employeeId || !peerId) {
      throw new ValidationError("cycleId, employeeId, and peerId are required");
    }
    const result = await peerReviewService.nominate(
      orgId,
      cycleId,
      employeeId,
      peerId,
      req.user!.empcloudUserId,
    );
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// GET /peer-reviews/nominations?cycleId=xxx
router.get("/nominations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const cycleId = req.query.cycleId as string;
    if (!cycleId) throw new ValidationError("cycleId query parameter is required");
    const result = await peerReviewService.listNominations(orgId, cycleId, {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
      employeeId: req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined,
      nomineeId: req.query.nomineeId ? parseInt(req.query.nomineeId as string) : undefined,
      status: req.query.status as string | undefined,
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// PUT /peer-reviews/:id/approve
router.put(
  "/:id/approve",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await peerReviewService.approveNomination(
        orgId,
        req.params.id,
        req.user!.empcloudUserId,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /peer-reviews/:id/decline
router.put(
  "/:id/decline",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await peerReviewService.declineNomination(
        orgId,
        req.params.id,
        req.user!.empcloudUserId,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as peerReviewRoutes };
