// ============================================================================
// PEER REVIEW ROUTES
// POST nominate, GET nominations, PUT approve/decline.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as peerReviewService from "../../services/peer-review/peer-review.service";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import { nominatePeerSchema, submitPeerReviewSchema } from "@emp-performance/shared";

const router = Router();
router.use(authenticate);

// POST /peer-reviews/nominate
router.post("/nominate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    // Accept both the canonical {cycle_id, employee_id, nominee_id} shape and
    // the legacy {cycleId, employeeId, peerId} aliases from the client.
    const raw = {
      cycle_id: req.body.cycle_id ?? req.body.cycleId,
      employee_id: Number(req.body.employee_id ?? req.body.employeeId),
      nominee_id: Number(req.body.nominee_id ?? req.body.peerId),
    };
    const data = nominatePeerSchema.parse(raw);
    const result = await peerReviewService.nominate(
      orgId,
      data.cycle_id,
      data.employee_id,
      data.nominee_id,
      req.actor!,
    );
    sendSuccess(res, result, 201);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid nomination data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// GET /peer-reviews/nominations?cycleId=xxx
router.get("/nominations", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const cycleId = req.query.cycleId as string;
    if (!cycleId) throw new ValidationError("cycleId query parameter is required");
    const result = await peerReviewService.listNominations(
      orgId,
      cycleId,
      req.actor!,
      {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt((req.query.perPage as string) ?? (req.query.limit as string)) || 50,
        employeeId: req.query.employeeId ? parseInt(req.query.employeeId as string) : undefined,
        nomineeId: req.query.nomineeId ? parseInt(req.query.nomineeId as string) : undefined,
        status: req.query.status as string | undefined,
      },
    );
    // Standardize on the paginated envelope used by every other list endpoint
    // so the client unwraps it the same way (#R10).
    sendPaginated(res, result.data, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
});

// PUT /peer-reviews/:id/approve
router.put(
  "/:id/approve",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await peerReviewService.approveNomination(
        orgId,
        req.params.id as string,
        req.actor!,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// PUT /peer-reviews/:id/decline
router.put(
  "/:id/decline",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const result = await peerReviewService.declineNomination(
        orgId,
        req.params.id as string,
        req.actor!,
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /peer-reviews/responses?cycleId=&reviewerEmployeeId=&status=
// Lists raw responses for HR/admin oversight; employee callers are always
// forced to their own reviewer identity by the service.
router.get("/responses", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await peerReviewService.listResponses(
      orgId,
      req.actor!,
      {
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt((req.query.perPage as string) ?? (req.query.limit as string)) || 50,
        cycleId: req.query.cycleId as string | undefined,
        reviewerEmployeeId: req.query.reviewerEmployeeId
          ? parseInt(req.query.reviewerEmployeeId as string)
          : undefined,
        revieweeEmployeeId: req.query.revieweeEmployeeId
          ? parseInt(req.query.revieweeEmployeeId as string)
          : undefined,
        status: req.query.status as string | undefined,
      },
    );
    sendPaginated(res, result.data, result.total, result.page, result.limit);
  } catch (err) {
    next(err);
  }
});

// GET /peer-reviews/:id/response — the reviewer's pending/submitted response for a nomination.
router.get("/:id/response", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const result = await peerReviewService.getResponse(
      orgId,
      req.params.id as string,
      req.actor!,
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /peer-reviews/:id/submit — the nominated reviewer submits their review.
router.post("/:id/submit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.user!.empcloudOrgId;
    const data = submitPeerReviewSchema.parse(req.body);
    const result = await peerReviewService.submitPeerReview(
      orgId,
      req.params.id as string,
      req.actor!,
      data,
    );
    sendSuccess(res, result, 201);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid peer review data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

export { router as peerReviewRoutes };
