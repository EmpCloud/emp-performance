// ============================================================================
// PIP ROUTES
// REST endpoints for Performance Improvement Plans.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import {
  createPIPSchema,
  addPIPObjectiveSchema,
  addPIPUpdateSchema,
  closePIPSchema,
  paginationSchema,
  idParamSchema,
} from "@emp-performance/shared";
import * as pipService from "../../services/pip/pip.service";

const router = Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// GET / — list PIPs
// ---------------------------------------------------------------------------
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);

    const result = await pipService.listPIPs(orgId, {
      status: req.query.status as string | undefined,
      employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
      managerId: req.query.managerId ? Number(req.query.managerId) : undefined,
      page: pagination.page,
      perPage: pagination.perPage,
      sort: pagination.sort,
      order: pagination.order,
      search: pagination.search,
    });

    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST / — create PIP (admin/manager)
// ---------------------------------------------------------------------------
router.post(
  "/",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const data = createPIPSchema.parse(req.body);

      const pip = await pipService.createPIP(orgId, req.user!.empcloudUserId, {
        ...data,
        manager_id: req.user!.empcloudUserId,
      });
      return sendSuccess(res, pip, 201);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:id — PIP detail with objectives and updates
// ---------------------------------------------------------------------------
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);

    const pip = await pipService.getPIP(orgId, id);
    return sendSuccess(res, pip);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /:id — update PIP
// ---------------------------------------------------------------------------
router.put(
  "/:id",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);

      const pip = await pipService.updatePIP(orgId, id, req.body);
      return sendSuccess(res, pip);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:id/objectives — add objective
// ---------------------------------------------------------------------------
router.post(
  "/:id/objectives",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);
      const data = addPIPObjectiveSchema.parse(req.body);

      const objective = await pipService.addObjective(orgId, id, data);
      return sendSuccess(res, objective, 201);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PUT /:id/objectives/:objId — update objective status
// ---------------------------------------------------------------------------
router.put(
  "/:id/objectives/:objId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);
      const objId = req.params.objId as string;

      const objective = await pipService.updateObjective(orgId, id, objId, req.body);
      return sendSuccess(res, objective);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:id/updates — add update/check-in
// ---------------------------------------------------------------------------
router.post("/:id/updates", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const data = addPIPUpdateSchema.parse(req.body);

    const update = await pipService.addUpdate(orgId, id, req.user!.empcloudUserId, data);
    return sendSuccess(res, update, 201);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /:id/close — close PIP with outcome
// ---------------------------------------------------------------------------
router.post(
  "/:id/close",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);
      const data = closePIPSchema.parse(req.body);

      if (data.status === "extended") {
        // Use extend flow instead
        if (!data.extended_end_date) {
          return res.status(400).json({
            success: false,
            error: { code: "VALIDATION_ERROR", message: "extended_end_date is required when extending a PIP" },
          });
        }
        const pip = await pipService.extendPIP(orgId, id, data.extended_end_date);
        return sendSuccess(res, pip);
      }

      const pip = await pipService.closePIP(
        orgId,
        id,
        data.status as "completed_success" | "completed_failure" | "cancelled",
        data.outcome_notes,
      );
      return sendSuccess(res, pip);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:id/extend — extend PIP end date
// ---------------------------------------------------------------------------
router.post(
  "/:id/extend",
  authorize("org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);

      const { end_date } = req.body;
      if (!end_date) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "end_date is required" },
        });
      }

      const pip = await pipService.extendPIP(orgId, id, end_date);
      return sendSuccess(res, pip);
    } catch (err) {
      next(err);
    }
  },
);

export { router as pipRoutes };
