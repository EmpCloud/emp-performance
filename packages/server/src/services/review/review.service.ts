import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { findUserById } from "../../db/empcloud";
import { NotFoundError, ValidationError, ConflictError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type { ActorContext } from "../../security/actor-context";
import { assertReviewAccess } from "../../security/policies/review.policy";
import type {
  Review,
  ReviewCompetencyRating,
  ReviewCycle,
  Competency,
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

  // Verify cycle belongs to org
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id: data.cycle_id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", data.cycle_id);

  await Promise.all([
    assertActiveOrganizationUser(orgId, data.employee_id, "Employee"),
    assertActiveOrganizationUser(orgId, data.reviewer_id, "Reviewer"),
  ]);

  // Reject duplicates on (cycle, employee, reviewer, type) so a participant
  // never ends up with two identical review rows (#R10).
  const duplicate = await db.findOne<Review>("reviews", {
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

  return db.create<Review>("reviews", record as any);
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
  // When set (non-admin caller), the review is only returned if the caller is
  // its reviewer or its subject employee — otherwise it's a confidential review
  // about someone else and we 404 (audit H2). Admins pass undefined.
  restrictToUserId?: number,
): Promise<Review & { competency_ratings: ReviewCompetencyRatingWithName[] }> {
  const db = getDB();
  const review = await db.findOne<Review>("reviews", {
    id,
    organization_id: orgId,
  });
  if (!review) throw new NotFoundError("Review", id);

  if (
    restrictToUserId !== undefined &&
    review.reviewer_id !== restrictToUserId &&
    review.employee_id !== restrictToUserId
  ) {
    throw new NotFoundError("Review", id);
  }

  const ratings = await db.findMany<ReviewCompetencyRating>("review_competency_ratings", {
    filters: { review_id: id },
    limit: 1000,
  });

  // Resolve competency names so the UI can show readable labels instead of a
  // truncated uuid (#R9).
  const ratingsWithNames: ReviewCompetencyRatingWithName[] = await Promise.all(
    ratings.data.map(async (r) => {
      const competency = await db.findById<Competency>("competencies", r.competency_id);
      return { ...r, competency_name: competency?.name ?? null };
    }),
  );

  return { ...review, competency_ratings: ratingsWithNames };
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
    // When set (non-admin caller), results are scoped to reviews the caller
    // authored or is the subject of — a plain employee must never list other
    // people's confidential reviews (audit H2). Admins pass undefined.
    restrictToUserId?: number;
  },
): Promise<{ data: Review[]; total: number; page: number; perPage: number }> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

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
    if (params.restrictToUserId !== undefined) {
      where.push("(reviewer_id = ? OR employee_id = ?)");
      args.push(params.restrictToUserId, params.restrictToUserId);
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
    const rows = (Array.isArray(rowsRes) ? rowsRes[0] || rowsRes : []) as Review[];
    const totalRows = (Array.isArray(totalRes) ? totalRes[0] || totalRes : []) as any[];
    const total = Number(totalRows?.[0]?.c ?? 0);
    return { data: rows, total, page, perPage };
  }

  // Non-admin callers need the (reviewer OR subject) scope, which findMany's
  // equality filters can't express — use a raw query for that case.
  if (params.restrictToUserId !== undefined) {
    const offset = (page - 1) * perPage;
    const where: string[] = ["organization_id = ?"];
    const args: any[] = [orgId];
    if (params.cycle_id) { where.push("cycle_id = ?"); args.push(params.cycle_id); }
    if (params.reviewer_id) { where.push("reviewer_id = ?"); args.push(params.reviewer_id); }
    if (params.employee_id) { where.push("employee_id = ?"); args.push(params.employee_id); }
    if (params.type) { where.push("type = ?"); args.push(params.type); }
    if (params.status) { where.push("status = ?"); args.push(params.status); }
    where.push("(reviewer_id = ? OR employee_id = ?)");
    args.push(params.restrictToUserId, params.restrictToUserId);

    const orderDir = sortOrder.toUpperCase() === "ASC" ? "ASC" : "DESC";
    const rowsRes = await db.raw<any>(
      `SELECT * FROM reviews WHERE ${where.join(" AND ")} ORDER BY ${sortField} ${orderDir} LIMIT ? OFFSET ?`,
      [...args, perPage, offset],
    );
    const totalRes = await db.raw<any>(
      `SELECT COUNT(*) AS c FROM reviews WHERE ${where.join(" AND ")}`,
      args,
    );
    const rows = (Array.isArray(rowsRes) ? rowsRes[0] || rowsRes : []) as Review[];
    const totalRows = (Array.isArray(totalRes) ? totalRes[0] || totalRes : []) as any[];
    return { data: rows, total: Number(totalRows?.[0]?.c ?? 0), page, perPage };
  }

  const result = await db.findMany<Review>("reviews", {
    page,
    limit: perPage,
    filters,
    sort: { field: sortField, order: sortOrder },
  });

  return { data: result.data, total: result.total, page, perPage };
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
  const review = await db.findOne<Review>("reviews", { id, organization_id: orgId });
  if (!review) throw new NotFoundError("Review", id);
  assertReviewAccess(actor, "delete", {
    organizationId: review.organization_id,
    employeeId: review.employee_id,
    reviewerId: review.reviewer_id,
  });
  if (review.status === "submitted") {
    throw new ValidationError("Cannot delete a submitted review");
  }
  await db.delete("reviews", id);
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
  const review = await db.findOne<Review>("reviews", { id, organization_id: orgId });
  if (!review) throw new NotFoundError("Review", id);
  assertReviewAccess(actor, "reassign", {
    organizationId: review.organization_id,
    employeeId: review.employee_id,
    reviewerId: review.reviewer_id,
  });
  if (review.status === "submitted") {
    throw new ValidationError("Cannot reassign a submitted review");
  }
  if (review.reviewer_id === newReviewerId) {
    return review;
  }

  await assertActiveOrganizationUser(orgId, newReviewerId, "Reviewer");

  const duplicate = await db.findOne<Review>("reviews", {
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

  return db.update<Review>("reviews", id, { reviewer_id: newReviewerId } as any);
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
  const review = await db.findOne<Review>("reviews", {
    id,
    organization_id: orgId,
  });
  if (!review) throw new NotFoundError("Review", id);
  assertReviewAccess(actor, "save_draft", {
    organizationId: review.organization_id,
    employeeId: review.employee_id,
    reviewerId: review.reviewer_id,
  });
  if (review.status === "submitted") {
    throw new ValidationError("Cannot edit a submitted review");
  }

  const updates: Record<string, any> = { status: "draft" };
  if (data.overall_rating !== undefined) updates.overall_rating = data.overall_rating;
  if (data.summary !== undefined) updates.summary = data.summary;
  if (data.strengths !== undefined) updates.strengths = data.strengths;
  if (data.improvements !== undefined) updates.improvements = data.improvements;

  return db.update<Review>("reviews", id, updates as any);
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
  const review = await db.findOne<Review>("reviews", {
    id,
    organization_id: orgId,
  });
  if (!review) throw new NotFoundError("Review", id);
  assertReviewAccess(actor, "submit", {
    organizationId: review.organization_id,
    employeeId: review.employee_id,
    reviewerId: review.reviewer_id,
  });
  if (review.status === "submitted") {
    throw new ValidationError("Review has already been submitted");
  }

  // Verify all competencies are rated if cycle has a framework
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id: review.cycle_id,
    organization_id: orgId,
  });
  if (cycle?.framework_id) {
    const competencies = await db.findMany<Competency>("competencies", {
      filters: { framework_id: cycle.framework_id },
    });
    const existingRatings = await db.findMany<ReviewCompetencyRating>("review_competency_ratings", {
      filters: { review_id: id },
    });
    const ratedIds = new Set(existingRatings.data.map((r) => r.competency_id));
    const unrated = competencies.data.filter((c) => !ratedIds.has(c.id));
    if (unrated.length > 0) {
      throw new ValidationError(
        `All competencies must be rated before submitting. Missing: ${unrated.map((c) => c.name).join(", ")}`,
      );
    }
  }

  try {
    return await db.update<Review>("reviews", id, {
      overall_rating: data.overall_rating,
      summary: data.summary,
      strengths: data.strengths ?? null,
      improvements: data.improvements ?? null,
      status: "submitted",
      submitted_at: new Date(),
    } as any);
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
  const review = await db.findOne<Review>("reviews", {
    id: reviewId,
    organization_id: orgId,
  });
  if (!review) throw new NotFoundError("Review", reviewId);
  assertReviewAccess(actor, "rate_competency", {
    organizationId: review.organization_id,
    employeeId: review.employee_id,
    reviewerId: review.reviewer_id,
  });
  if (review.status === "submitted") {
    throw new ValidationError("Cannot rate competencies on a submitted review");
  }

  // Upsert: check if rating exists already
  const existing = await db.findOne<ReviewCompetencyRating>("review_competency_ratings", {
    review_id: reviewId,
    competency_id: competencyId,
  });

  if (existing) {
    return db.update<ReviewCompetencyRating>("review_competency_ratings", existing.id, {
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

  // Update review status to draft if pending
  if (review.status === "pending") {
    await db.update("reviews", reviewId, { status: "draft" } as any);
  }

  return db.create<ReviewCompetencyRating>("review_competency_ratings", record as any);
}

// ---------------------------------------------------------------------------
// Get all reviews for a participant in a cycle
// ---------------------------------------------------------------------------

export async function getReviewsForParticipant(
  orgId: number,
  cycleId: string,
  participantEmployeeId: number,
): Promise<Review[]> {
  const db = getDB();
  const result = await db.findMany<Review>("reviews", {
    filters: {
      organization_id: orgId,
      cycle_id: cycleId,
      employee_id: participantEmployeeId,
    },
    limit: 100,
  });
  return result.data;
}
