// ============================================================================
// AI SUMMARY ROUTES
// GET review summary, employee summary, team summary.
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import { authenticate, authorize } from "../middleware/auth.middleware";
import * as aiSummaryService from "../../services/ai-summary/ai-summary.service";
import * as reviewService from "../../services/review/review.service";
import * as reviewCycleService from "../../services/review/review-cycle.service";
import { isAdministrativeRole } from "../../security/roles";
import { sendSuccess } from "../../utils/response";
import { ValidationError, ForbiddenError } from "../../utils/errors";
import { ReviewCycleStatus, ReviewType } from "@emp-performance/shared";

const router = Router();
router.use(authenticate);

function isSummaryAdministrator(actor: Request["actor"]): boolean {
  if (!actor) return false;
  return isAdministrativeRole(actor.role) || actor.roles.some(isAdministrativeRole);
}

function requestedRegeneration(req: Request): boolean {
  return req.query.regenerate === "1" || req.query.regenerate === "true";
}

function assertCanRegenerate(req: Request): boolean {
  const regenerate = requestedRegeneration(req);
  if (regenerate && !isSummaryAdministrator(req.actor)) {
    throw new ForbiddenError("Only administrators may regenerate AI summaries");
  }
  return regenerate;
}

// GET /ai-summary/review/:reviewId — Generate/get review summary
// Access and release rules are evaluated before summary generation/cache access.
export async function getReviewSummary(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const actor = req.actor!;
    const orgId = actor.organizationId;
    const { reviewId } = req.params;
    if (!reviewId) throw new ValidationError("reviewId is required");

    // Authorize against the review and its release state before the AI summary
    // service can read or populate its cache.
    const review = await reviewService.getReview(orgId, reviewId as string, actor);
    const regenerate = assertCanRegenerate(req);
    const isAssignedPeerReviewer =
      !isSummaryAdministrator(actor) &&
      review.type === ReviewType.PEER &&
      review.reviewer_id === actor.userId &&
      review.employee_id !== actor.userId;
    const result = await aiSummaryService.generateReviewSummary(
      orgId,
      reviewId as string,
      regenerate,
      { includeEmployeeContext: !isAssignedPeerReviewer },
    );

    const isSubject =
      !isAdministrativeRole(actor.role) &&
      review.employee_id === actor.userId &&
      review.reviewer_id !== actor.userId;
    const response = isSubject && review.type === ReviewType.PEER
      ? { ...result, reviewer_id: null }
      : result;

    sendSuccess(res, response);
  } catch (err) {
    next(err);
  }
}

router.get("/review/:reviewId", getReviewSummary);

// GET /ai-summary/employee/:userId — Employee performance summary
// Employees receive their own result only after release; administrators retain
// in-cycle oversight access.
export async function getEmployeeSummary(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const actor = req.actor!;
    const orgId = actor.organizationId;
    const userId = parseInt(req.params.userId as string);
    const cycleId = req.query.cycleId as string;
    if (isNaN(userId)) throw new ValidationError("userId must be a number");
    if (!cycleId) throw new ValidationError("cycleId query parameter is required");

    const isAdmin = isSummaryAdministrator(actor);
    const isSubject = actor.userId === userId;
    if (!isAdmin && !isSubject) {
      throw new ForbiddenError("You may only view your own performance summary");
    }

    if (!isAdmin) {
      const cycle = await reviewCycleService.getCycle(orgId, cycleId);
      if (cycle.status !== ReviewCycleStatus.COMPLETED) {
        throw new ForbiddenError("Your performance summary is available after the review cycle is completed");
      }
    }

    const regenerate = assertCanRegenerate(req);
    const result = await aiSummaryService.generateEmployeeSummary(orgId, userId, cycleId, regenerate);
    const response = !isAdmin && isSubject
      ? {
          ...result,
          reviews: {
            ...result.reviews,
            peer_reviews: result.reviews.peer_reviews.map((summary) => ({
              ...summary,
              reviewer_id: null,
            })),
          },
        }
      : result;

    sendSuccess(res, response);
  } catch (err) {
    next(err);
  }
}

router.get("/employee/:userId", getEmployeeSummary);

// GET /ai-summary/team/:managerId — Team summary for manager
router.get(
  "/team/:managerId",
  authorize("hr_admin", "hr_manager", "org_admin"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user!.empcloudOrgId;
      const managerId = parseInt(req.params.managerId as string);
      const cycleId = req.query.cycleId as string;
      if (isNaN(managerId)) throw new ValidationError("managerId must be a number");
      if (!cycleId) throw new ValidationError("cycleId query parameter is required");
      const regenerate = assertCanRegenerate(req);
      const result = await aiSummaryService.generateTeamSummary(orgId, managerId, cycleId, regenerate);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  },
);

export { router as aiSummaryRoutes };
