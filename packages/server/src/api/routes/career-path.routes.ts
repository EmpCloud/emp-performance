// ============================================================================
// CAREER PATH ROUTES
// CRUD for paths, levels, and employee track assignments.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as careerPathService from "../../services/career/career-path.service";
import { sendSuccess } from "../../utils/response";
import { ValidationError } from "../../utils/errors";

const router = Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// Career Paths
// ---------------------------------------------------------------------------

// GET /career-paths
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await careerPathService.listPaths(orgId, { page, limit });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /career-paths/:id
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await careerPathService.getPath(orgId, req.params.id);
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /career-paths
router.post(
  "/",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { name, description, department } = req.body;
      if (!name) throw new ValidationError("Name is required");
      const result = await careerPathService.createPath(orgId, {
        name,
        description,
        department,
        created_by: req.user!.empcloudUserId,
      });
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /career-paths/:id
router.put(
  "/:id",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await careerPathService.updatePath(orgId, req.params.id, req.body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /career-paths/:id
router.delete(
  "/:id",
  authorize("hr_admin", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      await careerPathService.deletePath(orgId, req.params.id);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Career Path Levels
// ---------------------------------------------------------------------------

// POST /career-paths/:pathId/levels
router.post(
  "/:pathId/levels",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { title, level, description, requirements, min_years_experience } = req.body;
      if (!title || level === undefined) throw new ValidationError("Title and level are required");
      const result = await careerPathService.addLevel(orgId, req.params.pathId, {
        title,
        level,
        description,
        requirements,
        min_years_experience,
      });
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /career-paths/levels/:levelId
router.put(
  "/levels/:levelId",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await careerPathService.updateLevel(orgId, req.params.levelId, req.body);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /career-paths/levels/:levelId
router.delete(
  "/levels/:levelId",
  authorize("hr_admin", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      await careerPathService.removeLevel(orgId, req.params.levelId);
      sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Employee Career Tracks
// ---------------------------------------------------------------------------

// POST /career-paths/tracks/assign
router.post(
  "/tracks/assign",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { employeeId, pathId, currentLevelId, targetLevelId } = req.body;
      if (!employeeId || !pathId || !currentLevelId) {
        throw new ValidationError("employeeId, pathId, and currentLevelId are required");
      }
      const result = await careerPathService.assignTrack(
        orgId,
        employeeId,
        pathId,
        currentLevelId,
        targetLevelId,
      );
      sendSuccess(res, result, 201);
    } catch (err) {
      next(err);
    }
  },
);

// GET /career-paths/tracks/employee/:employeeId
router.get(
  "/tracks/employee/:employeeId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await careerPathService.getEmployeeTrack(
        orgId,
        parseInt(req.params.employeeId),
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as careerPathRoutes };
