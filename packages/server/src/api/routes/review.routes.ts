import { Router, Request, Response, NextFunction } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { sendSuccess, sendPaginated } from "../../utils/response";
import { ValidationError } from "../../utils/errors";
import {
  createReviewSchema,
  submitReviewSchema,
  rateCompetencySchema,
  idParamSchema,
  paginationSchema,
} from "@emp-performance/shared";
import * as reviewService from "../../services/review/review.service";

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET / — list reviews (filter by cycle, reviewer, reviewee, type, status)
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = paginationSchema.parse(req.query);
    const orgId = req.user!.empcloudOrgId;

    const result = await reviewService.listReviews(orgId, {
      page: query.page,
      perPage: query.perPage,
      cycle_id: req.query.cycle_id as string | undefined,
      reviewer_id: req.query.reviewer_id ? Number(req.query.reviewer_id) : undefined,
      employee_id: req.query.employee_id ? Number(req.query.employee_id) : undefined,
      type: req.query.type as string | undefined,
      status: req.query.status as string | undefined,
    });

    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (err) {
    next(err);
  }
});

// GET /:id — review detail with competency ratings
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;
    const review = await reviewService.getReview(orgId, id);
    return sendSuccess(res, review);
  } catch (err) {
    next(err);
  }
});

// PUT /:id — save draft
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const orgId = req.user!.empcloudOrgId;
    const data = submitReviewSchema.partial().parse(req.body);
    const review = await reviewService.saveDraft(orgId, id, data);
    return sendSuccess(res, review);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid review data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// POST /:id/submit — submit review
router.post("/:id/submit", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = submitReviewSchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;
    const review = await reviewService.submitReview(orgId, id, data);
    return sendSuccess(res, review);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid review data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

// POST /:id/competency-ratings — rate a competency
router.post("/:id/competency-ratings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = rateCompetencySchema.parse(req.body);
    const orgId = req.user!.empcloudOrgId;
    const rating = await reviewService.rateCompetency(
      orgId,
      id,
      data.competency_id,
      data.rating,
      data.comments,
    );
    return sendSuccess(res, rating, 201);
  } catch (err: any) {
    if (err.name === "ZodError") {
      return next(new ValidationError("Invalid rating data", err.flatten().fieldErrors));
    }
    next(err);
  }
});

export { router as reviewRoutes };
