import { Router, type NextFunction, type Request, type Response } from "express";
import {
  acknowledgeReviewOutcomeSchema,
  idParamSchema,
  paginationSchema,
  resolveReviewOutcomeAppealSchema,
  reviewOutcomeAppealListQuerySchema,
  submitReviewOutcomeAppealSchema,
} from "@emp-performance/shared";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { sendPaginated, sendSuccess } from "../../utils/response";
import * as outcomeService from "../../services/review/review-outcome.service";

const router = Router();
const APPEAL_GOVERNANCE_ROLES = ["super_admin", "org_admin", "hr_admin"] as const;

router.use(authenticate);

export async function listMyReviewOutcomes(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = paginationSchema.parse(req.query);
    const result = await outcomeService.listMyReviewOutcomes(
      req.user!.empcloudOrgId,
      req.actor!,
      { page: query.page, perPage: query.perPage },
    );
    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (error) {
    next(error);
  }
}

export async function listReviewOutcomeAppeals(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const pageQuery = paginationSchema.parse(req.query);
    const filterQuery = reviewOutcomeAppealListQuerySchema.parse({
      cycleId: req.query.cycleId,
      status: req.query.status,
    });
    const result = await outcomeService.listReviewOutcomeAppeals(
      req.user!.empcloudOrgId,
      req.actor!,
      {
        page: pageQuery.page,
        perPage: pageQuery.perPage,
        ...filterQuery,
      },
    );
    return sendPaginated(res, result.data, result.total, result.page, result.perPage);
  } catch (error) {
    next(error);
  }
}

export async function getReviewOutcome(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const outcome = await outcomeService.getReviewOutcome(
      req.user!.empcloudOrgId,
      id,
      req.actor!,
    );
    return sendSuccess(res, outcome);
  } catch (error) {
    next(error);
  }
}

export async function acknowledgeReviewOutcome(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const input = acknowledgeReviewOutcomeSchema.parse(req.body ?? {});
    const outcome = await outcomeService.acknowledgeReviewOutcome(
      req.user!.empcloudOrgId,
      id,
      req.actor!,
      input.note,
    );
    return sendSuccess(res, outcome, 201);
  } catch (error) {
    next(error);
  }
}

export async function submitReviewOutcomeAppeal(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const input = submitReviewOutcomeAppealSchema.parse(req.body ?? {});
    const outcome = await outcomeService.submitReviewOutcomeAppeal(
      req.user!.empcloudOrgId,
      id,
      req.actor!,
      input.reason,
    );
    return sendSuccess(res, outcome, 201);
  } catch (error) {
    next(error);
  }
}

export async function withdrawReviewOutcomeAppeal(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const outcome = await outcomeService.withdrawReviewOutcomeAppeal(
      req.user!.empcloudOrgId,
      id,
      req.actor!,
    );
    return sendSuccess(res, outcome);
  } catch (error) {
    next(error);
  }
}

export async function startReviewOutcomeAppeal(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const outcome = await outcomeService.startReviewOutcomeAppeal(
      req.user!.empcloudOrgId,
      id,
      req.actor!,
    );
    return sendSuccess(res, outcome);
  } catch (error) {
    next(error);
  }
}

export async function resolveReviewOutcomeAppeal(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const input = resolveReviewOutcomeAppealSchema.parse(req.body ?? {});
    const outcome = await outcomeService.resolveReviewOutcomeAppeal(
      req.user!.empcloudOrgId,
      id,
      req.actor!,
      input,
    );
    return sendSuccess(res, outcome);
  } catch (error) {
    next(error);
  }
}

router.get("/mine", listMyReviewOutcomes);
router.get(
  "/appeals",
  authorize(...APPEAL_GOVERNANCE_ROLES),
  listReviewOutcomeAppeals,
);
router.get("/:id", getReviewOutcome);
router.post("/:id/acknowledge", acknowledgeReviewOutcome);
router.post("/:id/appeals", submitReviewOutcomeAppeal);
router.post("/:id/appeals/withdraw", withdrawReviewOutcomeAppeal);
router.post(
  "/:id/appeals/start-review",
  authorize(...APPEAL_GOVERNANCE_ROLES),
  startReviewOutcomeAppeal,
);
router.post(
  "/:id/appeals/resolve",
  authorize(...APPEAL_GOVERNANCE_ROLES),
  resolveReviewOutcomeAppeal,
);

export { router as reviewOutcomeRoutes };
