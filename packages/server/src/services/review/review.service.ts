import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import type { IDataContext } from "../../db/adapters/interface";
import { findUserById } from "../../db/empcloud";
import { NotFoundError, ValidationError, ConflictError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { ActorContext } from "../../security/actor-context";
import {
  assertReviewAccess,
  canAccessReview,
  canReadAllReviews,
} from "../../security/policies/review.policy";
import type {
  Review,
  ReviewView,
  ReviewCompetencyRating,
  ReviewCycle,
  ReviewCycleParticipant,
  Competency,
  CompetencyFramework,
} from "@emp-performance/shared";

// Columns the review list may be sorted by. Anything else falls back to
// created_at so the client cannot inject arbitrary SQL via the sort param.
const REVIEW_SORTABLE_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "type",
  "status",
  "overall_rating",
  "submitted_at",
]);

async function assertActiveOrganizationUser(
  orgId: number,
  userId: number,
  participantLabel: "Employee" | "Reviewer",
): Promise<void> {
  const user = await findUserById(userId);
  if (!user || user.organization_id !== orgId || user.status !== 1) {
    throw new ValidationError(
      `${participantLabel} must be an active user in this organization`,
    );
  }
}

type ReviewWithCycle = {
  review: Review;
  cycle: ReviewCycle;
};

const CONTENT_EDITABLE_CYCLE_STATUSES = new Set<string>([
  "active",
  "in_review",
]);

const ADMIN_EDITABLE_CYCLE_STATUSES = new Set<string>([
  "draft",
  "active",
  "in_review",
]);

async function loadReviewWithCycle(
  orgId: number,
  reviewId: string,
  context: IDataContext = getDB(),
): Promise<ReviewWithCycle> {
  const review = await context.findOne<Review>("reviews", {
    id: reviewId,
    organization_id: orgId,
  });
  if (!review) throw new NotFoundError("Review", reviewId);

  const cycle = await context.findOne<ReviewCycle>("review_cycles", {
    id: review.cycle_id,
    organization_id: orgId,
  });
  // Conceal corrupt or cross-tenant parent references as a missing review.
  if (!cycle) throw new NotFoundError("Review", reviewId);

  return { review, cycle };
}

async function lockCycle(
  context: IDataContext,
  orgId: number,
  cycleId: string,
): Promise<void> {
  await context.raw(
    "SELECT id FROM review_cycles WHERE id = ? AND organization_id = ? FOR UPDATE",
    [cycleId, orgId],
  );
}

async function loadReviewWithLockedCycle(
  context: IDataContext,
  orgId: number,
  reviewId: string,
): Promise<ReviewWithCycle> {
  // Resolve and lock the parent cycle in one locking statement. It must be the
  // first database read in the transaction so MySQL's repeatable-read snapshot
  // cannot retain a cycle status observed before a concurrent transition.
  await context.raw(
    `SELECT rc.id
     FROM review_cycles rc
     INNER JOIN reviews r ON r.cycle_id = rc.id
     WHERE r.id = ? AND r.organization_id = ? AND rc.organization_id = ?
     FOR UPDATE`,
    [reviewId, orgId, orgId],
  );
  return loadReviewWithCycle(orgId, reviewId, context);
}

function assertCycleAllowsContentChanges(cycle: ReviewCycle): void {
  if (!CONTENT_EDITABLE_CYCLE_STATUSES.has(cycle.status)) {
    throw new ValidationError(
      `Reviews can only be edited while the cycle is active or in review (current: ${cycle.status})`,
    );
  }
}

function assertCycleAllowsAdministrativeChanges(cycle: ReviewCycle): void {
  if (!ADMIN_EDITABLE_CYCLE_STATUSES.has(cycle.status)) {
    throw new ValidationError(
      `Review assignments cannot be changed while the cycle is ${cycle.status}`,
    );
  }
}

async function assertValidAssignment(
  orgId: number,
  cycle: ReviewCycle,
  employeeId: number,
  reviewerId: number,
  type: string,
  context: IDataContext = getDB(),
): Promise<void> {
  const participant = await context.findOne<ReviewCycleParticipant>("review_cycle_participants", {
    cycle_id: cycle.id,
    employee_id: employeeId,
  });
  if (!participant) {
    throw new ValidationError("The employee is not a participant in this review cycle");
  }

  if (type === "self") {
    if (reviewerId !== employeeId) {
      throw new ValidationError("A self review must be assigned to the participant");
    }
    return;
  }

  if (type === "manager") {
    if (participant.manager_id === null || participant.manager_id !== reviewerId) {
      throw new ValidationError("A manager review must be assigned to the participant's cycle manager");
    }
    return;
  }

  if (type === "peer") {
    const nomination = await context.findOne<any>("peer_review_nominations", {
      cycle_id: cycle.id,
      employee_id: employeeId,
      nominee_id: reviewerId,
      status: "approved",
    });
    if (!nomination) {
      throw new ValidationError("A peer review requires an approved peer nomination");
    }
    return;
  }

  throw new ValidationError("Unsupported review type");
}

async function loadOwnedFramework(
  orgId: number,
  frameworkId: string,
  context: IDataContext = getDB(),
): Promise<CompetencyFramework> {
  const framework = await context.findOne<CompetencyFramework>("competency_frameworks", {
    id: frameworkId,
    organization_id: orgId,
    is_active: true,
    deleted_at: null,
  });
  if (!framework) throw new NotFoundError("CompetencyFramework", frameworkId);
  return framework;
}

async function loadCycleCompetency(
  orgId: number,
  cycle: ReviewCycle,
  competencyId: string,
  context: IDataContext = getDB(),
): Promise<Competency> {
  if (!cycle.framework_id) throw new NotFoundError("Competency", competencyId);
  await loadOwnedFramework(orgId, cycle.framework_id, context);
  const competency = await context.findOne<Competency>("competencies", {
    id: competencyId,
    framework_id: cycle.framework_id,
    deleted_at: null,
  });
  if (!competency) throw new NotFoundError("Competency", competencyId);
  return competency;
}

function toReviewView(review: Review, actor: ActorContext): ReviewView {
  const hidePeerIdentity =
    review.type === "peer" &&
    actor.userId === review.employee_id &&
    actor.userId !== review.reviewer_id &&
    !canReadAllReviews(actor);

  return {
    ...review,
    reviewer_id: hidePeerIdentity ? null : review.reviewer_id,
    reviewer_anonymous: hidePeerIdentity,
  };
}

function normalizeRawRows<T>(result: any): T[] {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) return result[0] as T[];
    // SQLite-style adapters may return the rows directly.
    if (result.length === 0 || typeof result[0] === "object") return result as T[];
  }
  if (result && Array.isArray(result.rows)) return result.rows as T[];
  return [];
}

// ---------------------------------------------------------------------------
// Create review
// ---------------------------------------------------------------------------

export async function createReview(
  orgId: number,
  data: {
    cycle_id: string;
    employee_id: number;
    reviewer_id: number;
    type: string;
  },
  actor: ActorContext,
): Promise<Review> {
  const db = getDB();

  assertReviewAccess(actor, "create", {
    organizationId: orgId,
    employeeId: data.employee_id,
    reviewerId: data.reviewer_id,
  });

  return db.transaction(async (trx) => {
    await lockCycle(trx, orgId, data.cycle_id);
    const cycle = await trx.findOne<ReviewCycle>("review_cycles", {
      id: data.cycle_id,
      organization_id: orgId,
    });
    if (!cycle) throw new NotFoundError("ReviewCycle", data.cycle_id);
    assertCycleAllowsContentChanges(cycle);

    await Promise.all([
      assertActiveOrganizationUser(orgId, data.employee_id, "Employee"),
      assertActiveOrganizationUser(orgId, data.reviewer_id, "Reviewer"),
    ]);
    await assertValidAssignment(
      orgId,
      cycle,
      data.employee_id,
      data.reviewer_id,
      data.type,
      trx,
    );

    // Reject duplicates on (cycle, employee, reviewer, type) so a participant
    // never ends up with two identical review rows (#R10).
    const duplicate = await trx.findOne<Review>("reviews", {
      organization_id: orgId,
      cycle_id: data.cycle_id,
      employee_id: data.employee_id,
      reviewer_id: data.reviewer_id,
      type: data.type,
    });
    if (duplicate) {
      throw new ConflictError(
        "A review of this type already exists for this reviewer and employee in this cycle",
      );
    }

    const record: Record<string, any> = {
      id: uuidv4(),
      organization_id: orgId,
      cycle_id: data.cycle_id,
      employee_id: data.employee_id,
      reviewer_id: data.reviewer_id,
      type: data.type,
      status: "pending",
      overall_rating: null,
      summary: null,
      strengths: null,
      improvements: null,
      submitted_at: null,
    };

    return trx.create<Review>("reviews", record as any);
  });
}

// ---------------------------------------------------------------------------
// Get review (with competency ratings)
// ---------------------------------------------------------------------------

export type ReviewCompetencyRatingWithName = ReviewCompetencyRating & {
  competency_name: string | null;
};

export async function getReview(
  orgId: number,
  id: string,
  actor: ActorContext,
): Promise<ReviewView & { competency_ratings: ReviewCompetencyRatingWithName[] }> {
  const db = getDB();
  const { review, cycle } = await loadReviewWithCycle(orgId, id);

  if (
    !canAccessReview(actor, "read", {
      organizationId: review.organization_id,
      employeeId: review.employee_id,
      reviewerId: review.reviewer_id,
      type: review.type,
      reviewStatus: review.status,
      cycleStatus: cycle.status,
    })
  ) {
    throw new NotFoundError("Review", id);
  }

  const ratings = await db.findMany<ReviewCompetencyRating>("review_competency_ratings", {
    filters: { review_id: id },
    limit: 1000,
  });

  const frameworkIsOwned = cycle.framework_id
    ? Boolean(await db.findOne<CompetencyFramework>("competency_frameworks", {
        id: cycle.framework_id,
        organization_id: orgId,
        deleted_at: null,
      }))
    : false;

  // Resolve names only through the cycle's tenant-owned framework. Legacy
  // rogue rows remain visible for remediation but never disclose foreign names.
  const ratingsWithNames: ReviewCompetencyRatingWithName[] = await Promise.all(
    ratings.data.map(async (r) => {
      const competency = frameworkIsOwned && cycle.framework_id
        ? await db.findOne<Competency>("competencies", {
            id: r.competency_id,
            framework_id: cycle.framework_id,
            deleted_at: null,
          })
        : null;
      return { ...r, competency_name: competency?.name ?? null };
    }),
  );

  return { ...toReviewView(review, actor), competency_ratings: ratingsWithNames };
}

// ---------------------------------------------------------------------------
// List reviews
// ---------------------------------------------------------------------------

export async function listReviews(
  orgId: number,
  params: {
    page?: number;
    perPage?: number;
    cycle_id?: string;
    reviewer_id?: number;
    employee_id?: number;
    type?: string;
    status?: string;
    search?: string;
    sort?: string;
    order?: "asc" | "desc";
  },
  actor: ActorContext,
): Promise<{ data: ReviewView[]; total: number; page: number; perPage: number }> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  if (actor.organizationId !== orgId) {
    throw new NotFoundError("Organization", String(orgId));
  }

  // A subject could otherwise probe guessed reviewer IDs and infer the author
  // of an anonymized peer review from list totals. Non-admin reviewer filters
  // are therefore limited to the authenticated reviewer identity.
  if (
    !canReadAllReviews(actor) &&
    params.reviewer_id !== undefined &&
    params.reviewer_id !== actor.userId
  ) {
    return { data: [], total: 0, page, perPage };
  }

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.cycle_id) filters.cycle_id = params.cycle_id;
  if (params.reviewer_id) filters.reviewer_id = params.reviewer_id;
  if (params.employee_id) filters.employee_id = params.employee_id;
  if (params.type) filters.type = params.type;
  if (params.status) filters.status = params.status;

  const sortField = REVIEW_SORTABLE_COLUMNS.has(params.sort ?? "")
    ? (params.sort as string)
    : "created_at";
  const sortOrder = params.order ?? "desc";
  const restrictToUserId = canReadAllReviews(actor) ? undefined : actor.userId;

  const search = (params.search ?? "").trim();
  if (search) {
    // Free-text search over summary/strengths/improvements; the findMany helper
    // has no LIKE support so drop to a parameterized raw query (#R7).
    const offset = (page - 1) * perPage;
    const where: string[] = ["organization_id = ?"];
    const args: any[] = [orgId];
    if (params.cycle_id) { where.push("cycle_id = ?"); args.push(params.cycle_id); }
    if (params.reviewer_id) { where.push("reviewer_id = ?"); args.push(params.reviewer_id); }
    if (params.employee_id) { where.push("employee_id = ?"); args.push(params.employee_id); }
    if (params.type) { where.push("type = ?"); args.push(params.type); }
    if (params.status) { where.push("status = ?"); args.push(params.status); }
    if (restrictToUserId !== undefined) {
      where.push(
        "(reviewer_id = ? OR (employee_id = ? AND status = 'submitted' AND EXISTS (SELECT 1 FROM review_cycles rc WHERE rc.id = reviews.cycle_id AND rc.organization_id = reviews.organization_id AND rc.status = 'completed')))",
      );
      args.push(restrictToUserId, restrictToUserId);
    }
    where.push("(summary LIKE ? OR strengths LIKE ? OR improvements LIKE ?)");
    const term = `%${search}%`;
    args.push(term, term, term);

    const orderDir = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const rowsRes = await db.raw<any>(
      `SELECT * FROM reviews WHERE ${where.join(" AND ")} ORDER BY ${sortField} ${orderDir} LIMIT ? OFFSET ?`,
      [...args, perPage, offset],
    );
    const totalRes = await db.raw<any>(
      `SELECT COUNT(*) AS c FROM reviews WHERE ${where.join(" AND ")}`,
      args,
    );
    const rows = normalizeRawRows<Review>(rowsRes);
    const totalRows = normalizeRawRows<{ c: string | number }>(totalRes);
    const total = Number(totalRows?.[0]?.c ?? 0);
    return { data: rows.map((review) => toReviewView(review, actor)), total, page, perPage };
  }

  // Non-admin callers need the (reviewer OR subject) scope, which findMany's
  // equality filters can't express — use a raw query for that case.
  if (restrictToUserId !== undefined) {
    const offset = (page - 1) * perPage;
    const where: string[] = ["organization_id = ?"];
    const args: any[] = [orgId];
    if (params.cycle_id) { where.push("cycle_id = ?"); args.push(params.cycle_id); }
    if (params.reviewer_id) { where.push("reviewer_id = ?"); args.push(params.reviewer_id); }
    if (params.employee_id) { where.push("employee_id = ?"); args.push(params.employee_id); }
    if (params.type) { where.push("type = ?"); args.push(params.type); }
    if (params.status) { where.push("status = ?"); args.push(params.status); }
    where.push(
      "(reviewer_id = ? OR (employee_id = ? AND status = 'submitted' AND EXISTS (SELECT 1 FROM review_cycles rc WHERE rc.id = reviews.cycle_id AND rc.organization_id = reviews.organization_id AND rc.status = 'completed')))",
    );
    args.push(restrictToUserId, restrictToUserId);

    const orderDir = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const rowsRes = await db.raw<any>(
      `SELECT * FROM reviews WHERE ${where.join(" AND ")} ORDER BY ${sortField} ${orderDir} LIMIT ? OFFSET ?`,
      [...args, perPage, offset],
    );
    const totalRes = await db.raw<any>(
      `SELECT COUNT(*) AS c FROM reviews WHERE ${where.join(" AND ")}`,
      args,
    );
    const rows = normalizeRawRows<Review>(rowsRes);
    const totalRows = normalizeRawRows<{ c: string | number }>(totalRes);
    return {
      data: rows.map((review) => toReviewView(review, actor)),
      total: Number(totalRows?.[0]?.c ?? 0),
      page,
      perPage,
    };
  }

  const result = await db.findMany<Review>("reviews", {
    page,
    limit: perPage,
    filters,
    sort: { field: sortField, order: sortOrder },
  });

  return {
    data: result.data.map((review) => toReviewView(review, actor)),
    total: result.total,
    page,
    perPage,
  };
}

// ---------------------------------------------------------------------------
// Delete / reassign
// ---------------------------------------------------------------------------

// Hard-delete a review (and its competency ratings via FK cascade). Submitted
// reviews are protected so completed history is never silently dropped (#R8).
export async function deleteReview(
  orgId: number,
  id: string,
  actor: ActorContext,
): Promise<void> {
  const db = getDB();
  await db.transaction(async (trx) => {
    const { review, cycle } = await loadReviewWithLockedCycle(trx, orgId, id);
    assertReviewAccess(actor, "delete", {
      organizationId: review.organization_id,
      employeeId: review.employee_id,
      reviewerId: review.reviewer_id,
    });
    if (review.status === "submitted") {
      throw new ValidationError("Cannot delete a submitted review");
    }
    assertCycleAllowsAdministrativeChanges(cycle);
    await trx.delete("reviews", id);
  });
}

// Reassign an unsubmitted review to a different reviewer (e.g. when the
// original reviewer leaves). Guards against creating a duplicate of an existing
// (cycle, employee, reviewer, type) tuple (#R8).
export async function reassignReviewer(
  orgId: number,
  id: string,
  newReviewerId: number,
  actor: ActorContext,
): Promise<Review> {
  const db = getDB();
  return db.transaction(async (trx) => {
    const { review, cycle } = await loadReviewWithLockedCycle(trx, orgId, id);
    assertReviewAccess(actor, "reassign", {
      organizationId: review.organization_id,
      employeeId: review.employee_id,
      reviewerId: review.reviewer_id,
    });
    if (review.status === "submitted") {
      throw new ValidationError("Cannot reassign a submitted review");
    }
    assertCycleAllowsAdministrativeChanges(cycle);
    if (review.type === "self") {
      throw new ValidationError("A self review cannot be reassigned");
    }
    if (review.reviewer_id === newReviewerId) {
      return review;
    }

    await assertActiveOrganizationUser(orgId, newReviewerId, "Reviewer");
    await assertValidAssignment(
      orgId,
      cycle,
      review.employee_id,
      newReviewerId,
      review.type,
      trx,
    );

    const duplicate = await trx.findOne<Review>("reviews", {
      organization_id: orgId,
      cycle_id: review.cycle_id,
      employee_id: review.employee_id,
      reviewer_id: newReviewerId,
      type: review.type,
    });
    if (duplicate) {
      throw new ConflictError(
        "The target reviewer already has a review of this type for this employee in this cycle",
      );
    }

    return trx.update<Review>("reviews", id, { reviewer_id: newReviewerId } as any);
  });
}

// ---------------------------------------------------------------------------
// Save draft
// ---------------------------------------------------------------------------

export async function saveDraft(
  orgId: number,
  id: string,
  data: {
    overall_rating?: number;
    summary?: string;
    strengths?: string;
    improvements?: string;
  },
  actor: ActorContext,
): Promise<Review> {
  const db = getDB();
  return db.transaction(async (trx) => {
    const { review, cycle } = await loadReviewWithLockedCycle(trx, orgId, id);
    assertReviewAccess(actor, "save_draft", {
      organizationId: review.organization_id,
      employeeId: review.employee_id,
      reviewerId: review.reviewer_id,
    });
    if (review.status === "submitted") {
      throw new ValidationError("Cannot edit a submitted review");
    }
    assertCycleAllowsContentChanges(cycle);

    const updates: Record<string, any> = { status: "draft" };
    if (data.overall_rating !== undefined) updates.overall_rating = data.overall_rating;
    if (data.summary !== undefined) updates.summary = data.summary;
    if (data.strengths !== undefined) updates.strengths = data.strengths;
    if (data.improvements !== undefined) updates.improvements = data.improvements;

    return trx.update<Review>("reviews", id, updates as any);
  });
}

// ---------------------------------------------------------------------------
// Submit review
// ---------------------------------------------------------------------------

export async function submitReview(
  orgId: number,
  id: string,
  data: {
    overall_rating: number;
    summary: string;
    strengths?: string;
    improvements?: string;
  },
  actor: ActorContext,
): Promise<Review> {
  const db = getDB();
  try {
    return await db.transaction(async (trx) => {
      const { review, cycle } = await loadReviewWithLockedCycle(trx, orgId, id);
      assertReviewAccess(actor, "submit", {
        organizationId: review.organization_id,
        employeeId: review.employee_id,
        reviewerId: review.reviewer_id,
      });
      if (review.status === "submitted") {
        throw new ValidationError("Review has already been submitted");
      }
      assertCycleAllowsContentChanges(cycle);

      // Verify all competencies are rated if cycle has a framework.
      if (cycle.framework_id) {
        await loadOwnedFramework(orgId, cycle.framework_id, trx);
        const competencies = await trx.findMany<Competency>("competencies", {
          filters: { framework_id: cycle.framework_id, deleted_at: null },
          page: 1,
          limit: 1000,
        });
        const existingRatings = await trx.findMany<ReviewCompetencyRating>(
          "review_competency_ratings",
          {
            filters: { review_id: id },
            page: 1,
            limit: 1000,
          },
        );
        const expectedIds = new Set(competencies.data.map((competency) => competency.id));
        const rogueRatings = existingRatings.data.filter(
          (rating) => !expectedIds.has(rating.competency_id),
        );
        if (rogueRatings.length > 0) {
          throw new ValidationError(
            "Review contains ratings outside the cycle competency framework",
          );
        }
        const ratedIds = new Set(existingRatings.data.map((rating) => rating.competency_id));
        const unrated = competencies.data.filter((competency) => !ratedIds.has(competency.id));
        if (unrated.length > 0) {
          throw new ValidationError(
            `All competencies must be rated before submitting. Missing: ${unrated.map((competency) => competency.name).join(", ")}`,
          );
        }
      } else {
        const existingRatings = await trx.findMany<ReviewCompetencyRating>(
          "review_competency_ratings",
          {
            filters: { review_id: id },
            page: 1,
            limit: 1,
          },
        );
        if (existingRatings.data.length > 0) {
          throw new ValidationError("This review cycle has no competency framework");
        }
      }

      return trx.update<Review>("reviews", id, {
        overall_rating: data.overall_rating,
        summary: data.summary,
        strengths: data.strengths ?? null,
        improvements: data.improvements ?? null,
        status: "submitted",
        submitted_at: new Date(),
      } as any);
    });
  } catch (err) {
    logger.error("Failed to submit review", { reviewId: id, error: (err as Error).message, stack: (err as Error).stack });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Rate competency
// ---------------------------------------------------------------------------

export async function rateCompetency(
  orgId: number,
  reviewId: string,
  competencyId: string,
  rating: number,
  comments: string | undefined,
  actor: ActorContext,
): Promise<ReviewCompetencyRating> {
  const db = getDB();
  return db.transaction(async (trx) => {
    const { review, cycle } = await loadReviewWithLockedCycle(trx, orgId, reviewId);
    assertReviewAccess(actor, "rate_competency", {
      organizationId: review.organization_id,
      employeeId: review.employee_id,
      reviewerId: review.reviewer_id,
    });
    if (review.status === "submitted") {
      throw new ValidationError("Cannot rate competencies on a submitted review");
    }
    assertCycleAllowsContentChanges(cycle);
    await loadCycleCompetency(orgId, cycle, competencyId, trx);

    // Upsert: check if rating exists already.
    const existing = await trx.findOne<ReviewCompetencyRating>("review_competency_ratings", {
      review_id: reviewId,
      competency_id: competencyId,
    });

    if (existing) {
      return trx.update<ReviewCompetencyRating>("review_competency_ratings", existing.id, {
        rating,
        comments: comments ?? null,
      } as any);
    }

    const record: Record<string, any> = {
      id: uuidv4(),
      review_id: reviewId,
      competency_id: competencyId,
      rating,
      comments: comments ?? null,
    };

    // Update review status to draft if pending.
    if (review.status === "pending") {
      await trx.update("reviews", reviewId, { status: "draft" } as any);
    }

    return trx.create<ReviewCompetencyRating>("review_competency_ratings", record as any);
  });
}

// ---------------------------------------------------------------------------
// Get all reviews for a participant in a cycle
// ---------------------------------------------------------------------------

export async function getReviewsForParticipant(
  orgId: number,
  cycleId: string,
  participantEmployeeId: number,
  actor: ActorContext,
): Promise<ReviewView[]> {
  const result = await listReviews(orgId, {
    cycle_id: cycleId,
    employee_id: participantEmployeeId,
    page: 1,
    perPage: 100,
  }, actor);
  return result.data;
}
