// ============================================================================
// MANAGER EFFECTIVENESS ROUTES
// Calculate, list, detail, dashboard for manager effectiveness scoring.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as meService from "../../services/manager-effectiveness/manager-effectiveness.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();
router.use(authenticate);

// GET /manager-effectiveness/dashboard — Dashboard stats (HR)
// Must be before /:managerId to avoid "dashboard" being matched as an ID
router.get(
  "/dashboard",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await meService.getDashboard(orgId);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /manager-effectiveness — List all manager scores (HR)
router.get(
  "/",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const period = req.query.period as string;
      if (!period) throw new ValidationError("period query parameter is required (e.g. 2026-Q1)");
      const result = await meService.listManagerScores(orgId, period);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /manager-effectiveness/calculate-all — Batch calculate for all managers (HR)
router.post(
  "/calculate-all",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { period } = req.body;
      if (!period) throw new ValidationError("period is required in body (e.g. 2026-Q1)");
      const result = await meService.calculateAll(orgId, period);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /manager-effectiveness/calculate/:managerId — Calculate/recalculate score (HR)
router.post(
  "/calculate/:managerId",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const managerId = parseInt(req.params.managerId as string);
      const { period } = req.body;
      if (isNaN(managerId)) throw new ValidationError("managerId must be a number");
      if (!period) throw new ValidationError("period is required in body (e.g. 2026-Q1)");
      const result = await meService.calculateScore(orgId, managerId, period);
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /manager-effectiveness/:managerId — Manager detail
router.get("/:managerId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const managerId = parseInt(req.params.managerId as string);
    const period = req.query.period as string;
    if (isNaN(managerId)) throw new ValidationError("managerId must be a number");
    if (!period) throw new ValidationError("period query parameter is required (e.g. 2026-Q1)");
    const result = await meService.getManagerDetail(orgId, managerId, period);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

export { router as managerEffectivenessRoutes };
