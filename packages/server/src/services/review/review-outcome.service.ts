import { v4 as uuidv4 } from "uuid";
import type {
  ReviewCycle,
  ReviewCycleParticipant,
  ReviewOutcome,
  ReviewOutcomeAppealStatus,
  ReviewOutcomeDetail,
  ReviewOutcomeView,
} from "@emp-performance/shared";
import { getDB } from "../../db/adapters";
import type { IDataContext } from "../../db/adapters/interface";
import { findUserById } from "../../db/empcloud";
import type { ActorContext } from "../../security/actor-context";
import { assertReviewOutcomeAccess } from "../../security/policies/review-outcome.policy";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors";
import { enqueueIntegrationEvent } from "../integration/outbox.service";
import { listReviews } from "./review.service";

export const REVIEW_OUTCOME_APPEAL_WINDOW_DAYS = 14;
const APPEAL_WINDOW_MS = REVIEW_OUTCOME_APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface ReleasedReviewOutcomeInput {
  participant_id: string;
  employee_id: number;
  released_rating: number;
}

export interface ReviewOutcomeListParams {
  page?: number;
  perPage?: number;
}

export interface ReviewOutcomeAppealListParams extends ReviewOutcomeListParams {
  cycleId?: string;
  status?: ReviewOutcomeAppealStatus;
}

interface PaginatedReviewOutcomes {
  data: ReviewOutcomeView[];
  total: number;
  page: number;
  perPage: number;
}

function validateOptionalNote(value: string | undefined, max: number, label: string): string | null {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > max) {
    throw new ValidationError(`${label} must be ${max} characters or fewer`);
  }
  return normalized;
}

function validateRequiredText(value: string, min: number, max: number, label: string): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ValidationError(`${label} must be between ${min} and ${max} characters`);
  }
  return normalized;
}

function normalizeRawRows<T>(result: any): T[] {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) return result[0] as T[];
    if (result.length === 0 || typeof result[0] === "object") return result as T[];
  }
  if (result && Array.isArray(result.rows)) return result.rows as T[];
  return [];
}

function normalizeOutcome(outcome: ReviewOutcome): ReviewOutcome {
  return {
    ...outcome,
    released_rating: Number(outcome.released_rating),
  };
}

async function hydrateOutcome(
  db: IDataContext,
  orgId: number,
  outcome: ReviewOutcome,
): Promise<ReviewOutcomeView> {
  const [cycle, employee] = await Promise.all([
    db.findOne<ReviewCycle>("review_cycles", {
      id: outcome.cycle_id,
      organization_id: orgId,
    }),
    findUserById(outcome.employee_id).catch(() => null),
  ]);

  return {
    ...normalizeOutcome(outcome),
    cycle_name: cycle?.name ?? null,
    cycle_start_date: cycle?.start_date ?? null,
    cycle_end_date: cycle?.end_date ?? null,
    employee_name:
      employee?.organization_id === orgId
        ? `${employee.first_name} ${employee.last_name}`.trim()
        : null,
  };
}

async function loadOutcome(
  db: IDataContext,
  orgId: number,
  id: string,
): Promise<ReviewOutcome> {
  const outcome = await db.findOne<ReviewOutcome>("review_outcomes", {
    id,
    organization_id: orgId,
  });
  if (!outcome) throw new NotFoundError("ReviewOutcome", id);
  return outcome;
}

async function lockAndLoadOutcome(
  db: IDataContext,
  orgId: number,
  id: string,
): Promise<ReviewOutcome> {
  await db.raw(
    "SELECT id FROM review_outcomes WHERE id = ? AND organization_id = ? FOR UPDATE",
    [id, orgId],
  );
  return loadOutcome(db, orgId, id);
}

async function recordAudit(
  db: IDataContext,
  orgId: number,
  actorId: number,
  outcomeId: string,
  action: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
): Promise<void> {
  await db.create("audit_logs", {
    id: uuidv4(),
    organization_id: orgId,
    user_id: actorId,
    action,
    entity_type: "review_outcome",
    entity_id: outcomeId,
    // Deliberately exclude acknowledgement, appeal, and resolution free text.
    old_values: JSON.stringify(oldValues),
    new_values: JSON.stringify(newValues),
    ip_address: null,
    user_agent: null,
  } as any);
}

/**
 * Release integration hook. The caller must pass its transaction-bound data
 * context so rating publication and outcome snapshots commit atomically.
 */
export async function createReviewOutcomesForRelease(
  db: IDataContext,
  orgId: number,
  cycleId: string,
  ratings: ReleasedReviewOutcomeInput[],
  releasedAt = new Date(),
): Promise<ReviewOutcome[]> {
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);
  if (cycle.status !== "calibration" || !cycle.calibration_finalized_at) {
    throw new ValidationError("Review outcomes can only be created from finalized calibration");
  }
  if (ratings.length === 0) {
    throw new ValidationError("At least one released rating is required");
  }
  if (Number.isNaN(releasedAt.getTime())) {
    throw new ValidationError("Release timestamp is invalid");
  }

  const participantIds = new Set<string>();
  for (const rating of ratings) {
    if (participantIds.has(rating.participant_id)) {
      throw new ValidationError("Each review-cycle participant may have only one outcome");
    }
    participantIds.add(rating.participant_id);

    const numericRating = Number(rating.released_rating);
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      throw new ValidationError("Released ratings must be between 1 and 5");
    }

    const participant = await db.findOne<ReviewCycleParticipant>(
      "review_cycle_participants",
      {
        id: rating.participant_id,
        cycle_id: cycleId,
        employee_id: rating.employee_id,
      },
    );
    if (!participant) {
      throw new ValidationError("Released rating does not match a participant in this cycle");
    }
  }

  const appealDeadline = new Date(releasedAt.getTime() + APPEAL_WINDOW_MS);
  const records = ratings.map((rating) => ({
    id: uuidv4(),
    organization_id: orgId,
    cycle_id: cycleId,
    participant_id: rating.participant_id,
    employee_id: rating.employee_id,
    released_rating: Number(rating.released_rating),
    released_at: releasedAt,
    appeal_deadline_at: appealDeadline,
    acknowledged_at: null,
    acknowledged_by: null,
    acknowledgement_note: null,
    appeal_status: null,
    appeal_reason: null,
    appeal_submitted_at: null,
    appeal_submitted_by: null,
    appeal_review_started_at: null,
    appeal_review_started_by: null,
    appeal_resolved_at: null,
    appeal_resolved_by: null,
    appeal_resolution_note: null,
  }));

  return db.createMany<ReviewOutcome>("review_outcomes", records as any);
}

export async function listMyReviewOutcomes(
  orgId: number,
  actor: ActorContext,
  params: ReviewOutcomeListParams = {},
): Promise<PaginatedReviewOutcomes> {
  assertReviewOutcomeAccess(actor, "read", {
    organizationId: orgId,
    employeeId: actor.employeeId,
  });

  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;
  const result = await db.findMany<ReviewOutcome>("review_outcomes", {
    page,
    limit: perPage,
    filters: {
      organization_id: orgId,
      employee_id: actor.employeeId,
    },
    sort: { field: "released_at", order: "desc" },
  });

  return {
    data: await Promise.all(result.data.map((outcome) => hydrateOutcome(db, orgId, outcome))),
    total: result.total,
    page,
    perPage,
  };
}

export async function getReviewOutcome(
  orgId: number,
  id: string,
  actor: ActorContext,
): Promise<ReviewOutcomeDetail> {
  const db = getDB();
  const outcome = await loadOutcome(db, orgId, id);
  assertReviewOutcomeAccess(actor, "read", {
    organizationId: orgId,
    employeeId: outcome.employee_id,
  });

  const [view, reviewResult] = await Promise.all([
    hydrateOutcome(db, orgId, outcome),
    listReviews(
      orgId,
      {
        cycle_id: outcome.cycle_id,
        employee_id: outcome.employee_id,
        status: "submitted",
        page: 1,
        perPage: 1000,
      },
      actor,
    ),
  ]);

  return { ...view, reviews: reviewResult.data };
}

export async function acknowledgeReviewOutcome(
  orgId: number,
  id: string,
  actor: ActorContext,
  note?: string,
): Promise<ReviewOutcomeView> {
  const normalizedNote = validateOptionalNote(note, 2000, "Acknowledgement note");
  const db = getDB();
  const updated = await db.transaction(async (trx) => {
    const outcome = await lockAndLoadOutcome(trx, orgId, id);
    assertReviewOutcomeAccess(actor, "acknowledge", {
      organizationId: orgId,
      employeeId: outcome.employee_id,
    });
    if (outcome.acknowledged_at) {
      throw new ConflictError("This review outcome has already been acknowledged");
    }

    const acknowledgedAt = new Date();
    const result = await trx.update<ReviewOutcome>("review_outcomes", id, {
      acknowledged_at: acknowledgedAt as any,
      acknowledged_by: actor.userId,
      acknowledgement_note: normalizedNote,
    });
    await recordAudit(
      trx,
      orgId,
      actor.userId,
      id,
      "review_outcome.acknowledged",
      { acknowledged_at: null },
      {
        acknowledged_at: acknowledgedAt.toISOString(),
        acknowledgement_note_present: normalizedNote !== null,
        acknowledgement_does_not_indicate_agreement: true,
        acknowledgement_does_not_waive_appeal: true,
      },
    );
    return result;
  });

  return hydrateOutcome(db, orgId, updated);
}

export async function submitReviewOutcomeAppeal(
  orgId: number,
  id: string,
  actor: ActorContext,
  reason: string,
): Promise<ReviewOutcomeView> {
  const normalizedReason = validateRequiredText(reason, 20, 4000, "Appeal reason");
  const db = getDB();
  const updated = await db.transaction(async (trx) => {
    const outcome = await lockAndLoadOutcome(trx, orgId, id);
    assertReviewOutcomeAccess(actor, "submit_appeal", {
      organizationId: orgId,
      employeeId: outcome.employee_id,
    });
    if (outcome.appeal_status !== null) {
      throw new ConflictError("An appeal has already been submitted for this review outcome");
    }

    const now = new Date();
    const deadline = new Date(outcome.appeal_deadline_at);
    if (Number.isNaN(deadline.getTime()) || now.getTime() > deadline.getTime()) {
      throw new ConflictError("The appeal window for this review outcome has closed");
    }

    const result = await trx.update<ReviewOutcome>("review_outcomes", id, {
      appeal_status: "submitted",
      appeal_reason: normalizedReason,
      appeal_submitted_at: now as any,
      appeal_submitted_by: actor.userId,
    });
    await recordAudit(
      trx,
      orgId,
      actor.userId,
      id,
      "review_outcome.appeal_submitted",
      { appeal_status: null },
      {
        appeal_status: "submitted",
        appeal_submitted_at: now.toISOString(),
        appeal_deadline_at: deadline.toISOString(),
        appeal_reason_present: true,
      },
    );
    await trx.create("notifications", {
      id: uuidv4(),
      organization_id: orgId,
      user_id: outcome.employee_id,
      type: "review_outcome_appeal_submitted",
      title: "Your performance review appeal was submitted",
      body: "HR can now review your appeal. You may withdraw it until review begins.",
      link: `/my/performance/reviews/${id}`,
      is_read: false,
      read_at: null,
    } as any);
    await enqueueIntegrationEvent(trx, {
      organizationId: orgId,
      eventType: "performance.review_outcome.appeal_submitted",
      aggregateType: "review_outcome",
      aggregateId: id,
      idempotencyKey: `performance.review_outcome.appeal_submitted:${id}:v1`,
      payload: {
        event: "performance.review_outcome.appeal_submitted",
        source: "emp-performance",
        timestamp: now.toISOString(),
        audienceRoles: ["super_admin", "org_admin", "hr_admin"],
        data: {
          organizationId: orgId,
          outcomeId: id,
          cycleId: outcome.cycle_id,
          employeeId: outcome.employee_id,
        },
      },
    });
    return result;
  });

  return hydrateOutcome(db, orgId, updated);
}

export async function withdrawReviewOutcomeAppeal(
  orgId: number,
  id: string,
  actor: ActorContext,
): Promise<ReviewOutcomeView> {
  const db = getDB();
  const updated = await db.transaction(async (trx) => {
    const outcome = await lockAndLoadOutcome(trx, orgId, id);
    assertReviewOutcomeAccess(actor, "withdraw_appeal", {
      organizationId: orgId,
      employeeId: outcome.employee_id,
    });
    if (outcome.appeal_status !== "submitted") {
      throw new ConflictError("Only a submitted appeal can be withdrawn");
    }

    const result = await trx.update<ReviewOutcome>("review_outcomes", id, {
      appeal_status: "withdrawn",
    });
    await recordAudit(
      trx,
      orgId,
      actor.userId,
      id,
      "review_outcome.appeal_withdrawn",
      { appeal_status: "submitted" },
      { appeal_status: "withdrawn" },
    );
    return result;
  });

  return hydrateOutcome(db, orgId, updated);
}

export async function listReviewOutcomeAppeals(
  orgId: number,
  actor: ActorContext,
  params: ReviewOutcomeAppealListParams = {},
): Promise<PaginatedReviewOutcomes> {
  assertReviewOutcomeAccess(actor, "list_appeals", { organizationId: orgId });

  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;
  const offset = (page - 1) * perPage;
  const where = ["organization_id = ?", "appeal_status IS NOT NULL"];
  const args: unknown[] = [orgId];
  if (params.cycleId) {
    where.push("cycle_id = ?");
    args.push(params.cycleId);
  }
  if (params.status) {
    where.push("appeal_status = ?");
    args.push(params.status);
  }

  const [rowsResult, countResult] = await Promise.all([
    db.raw<any>(
      `SELECT * FROM review_outcomes WHERE ${where.join(" AND ")} ORDER BY appeal_submitted_at DESC LIMIT ? OFFSET ?`,
      [...args, perPage, offset],
    ),
    db.raw<any>(
      `SELECT COUNT(*) AS c FROM review_outcomes WHERE ${where.join(" AND ")}`,
      args,
    ),
  ]);
  const rows = normalizeRawRows<ReviewOutcome>(rowsResult);
  const countRows = normalizeRawRows<{ c: string | number }>(countResult);

  return {
    data: await Promise.all(rows.map((outcome) => hydrateOutcome(db, orgId, outcome))),
    total: Number(countRows[0]?.c ?? 0),
    page,
    perPage,
  };
}

export async function startReviewOutcomeAppeal(
  orgId: number,
  id: string,
  actor: ActorContext,
): Promise<ReviewOutcomeView> {
  const db = getDB();
  const updated = await db.transaction(async (trx) => {
    const outcome = await lockAndLoadOutcome(trx, orgId, id);
    assertReviewOutcomeAccess(actor, "start_appeal_review", {
      organizationId: orgId,
      employeeId: outcome.employee_id,
    });
    if (outcome.appeal_status !== "submitted") {
      throw new ConflictError("Only a submitted appeal can enter review");
    }

    const now = new Date();
    const result = await trx.update<ReviewOutcome>("review_outcomes", id, {
      appeal_status: "under_review",
      appeal_review_started_at: now as any,
      appeal_review_started_by: actor.userId,
    });
    await recordAudit(
      trx,
      orgId,
      actor.userId,
      id,
      "review_outcome.appeal_review_started",
      { appeal_status: "submitted" },
      { appeal_status: "under_review", appeal_review_started_at: now.toISOString() },
    );
    return result;
  });

  return hydrateOutcome(db, orgId, updated);
}

export async function resolveReviewOutcomeAppeal(
  orgId: number,
  id: string,
  actor: ActorContext,
  resolution: { outcome: "upheld" | "not_upheld"; resolution_note: string },
): Promise<ReviewOutcomeView> {
  const normalizedResolutionNote = validateRequiredText(
    resolution.resolution_note,
    20,
    4000,
    "Resolution note",
  );
  const db = getDB();
  const updated = await db.transaction(async (trx) => {
    const outcome = await lockAndLoadOutcome(trx, orgId, id);
    assertReviewOutcomeAccess(actor, "resolve_appeal", {
      organizationId: orgId,
      employeeId: outcome.employee_id,
    });
    if (outcome.appeal_status !== "under_review") {
      throw new ConflictError("Only an appeal under review can be resolved");
    }

    const now = new Date();
    const result = await trx.update<ReviewOutcome>("review_outcomes", id, {
      appeal_status: resolution.outcome,
      appeal_resolved_at: now as any,
      appeal_resolved_by: actor.userId,
      appeal_resolution_note: normalizedResolutionNote,
    });
    await recordAudit(
      trx,
      orgId,
      actor.userId,
      id,
      "review_outcome.appeal_resolved",
      { appeal_status: "under_review" },
      {
        appeal_status: resolution.outcome,
        appeal_resolved_at: now.toISOString(),
        resolution_note_present: true,
        released_rating_unchanged: Number(outcome.released_rating),
      },
    );
    await trx.create("notifications", {
      id: uuidv4(),
      organization_id: orgId,
      user_id: outcome.employee_id,
      type: "review_outcome_appeal_resolved",
      title: "Your performance review appeal was resolved",
      body:
        resolution.outcome === "upheld"
          ? "Your appeal was upheld. The published rating remains unchanged until a versioned correction is completed."
          : "HR completed its review of your performance review appeal.",
      link: `/my/performance/reviews/${id}`,
      is_read: false,
      read_at: null,
    } as any);
    await enqueueIntegrationEvent(trx, {
      organizationId: orgId,
      eventType: "performance.review_outcome.appeal_resolved",
      aggregateType: "review_outcome",
      aggregateId: id,
      idempotencyKey: `performance.review_outcome.appeal_resolved:${id}:v1`,
      payload: {
        event: "performance.review_outcome.appeal_resolved",
        source: "emp-performance",
        timestamp: now.toISOString(),
        data: {
          organizationId: orgId,
          outcomeId: id,
          cycleId: outcome.cycle_id,
          employeeId: outcome.employee_id,
          resolution: resolution.outcome,
        },
      },
    });
    return result;
  });

  return hydrateOutcome(db, orgId, updated);
}
