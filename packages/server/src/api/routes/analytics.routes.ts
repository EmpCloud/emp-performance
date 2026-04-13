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

// GET /analytics/nine-box?cycleId=xxx
router.get(
  "/nine-box",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const cycleId = req.query.cycleId as string;
      if (!cycleId) throw new ValidationError("cycleId query parameter is required");
      const result = await analyticsService.getNineBoxData(orgId, cycleId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /analytics/potential-assessments
router.post(
  "/potential-assessments",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const assessedBy = req.user!.empcloudUserId;
      const { cycle_id, employee_id, potential_rating, notes } = req.body;
      if (!cycle_id || !employee_id || potential_rating == null) {
        throw new ValidationError("cycle_id, employee_id, and potential_rating are required");
      }
      const result = await analyticsService.createPotentialAssessment(
        orgId,
        { cycle_id, employee_id: Number(employee_id), potential_rating: Number(potential_rating), notes },
        assessedBy,
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /analytics/potential-assessments?cycleId=xxx
router.get(
  "/potential-assessments",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const cycleId = req.query.cycleId as string;
      if (!cycleId) throw new ValidationError("cycleId query parameter is required");
      const result = await analyticsService.listPotentialAssessments(orgId, cycleId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /analytics/skills-gap/department/:deptId — department aggregate
// (Must be before /:employeeId to avoid "department" being matched as an ID)
router.get(
  "/skills-gap/department/:deptId",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const deptId = req.params.deptId;
      if (!deptId) throw new ValidationError("deptId is required");

      const result = await analyticsService.getDepartmentSkillsGap(orgId, deptId as string);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /analytics/skills-gap/:employeeId — individual skills gap
router.get("/skills-gap/:employeeId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const employeeId = parseInt(req.params.employeeId as string);
    if (isNaN(employeeId)) throw new ValidationError("employeeId must be a number");

    const result = await analyticsService.getSkillsGap(orgId, employeeId);
    const recommendations = analyticsService.getLearningRecommendations(result.competencies);
    sendSuccess(res, { ...result, recommendations });
  } catch (err) {
    next(err);
  }
});

export { router as analyticsRoutes };
