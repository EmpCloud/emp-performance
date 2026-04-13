// ============================================================================
// AI SUMMARY ROUTES
// GET review summary, employee summary, team summary.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as aiSummaryService from "../../services/ai-summary/ai-summary.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();
router.use(authenticate);

// GET /ai-summary/review/:reviewId — Generate/get review summary
router.get("/review/:reviewId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { reviewId } = req.params;
    if (!reviewId) throw new ValidationError("reviewId is required");
    const result = await aiSummaryService.generateReviewSummary(orgId, reviewId as string);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /ai-summary/employee/:userId — Employee performance summary
router.get("/employee/:userId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const userId = parseInt(req.params.userId as string);
    const cycleId = req.query.cycleId as string;
    if (isNaN(userId)) throw new ValidationError("userId must be a number");
    if (!cycleId) throw new ValidationError("cycleId query parameter is required");
    const result = await aiSummaryService.generateEmployeeSummary(orgId, userId, cycleId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /ai-summary/team/:managerId — Team summary for manager
router.get(
  "/team/:managerId",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const managerId = parseInt(req.params.managerId as string);
      const cycleId = req.query.cycleId as string;
      if (isNaN(managerId)) throw new ValidationError("managerId must be a number");
      if (!cycleId) throw new ValidationError("cycleId query parameter is required");
      const result = await aiSummaryService.generateTeamSummary(orgId, managerId, cycleId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as aiSummaryRoutes };
