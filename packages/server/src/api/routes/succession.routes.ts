// ============================================================================
// SUCCESSION PLANNING ROUTES
// CRUD for succession plans and candidates.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as analyticsService from "../../services/analytics/analytics.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();
router.use(authenticate);
router.use(authorize("hr_admin", "hr_manager", "org_admin"));

// GET /succession-plans
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await analyticsService.listSuccessionPlans(orgId);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /succession-plans
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { position_title, current_holder_id, department, criticality, status } = req.body;
    if (!position_title) {
      throw new ValidationError("position_title is required");
    }
    const result = await analyticsService.createSuccessionPlan(orgId, {
      position_title,
      current_holder_id: current_holder_id ? Number(current_holder_id) : undefined,
      department,
      criticality,
      status,
    });
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// GET /succession-plans/:id
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await analyticsService.getSuccessionPlan(orgId, req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /succession-plans/:id/candidates
router.post("/:id/candidates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { employee_id, readiness, development_notes, nine_box_position } = req.body;
    if (!employee_id) {
      throw new ValidationError("employee_id is required");
    }
    const result = await analyticsService.addSuccessionCandidate(orgId, req.params.id, {
      employee_id: Number(employee_id),
      readiness,
      development_notes,
      nine_box_position,
    });
    sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
});

// PUT /succession-plans/:id/candidates/:candidateId
router.put(
  "/:id/candidates/:candidateId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { readiness, development_notes, nine_box_position } = req.body;
      const result = await analyticsService.updateSuccessionCandidate(
        orgId,
        req.params.id,
        req.params.candidateId,
        { readiness, development_notes, nine_box_position },
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as successionRoutes };
