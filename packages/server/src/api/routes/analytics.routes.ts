// ============================================================================
// ANALYTICS ROUTES
// GET overview, ratings distribution, trends, team comparison,
// goal completion, top performers.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as analyticsService from "../../services/analytics/analytics.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError, ForbiddenError } from "../../utils/errors";
import { createPotentialAssessmentSchema } from "@emp-performance/shared";

const router = Router();
router.use(authenticate);

const HR_ROLES = ["hr_admin", "hr_manager", "org_admin", "super_admin"] as const;

// GET /analytics/overview — org-wide stats (HR only, A4)
router.get(
  "/overview",
  authorize("super_admin", "hr_admin", "hr_manager", "org_admin", "service"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await analyticsService.getOverview(orgId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /analytics/my-overview — current user's My Performance card values
router.get("/my-overview", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const userId = req.user!.empcloudUserId;
    const result = await analyticsService.getMyOverview(orgId, userId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /analytics/ratings-distribution?cycleId=xxx (HR only, A4)
router.get(
  "/ratings-distribution",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const cycleId = req.query.cycleId as string;
      if (!cycleId) throw new ValidationError("cycleId query parameter is required");
      const result = await analyticsService.getRatingsDistribution(orgId, cycleId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /analytics/trends (HR only, A4)
router.get(
  "/trends",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const result = await analyticsService.getTrends(orgId, limit);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

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

// GET /analytics/goal-completion (HR only, A4)
router.get(
  "/goal-completion",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await analyticsService.getGoalCompletion(orgId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /analytics/top-performers?cycleId=xxx (HR only, A4)
router.get(
  "/top-performers",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const cycleId = req.query.cycleId as string;
      if (!cycleId) throw new ValidationError("cycleId query parameter is required");
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const result = await analyticsService.getTopPerformers(orgId, cycleId, limit);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

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
      const body = createPotentialAssessmentSchema.parse(req.body);
      const result = await analyticsService.createPotentialAssessment(
        orgId,
        {
          cycle_id: body.cycle_id,
          employee_id: body.employee_id,
          potential_rating: body.potential_rating,
          notes: body.notes ?? undefined,
        },
        assessedBy,
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /analytics/potential-assessments/:id — remove an assessment (A7)
router.delete(
  "/potential-assessments/:id",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const id = req.params.id as string;
      if (!id) throw new ValidationError("id is required");
      await analyticsService.deletePotentialAssessment(orgId, id);
      sendSuccess(res, { deleted: true });
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
// A4: a user may read their own gap; otherwise HR/admin only.
router.get("/skills-gap/:employeeId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const employeeId = parseInt(req.params.employeeId as string);
    if (isNaN(employeeId)) throw new ValidationError("employeeId must be a number");

    const isHr = (HR_ROLES as readonly string[]).includes(req.user!.role);
    if (!isHr && req.user!.empcloudUserId !== employeeId) {
      throw new ForbiddenError("You may only view your own skills gap");
    }

    const result = await analyticsService.getSkillsGap(orgId, employeeId);
    const recommendations = analyticsService.getLearningRecommendations(result.competencies);
    sendSuccess(res, { ...result, recommendations });
  } catch (err) {
    next(err);
  }
});

export { router as analyticsRoutes };
