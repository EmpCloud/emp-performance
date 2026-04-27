import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import {
  createReviewCycleSchema,
  addParticipantsSchema,
  idParamSchema,
  paginationSchema,
} from "@emp-performance/shared";
import * as cycleService from "../../services/review/review-cycle.service";

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET / — list cycles (paginated, filterable by status/type)
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = paginationSchema.parse(req.query);
    const orgId = req.user!.empcloudOrgId;
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;

    const result = await cycleService.listCycles(orgId, {
      page: query.page,
      perPage: query.perPage,
      status,
      type,
      search: query.search,
      sort: query.sort,
      order: query.order,
    });

    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// POST / — create cycle (admin only)
router.post(
  "/",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createReviewCycleSchema.parse(req.body);
      const orgId = req.user!.empcloudOrgId;
      const cycle = await cycleService.createCycle(orgId, data, req.user!.empcloudUserId);
      return sendSuccess(res, cycle, 201);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid cycle data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// GET /:id — detail with participant stats
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;
    const cycle = await cycleService.getCycle(orgId, id);
    return sendSuccess(res, cycle);
  } catch (err) {
    next(err);
  }
});

// PUT /:id — update cycle
router.put(
  "/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = createReviewCycleSchema.partial().parse(req.body);
      const orgId = req.user!.empcloudOrgId;
      const cycle = await cycleService.updateCycle(orgId, id, data);
      return sendSuccess(res, cycle);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid cycle data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// DELETE /:id — delete a draft cycle
router.delete(
  "/:id",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const orgId = req.user!.empcloudOrgId;
      await cycleService.deleteCycle(orgId, id);
      return sendSuccess(res, { message: "Cycle deleted" });
    } catch (err) {
      next(err);
    }
  },
);

// POST /:id/launch — launch cycle
router.post(
  "/:id/launch",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const orgId = req.user!.empcloudOrgId;
      const cycle = await cycleService.launchCycle(orgId, id);
      return sendSuccess(res, cycle);
    } catch (err) {
      next(err);
    }
  },
);

// POST /:id/close — close cycle
router.post(
  "/:id/close",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const orgId = req.user!.empcloudOrgId;
      const cycle = await cycleService.closeCycle(orgId, id);
      return sendSuccess(res, cycle);
    } catch (err) {
      next(err);
    }
  },
);

// GET /:id/participants — list participants
router.get("/:id/participants", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;
    const participants = await cycleService.listParticipants(orgId, id);
    return sendSuccess(res, participants);
  } catch (err) {
    next(err);
  }
});

// POST /:id/participants — add participants (bulk)
router.post(
  "/:id/participants",
  authorize("super_admin", "org_admin", "hr_admin", "hr_manager"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const data = addParticipantsSchema.parse(req.body);
      const orgId = req.user!.empcloudOrgId;
      const participants = await cycleService.addParticipants(orgId, id, data.participants);
      return sendSuccess(res, participants, 201);
    } catch (err: any) {
      if (err.name === "ZodError") {
        return next(new ValidationError("Invalid participant data", err.flatten().fieldErrors));
      }
      next(err);
    }
  },
);

// DELETE /:id/participants/:participantId — remove participant
router.delete(
  "/:id/participants/:participantId",
  authorize("super_admin", "org_admin", "hr_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const participantId = req.params.participantId as string;
      const orgId = req.user!.empcloudOrgId;
      await cycleService.removeParticipant(orgId, id, participantId);
      return sendSuccess(res, { message: "Participant removed" });
    } catch (err) {
      next(err);
    }
  },
);

// GET /:id/ratings-distribution — bell curve data
router.get("/:id/ratings-distribution", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;
    const distribution = await cycleService.getRatingsDistribution(orgId, id);
    return sendSuccess(res, distribution);
  } catch (err) {
    next(err);
  }
});

export { router as reviewCycleRoutes };
