// ============================================================================
// PEER REVIEW SERVICE
// Manages peer review nominations and approval workflow.
// ============================================================================

import { getDB } from "../../db/adapters";
import type { IDataContext } from "../../db/adapters/interface";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} from "../../utils/errors";
import { logger } from "../../utils/logger";
import { findUserById } from "../../db/empcloud";
import { v4 as uuidv4 } from "uuid";
import type {
  Review,
  ReviewCompetencyRating,
  ReviewCycle,
} from "@emp-performance/shared";
import type { ActorContext } from "../../security/actor-context";
import { isAdministrativeRole } from "../../security/roles";

/** Verify a user exists and belongs to the given org. */
async function assertOrgMember(orgId: number, userId: number, label: string): Promise<void> {
  const user = await findUserById(userId);
  if (!user || user.organization_id !== orgId || user.status !== 1) {
    // Do not disclose whether an identifier belongs to another tenant.
    throw new NotFoundError(label, String(userId));
  }
}

const NOMINATION_EDITABLE_STATUSES = new Set(["draft", "active"]);
const RESPONSE_EDITABLE_STATUSES = new Set(["active", "in_review"]);

function isAdmin(actor: ActorContext): boolean {
  return isAdministrativeRole(actor.role) || actor.roles.some(isAdministrativeRole);
}

function assertActorOrganization(orgId: number, actor: ActorContext): void {
  if (actor.organizationId !== orgId) {
    throw new NotFoundError("Organization", String(orgId));
  }
}

function assertEditableCycle(
  cycle: Pick<ReviewCycle, "status">,
  allowedStatuses: ReadonlySet<string>,
  action: string,
): void {
  if (!allowedStatuses.has(cycle.status)) {
    throw new ValidationError(
      `Cannot ${action} while review cycle is '${cycle.status}'`,
    );
  }
}

async function loadCycle(
  orgId: number,
  cycleId: string,
  context: IDataContext = getDB(),
): Promise<ReviewCycle> {
  const cycle = await context.findOne<ReviewCycle>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) {
    throw new NotFoundError("Review cycle", cycleId);
  }
  return cycle;
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

async function assertCycleParticipant(
  cycleId: string,
  employeeId: number,
  context: IDataContext = getDB(),
): Promise<void> {
  const participant = await context.findOne("review_cycle_participants", {
    cycle_id: cycleId,
    employee_id: employeeId,
  });
  if (!participant) {
    // Keep the error deliberately generic so a caller cannot use the endpoint
    // to enumerate employee participation in another review population.
    throw new NotFoundError("Review cycle participant", `${cycleId}:${employeeId}`);
  }
}

function unwrapRawRows<T>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (!Array.isArray(result)) return [];
  if (Array.isArray(result[0])) return result[0] as T[];
  return result as T[];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PeerNomination {
  id: string;
  cycle_id: string;
  employee_id: number;
  nominee_id: number;
  status: string;
  nominated_by: number;
  approved_by: number | null;
  declined_by: number | null;
  declined_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface ListNominationsParams {
  page?: number;
  limit?: number;
  employeeId?: number;
  nomineeId?: number;
  status?: string;
}

interface PeerCompetencyRating {
  competency_id: string;
  rating: number;
  comments?: string;
}

interface PeerReviewResponse {
  id: string;
  organization_id: number;
  nomination_id: string;
  cycle_id: string;
  reviewer_employee_id: number;
  reviewee_employee_id: number;
  overall_rating: number | null;
  ratings: string | null;
  strengths: string | null;
  improvements: string | null;
  comments: string | null;
  status: string;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SubmitPeerReviewInput {
  overall_rating: number;
  ratings?: PeerCompetencyRating[];
  strengths?: string;
  improvements?: string;
  comments?: string;
}

interface ListResponsesParams {
  page?: number;
  limit?: number;
  cycleId?: string;
  reviewerEmployeeId?: number;
  revieweeEmployeeId?: number;
  status?: string;
}

/** Deserialize the JSON `ratings` column for client consumption. */
function hydrateResponse(row: PeerReviewResponse) {
  return {
    ...row,
    ratings:
      typeof row.ratings === "string"
        ? (JSON.parse(row.ratings) as PeerCompetencyRating[])
        : ((row.ratings as PeerCompetencyRating[] | null) ?? []),
  };
}

type HydratedPeerReviewResponse = ReturnType<typeof hydrateResponse>;

async function validateCompetencyRatings(
  orgId: number,
  cycle: ReviewCycle,
  ratings: PeerCompetencyRating[] | undefined,
  context: IDataContext = getDB(),
): Promise<void> {
  if (!ratings?.length) return;

  if (ratings.length > 100) {
    throw new ValidationError("A peer review may contain at most 100 competency ratings");
  }

  const ratingIds = ratings.map((rating) => rating.competency_id);
  if (new Set(ratingIds).size !== ratingIds.length) {
    throw new ValidationError("Each competency may only be rated once");
  }

  if (!cycle.framework_id) {
    throw new ValidationError("This review cycle does not have a competency framework");
  }

  // Checking both id and organization_id prevents a corrupted/cross-tenant
  // framework reference from becoming an authorization bypass.
  const framework = await context.findOne("competency_frameworks", {
    id: cycle.framework_id,
    organization_id: orgId,
    is_active: true,
    deleted_at: null,
  });
  if (!framework) {
    throw new NotFoundError("Review cycle", cycle.id);
  }

  // Query only the supplied IDs. Placeholders are generated from the bounded
  // array length; all values remain parameters, so no identifier enters SQL.
  const placeholders = ratingIds.map(() => "?").join(", ");
  const competencyRows = await context.raw<any>(
    `SELECT id FROM competencies WHERE framework_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
    [cycle.framework_id, ...ratingIds],
  );
  const allowedIds = new Set(
    unwrapRawRows<{ id: string }>(competencyRows).map((competency) => competency.id),
  );
  const invalidId = ratingIds.find((id) => !allowedIds.has(id));
  if (invalidId) {
    // Treat a foreign, deleted, or wrong-framework competency identically.
    throw new NotFoundError("Competency", invalidId);
  }
}

async function ensureCanonicalPeerReview(
  orgId: number,
  nomination: PeerNomination,
  participantVerified = false,
  context: IDataContext = getDB(),
): Promise<Review> {
  if (!participantVerified) {
    await loadCycle(orgId, nomination.cycle_id, context);
    await assertCycleParticipant(nomination.cycle_id, nomination.employee_id, context);
  }
  const assignment = {
    organization_id: orgId,
    cycle_id: nomination.cycle_id,
    employee_id: nomination.employee_id,
    reviewer_id: nomination.nominee_id,
    type: "peer",
  };
  const existing = await context.findOne<Review>("reviews", assignment);
  if (existing) return existing;

  try {
    return await context.create<Review>("reviews", {
      id: uuidv4(),
      ...assignment,
      status: "pending",
      overall_rating: null,
      summary: null,
      strengths: null,
      improvements: null,
      submitted_at: null,
    } as any);
  } catch (error) {
    // The assignment tuple is protected by a unique index. If two approval
    // requests race, return the winner instead of surfacing a false failure.
    const concurrent = await context.findOne<Review>("reviews", assignment);
    if (concurrent) return concurrent;
    throw error;
  }
}

async function syncCanonicalPeerReview(
  orgId: number,
  nomination: PeerNomination,
  response: Pick<
    HydratedPeerReviewResponse,
    "overall_rating" | "ratings" | "strengths" | "improvements" | "comments" | "submitted_at"
  >,
  participantVerified = false,
  context: IDataContext = getDB(),
): Promise<void> {
  const review = await ensureCanonicalPeerReview(
    orgId,
    nomination,
    participantVerified,
    context,
  );

  // Replace semantics keep retries deterministic; the transaction-bound
  // context makes the response and canonical review commit atomically.
  await context.deleteMany("review_competency_ratings", { review_id: review.id });
  if (response.ratings.length) {
    await context.createMany<ReviewCompetencyRating>(
      "review_competency_ratings",
      response.ratings.map((rating) => ({
        id: uuidv4(),
        review_id: review.id,
        competency_id: rating.competency_id,
        rating: rating.rating,
        comments: rating.comments ?? null,
      } as any)),
    );
  }

  await context.update<Review>("reviews", review.id, {
    overall_rating: response.overall_rating,
    summary: response.comments ?? null,
    strengths: response.strengths ?? null,
    improvements: response.improvements ?? null,
    status: "submitted",
    submitted_at: response.submitted_at ?? new Date(),
  } as any);
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function nominate(
  orgId: number,
  cycleId: string,
  employeeId: number,
  peerId: number,
  actor: ActorContext,
): Promise<PeerNomination> {
  const db = getDB();
  assertActorOrganization(orgId, actor);

  return db.transaction(async (trx) => {
    await lockCycle(trx, orgId, cycleId);
    const cycle = await loadCycle(orgId, cycleId, trx);
    assertEditableCycle(cycle, NOMINATION_EDITABLE_STATUSES, "nominate a peer reviewer");

  // Employees may request peers only for their own review. HR/admin can
  // administer nominations for any employee in the tenant.
  if (!isAdmin(actor) && employeeId !== actor.userId) {
    throw new ForbiddenError("You may only nominate peer reviewers for yourself");
  }

  // Prevent self-nomination
  if (employeeId === peerId) {
    throw new ValidationError("Cannot nominate self as peer reviewer");
  }

  // Verify both the subject employee and the nominated peer are real org users (#F4).
  await assertOrgMember(orgId, employeeId, "Employee");
  await assertOrgMember(orgId, peerId, "Nominated peer");
  await assertCycleParticipant(cycleId, employeeId, trx);

  // Block only an OPEN duplicate (pending/approved). A previously DECLINED
  // nomination shouldn't lock the pair out for the rest of the cycle — the old
  // guard matched any status, so once HR declined a peer (even by mistake) they
  // could never be re-nominated, and the "already nominated" error contradicted
  // the visible "declined" state (audit M3). Re-open the declined row instead of
  // creating a duplicate.
  const existing = await trx.findOne<PeerNomination>("peer_review_nominations", {
    cycle_id: cycleId,
    employee_id: employeeId,
    nominee_id: peerId,
  });
  if (existing && existing.status !== "declined") {
    throw new ConflictError("This peer has already been nominated for this employee in this cycle");
  }

  if (existing) {
    // existing.status === "declined" — reuse the row for a fresh nomination.
    const reopened = await trx.update<PeerNomination>("peer_review_nominations", existing.id, {
      status: "pending",
      nominated_by: actor.userId,
      approved_by: null,
      declined_by: null,
      declined_at: null,
    } as any);
    logger.info(`Peer nomination re-opened: employee=${employeeId}, peer=${peerId}, cycle=${cycleId}`);
    return reopened;
  }

  let nomination: PeerNomination;
  try {
    nomination = await trx.create<PeerNomination>("peer_review_nominations", {
      cycle_id: cycleId,
      employee_id: employeeId,
      nominee_id: peerId,
      status: "pending",
      nominated_by: actor.userId,
      approved_by: null,
    });
  } catch (error) {
    // The tuple is unique. Convert a concurrent winning nomination into the
    // same domain conflict returned by the pre-insert duplicate check.
    const concurrent = await trx.findOne<PeerNomination>("peer_review_nominations", {
      cycle_id: cycleId,
      employee_id: employeeId,
      nominee_id: peerId,
    });
    if (concurrent) {
      throw new ConflictError("This peer has already been nominated for this employee in this cycle");
    }
    throw error;
  }

  logger.info(`Peer nomination created: employee=${employeeId}, peer=${peerId}, cycle=${cycleId}`);
  return nomination;
  });
}

export async function listNominations(
  orgId: number,
  cycleId: string,
  actor: ActorContext,
  params?: ListNominationsParams,
) {
  const db = getDB();
  assertActorOrganization(orgId, actor);

  await loadCycle(orgId, cycleId);

  const filters: Record<string, any> = { cycle_id: cycleId };
  if (params?.employeeId) filters.employee_id = params.employeeId;
  if (params?.nomineeId) filters.nominee_id = params.nomineeId;
  if (params?.status) filters.status = params.status;

  const page = params?.page || 1;
  const limit = params?.limit || 50;

  if (!isAdmin(actor)) {
    const offset = (page - 1) * limit;
    const where = [
      "cycle_id = ?",
      "(employee_id = ? OR nominee_id = ? OR nominated_by = ?)",
    ];
    const args: any[] = [cycleId, actor.userId, actor.userId, actor.userId];
    if (params?.employeeId) {
      where.push("employee_id = ?");
      args.push(params.employeeId);
    }
    if (params?.nomineeId) {
      where.push("nominee_id = ?");
      args.push(params.nomineeId);
    }
    if (params?.status) {
      where.push("status = ?");
      args.push(params.status);
    }

    const rowsResult = await db.raw<any>(
      `SELECT * FROM peer_review_nominations WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset],
    );
    const countResult = await db.raw<any>(
      `SELECT COUNT(*) AS c FROM peer_review_nominations WHERE ${where.join(" AND ")}`,
      args,
    );
    const data = unwrapRawRows<PeerNomination>(rowsResult);
    const countRows = unwrapRawRows<{ c: number | string }>(countResult);
    const total = Number(countRows[0]?.c ?? 0);
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  return db.findMany<PeerNomination>("peer_review_nominations", {
    page,
    limit,
    filters,
    sort: { field: "created_at", order: "desc" },
  });
}

export async function approveNomination(
  orgId: number,
  nominationId: string,
  actor: ActorContext,
): Promise<PeerNomination> {
  const db = getDB();
  assertActorOrganization(orgId, actor);
  if (!isAdmin(actor)) {
    throw new ForbiddenError("Only HR or an administrator may approve peer nominations");
  }

  const pointer = await db.findById<PeerNomination>("peer_review_nominations", nominationId);
  if (!pointer) {
    throw new NotFoundError("Peer nomination", nominationId);
  }

  return db.transaction(async (trx) => {
    await lockCycle(trx, orgId, pointer.cycle_id);
    const nomination = await trx.findById<PeerNomination>(
      "peer_review_nominations",
      nominationId,
    );
    if (!nomination || nomination.cycle_id !== pointer.cycle_id) {
      throw new NotFoundError("Peer nomination", nominationId);
    }

    const cycle = await loadCycle(orgId, nomination.cycle_id, trx);
    assertEditableCycle(cycle, NOMINATION_EDITABLE_STATUSES, "approve a peer nomination");
    await assertCycleParticipant(nomination.cycle_id, nomination.employee_id, trx);

    if (nomination.status === "approved") {
      // Idempotent repair for deployments where the nomination predates the
      // canonical review bridge.
      await ensureCanonicalPeerReview(orgId, nomination, true, trx);
      return nomination;
    }

    if (nomination.status !== "pending") {
      throw new ValidationError(`Cannot approve nomination with status '${nomination.status}'`);
    }

    const updated = await trx.update<PeerNomination>("peer_review_nominations", nominationId, {
      status: "approved",
      approved_by: actor.userId,
    });

    await ensureCanonicalPeerReview(orgId, updated, true, trx);

    logger.info(`Peer nomination approved: ${nominationId} by user ${actor.userId}`);
    return updated;
  });
}

export async function declineNomination(
  orgId: number,
  nominationId: string,
  actor: ActorContext,
): Promise<PeerNomination> {
  const db = getDB();
  assertActorOrganization(orgId, actor);
  if (!isAdmin(actor)) {
    throw new ForbiddenError("Only HR or an administrator may decline peer nominations");
  }

  const pointer = await db.findById<PeerNomination>("peer_review_nominations", nominationId);
  if (!pointer) {
    throw new NotFoundError("Peer nomination", nominationId);
  }

  return db.transaction(async (trx) => {
    await lockCycle(trx, orgId, pointer.cycle_id);
    const nomination = await trx.findById<PeerNomination>(
      "peer_review_nominations",
      nominationId,
    );
    if (!nomination || nomination.cycle_id !== pointer.cycle_id) {
      throw new NotFoundError("Peer nomination", nominationId);
    }

    const cycle = await loadCycle(orgId, nomination.cycle_id, trx);
    assertEditableCycle(cycle, NOMINATION_EDITABLE_STATUSES, "decline a peer nomination");

    if (nomination.status !== "pending") {
      throw new ValidationError(`Cannot decline nomination with status '${nomination.status}'`);
    }

    // Record the decline in dedicated columns; approved_by stays null so a
    // declined nomination never masquerades as approved (#R4).
    const updated = await trx.update<PeerNomination>("peer_review_nominations", nominationId, {
      status: "declined",
      declined_by: actor.userId,
      declined_at: new Date(),
    });

    logger.info(`Peer nomination declined: ${nominationId} by user ${actor.userId}`);
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Peer review submission (#F9)
// ---------------------------------------------------------------------------

/**
 * Submit (or create) the actual peer review for an approved nomination.
 *
 * Guards:
 * - the nomination must belong to the caller's org and be `approved`
 * - only the nominated peer (reviewer) may submit
 * - idempotent: a submitted response can't be overwritten; a repeated submit
 *   returns the stored response and repairs its canonical review bridge
 *   (one response per nomination is also enforced by a unique DB index).
 */
export async function submitPeerReview(
  orgId: number,
  nominationId: string,
  actor: ActorContext,
  data: SubmitPeerReviewInput,
): Promise<HydratedPeerReviewResponse> {
  const db = getDB();
  assertActorOrganization(orgId, actor);

  const pointer = await db.findById<PeerNomination>("peer_review_nominations", nominationId);
  if (!pointer) {
    throw new NotFoundError("Peer nomination", nominationId);
  }

  return db.transaction(async (trx) => {
    await lockCycle(trx, orgId, pointer.cycle_id);
    const nomination = await trx.findById<PeerNomination>(
      "peer_review_nominations",
      nominationId,
    );
    if (!nomination || nomination.cycle_id !== pointer.cycle_id) {
      throw new NotFoundError("Peer nomination", nominationId);
    }

    const cycle = await loadCycle(orgId, nomination.cycle_id, trx);
    assertEditableCycle(cycle, RESPONSE_EDITABLE_STATUSES, "submit a peer review");

    // Only the nominated reviewer may submit, and only once the nomination is approved.
    if (nomination.nominee_id !== actor.userId) {
      // Conceal another reviewer's assignment from unrelated callers.
      throw new NotFoundError("Peer nomination", nominationId);
    }
    if (nomination.status !== "approved") {
      throw new ValidationError(
        `Cannot submit a peer review for a nomination with status '${nomination.status}'`,
      );
    }

    await assertCycleParticipant(nomination.cycle_id, nomination.employee_id, trx);
    await validateCompetencyRatings(orgId, cycle, data.ratings, trx);

    const ratingsJson = data.ratings && data.ratings.length ? JSON.stringify(data.ratings) : null;
    const submittedAt = new Date();

    // Idempotency: reuse the existing response row for this nomination if present.
    const existing = await trx.findOne<PeerReviewResponse>("peer_review_responses", {
      organization_id: orgId,
      nomination_id: nominationId,
    });

    if (existing) {
      if (existing.status === "submitted") {
        // A retry is safe and repairs the canonical review if the first request
        // persisted the response but failed during the bridge synchronization.
        const hydrated = hydrateResponse(existing);
        await validateCompetencyRatings(orgId, cycle, hydrated.ratings, trx);
        await syncCanonicalPeerReview(orgId, nomination, hydrated, true, trx);
        return hydrated;
      }
      const updated = await trx.update<PeerReviewResponse>(
        "peer_review_responses",
        existing.id,
        {
          overall_rating: data.overall_rating,
          ratings: ratingsJson,
          strengths: data.strengths ?? null,
          improvements: data.improvements ?? null,
          comments: data.comments ?? null,
          status: "submitted",
          submitted_at: submittedAt,
        },
      );
      const hydrated = hydrateResponse(updated);
      await syncCanonicalPeerReview(orgId, nomination, hydrated, true, trx);
      logger.info(
        `Peer review submitted (updated): nomination=${nominationId} reviewer=${actor.userId}`,
      );
      return hydrated;
    }

    const created = await trx.create<PeerReviewResponse>("peer_review_responses", {
      organization_id: orgId,
      nomination_id: nominationId,
      cycle_id: nomination.cycle_id,
      reviewer_employee_id: actor.userId,
      reviewee_employee_id: nomination.employee_id,
      overall_rating: data.overall_rating,
      ratings: ratingsJson,
      strengths: data.strengths ?? null,
      improvements: data.improvements ?? null,
      comments: data.comments ?? null,
      status: "submitted",
      submitted_at: submittedAt,
    });

    const hydrated = hydrateResponse(created);
    await syncCanonicalPeerReview(orgId, nomination, hydrated, true, trx);
    logger.info(`Peer review submitted: nomination=${nominationId} reviewer=${actor.userId}`);
    return hydrated;
  });
}

/**
 * Fetch the peer-review response for a single nomination, org-scoped. The
 * caller must be the reviewer or an HR/admin. A reviewee must not receive the
 * raw response because it includes the reviewer's identity. Returns
 * null when no response exists yet so the reviewer's form can render empty.
 */
export async function getResponse(
  orgId: number,
  nominationId: string,
  actor: ActorContext,
): Promise<HydratedPeerReviewResponse | null> {
  const db = getDB();
  assertActorOrganization(orgId, actor);

  const nomination = await db.findById<PeerNomination>("peer_review_nominations", nominationId);
  if (!nomination) {
    throw new NotFoundError("Peer nomination", nominationId);
  }

  await loadCycle(orgId, nomination.cycle_id);

  if (!isAdmin(actor) && nomination.nominee_id !== actor.userId) {
    throw new NotFoundError("Peer nomination", nominationId);
  }

  const response = await db.findOne<PeerReviewResponse>("peer_review_responses", {
    organization_id: orgId,
    nomination_id: nominationId,
  });
  return response ? hydrateResponse(response) : null;
}

/** List peer-review responses for the org, filterable by cycle/reviewer/reviewee/status. */
export async function listResponses(
  orgId: number,
  actor: ActorContext,
  params?: ListResponsesParams,
) {
  const db = getDB();
  assertActorOrganization(orgId, actor);

  const filters: Record<string, any> = { organization_id: orgId };
  if (params?.cycleId) filters.cycle_id = params.cycleId;
  if (isAdmin(actor)) {
    if (params?.reviewerEmployeeId) filters.reviewer_employee_id = params.reviewerEmployeeId;
  } else {
    // A reviewee receives aggregate/canonical results elsewhere, never raw
    // response rows that identify another reviewer.
    filters.reviewer_employee_id = actor.userId;
  }
  if (params?.revieweeEmployeeId) filters.reviewee_employee_id = params.revieweeEmployeeId;
  if (params?.status) filters.status = params.status;

  const result = await db.findMany<PeerReviewResponse>("peer_review_responses", {
    page: params?.page || 1,
    limit: params?.limit || 50,
    filters,
    sort: { field: "created_at", order: "desc" },
  });

  return { ...result, data: result.data.map(hydrateResponse) };
}
