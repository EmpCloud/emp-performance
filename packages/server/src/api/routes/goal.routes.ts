// ============================================================================
// GOAL ROUTES
// REST endpoints for goals, key results, and check-ins.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated, sendError } from "../../utils/response";
import {
  createGoalSchema,
  addKeyResultSchema,
  checkInSchema,
  paginationSchema,
  idParamSchema,
} from "@emp-performance/shared";
import * as goalService from "../../services/goal/goal.service";

const router = Router();
router.use(authenticate);

// ---------------------------------------------------------------------------
// GET / — list goals (paginated, filterable)
// ---------------------------------------------------------------------------
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const pagination = paginationSchema.parse(req.query);

    const result = await goalService.listGoals(orgId, {
      employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
      cycleId: req.query.cycleId as string | undefined,
      category: req.query.category as string | undefined,
      status: req.query.status as string | undefined,
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
// POST / — create goal
// ---------------------------------------------------------------------------
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = createGoalSchema.parse(req.body);

    const goal = await goalService.createGoal(orgId, req.user!.empcloudUserId, data);
    return sendSuccess(res, goal, 201);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id — goal detail with KRs and check-ins
// ---------------------------------------------------------------------------
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);

    const goal = await goalService.getGoal(orgId, id);
    return sendSuccess(res, goal);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /:id — update goal
// ---------------------------------------------------------------------------
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);

    const goal = await goalService.updateGoal(orgId, id, req.body);
    return sendSuccess(res, goal);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id — soft delete
// ---------------------------------------------------------------------------
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);

    await goalService.deleteGoal(orgId, id);
    return sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /:id/key-results — add key result
// ---------------------------------------------------------------------------
router.post("/:id/key-results", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const data = addKeyResultSchema.parse(req.body);

    const kr = await goalService.addKeyResult(orgId, id, data);
    return sendSuccess(res, kr, 201);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /:id/key-results/:krId — update key result
// ---------------------------------------------------------------------------
router.put("/:id/key-results/:krId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const krId = req.params.krId;

    const kr = await goalService.updateKeyResult(orgId, id, krId, req.body);
    return sendSuccess(res, kr);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id/key-results/:krId — delete key result
// ---------------------------------------------------------------------------
router.delete(
  "/:id/key-results/:krId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const { id } = idParamSchema.parse(req.params);
      const krId = req.params.krId;

      await goalService.deleteKeyResult(orgId, id, krId);
      return sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:id/check-in — log check-in
// ---------------------------------------------------------------------------
router.post("/:id/check-in", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);
    const data = checkInSchema.parse(req.body);

    const checkIn = await goalService.checkIn(orgId, id, req.user!.empcloudUserId, {
      ...data,
      key_result_id: req.body.key_result_id,
      current_value: req.body.current_value,
    });
    return sendSuccess(res, checkIn, 201);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /:id/check-ins — list check-ins
// ---------------------------------------------------------------------------
router.get("/:id/check-ins", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const { id } = idParamSchema.parse(req.params);

    const checkIns = await goalService.getCheckIns(orgId, id);
    return sendSuccess(res, checkIns);
  } catch (err) {
    next(err);
  }
});

export { router as goalRoutes };
