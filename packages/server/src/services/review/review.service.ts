import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { logger } from "../../utils/logger";
import type {
  Review,
  ReviewCompetencyRating,
  ReviewCycle,
  Competency,
} from "@emp-performance/shared";

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
): Promise<Review> {
  const db = getDB();

  // Verify cycle belongs to org
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id: data.cycle_id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", data.cycle_id);

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

export async function getReview(
  orgId: number,
  id: string,
): Promise<Review & { competency_ratings: ReviewCompetencyRating[] }> {
  const db = getDB();
  const review = await db.findOne<Review>("reviews", {
    id,
    organization_id: orgId,
  });
  if (!review) throw new NotFoundError("Review", id);

  const ratings = await db.findMany<ReviewCompetencyRating>("review_competency_ratings", {
    filters: { review_id: id },
  });

  return { ...review, competency_ratings: ratings.data };
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

  const result = await db.findMany<Review>("reviews", {
    page,
    limit: perPage,
    filters,
    sort: { field: "created_at", order: "desc" },
  });

  return { data: result.data, total: result.total, page, perPage };
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
): Promise<Review> {
  const db = getDB();
  const review = await db.findOne<Review>("reviews", {
    id,
    organization_id: orgId,
  });
  if (!review) throw new NotFoundError("Review", id);
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
): Promise<Review> {
  const db = getDB();
  const review = await db.findOne<Review>("reviews", {
    id,
    organization_id: orgId,
  });
  if (!review) throw new NotFoundError("Review", id);
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
  comments?: string,
): Promise<ReviewCompetencyRating> {
  const db = getDB();
  const review = await db.findOne<Review>("reviews", {
    id: reviewId,
    organization_id: orgId,
  });
  if (!review) throw new NotFoundError("Review", reviewId);
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
