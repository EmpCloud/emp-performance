// ============================================================================
// ANALYTICS ROUTES
// GET overview, ratings distribution, trends, team comparison,
// goal completion, top performers.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as analyticsService from "../../services/analytics/analytics.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();
router.use(authenticate);

// GET /analytics/overview
router.get("/overview", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await analyticsService.getOverview(orgId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /analytics/ratings-distribution?cycleId=xxx
router.get("/ratings-distribution", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const cycleId = req.query.cycleId as string;
    if (!cycleId) throw new ValidationError("cycleId query parameter is required");
    const result = await analyticsService.getRatingsDistribution(orgId, cycleId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /analytics/trends
router.get("/trends", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await analyticsService.getTrends(orgId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /analytics/team-comparison?managerId=xxx
router.get(
  "/team-comparison",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const managerId = parseInt(req.query.managerId as string) || req.user!.empcloudUserId;
      const result = await analyticsService.getTeamComparison(orgId, managerId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /analytics/goal-completion
router.get("/goal-completion", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await analyticsService.getGoalCompletion(orgId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /analytics/top-performers?cycleId=xxx
router.get("/top-performers", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const cycleId = req.query.cycleId as string;
    if (!cycleId) throw new ValidationError("cycleId query parameter is required");
    const result = await analyticsService.getTopPerformers(orgId, cycleId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

export { router as analyticsRoutes };
