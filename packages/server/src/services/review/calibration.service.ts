import { v4 as uuidv4 } from "uuid";
import type {
  CalibrationDecision as SharedCalibrationDecision,
  CalibrationParticipant,
  CalibrationRoster as SharedCalibrationRoster,
  Review,
  ReviewCycle,
  ReviewCycleParticipant,
} from "@emp-performance/shared";
import { getDB } from "../../db/adapters";
import type { IDataContext } from "../../db/adapters/interface";
import { findUserById } from "../../db/empcloud";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../utils/errors";

const PAGE_SIZE = 250;
const MIN_REASON_LENGTH = 10;

export type CalibrationDecision = SharedCalibrationDecision;

export interface CalibrationRosterItem extends CalibrationParticipant {
  manager_id: number | null;
  incomplete_required_reviews: Array<"self" | "manager">;
}

export interface CalibrationRoster extends SharedCalibrationRoster {
  participants: CalibrationRosterItem[];
  participant_count: number;
  ready_count: number;
  is_complete: boolean;
}

export interface CalibrationFinalRating {
  participant_id: string;
  employee_id: number;
  baseline_rating: number;
  calibrated_rating: number;
  decision_id: string | null;
  decision_version: number | null;
}

type CalibrationCycle = ReviewCycle;

type StoredParticipant = ReviewCycleParticipant & {
  manager_id: number | null;
};

async function findAll<T>(
  table: string,
  filters: Record<string, unknown>,
  sort?: { field: string; order: "asc" | "desc" },
  context: IDataContext = getDB(),
): Promise<T[]> {
  const rows: T[] = [];
  let page = 1;

  for (;;) {
    const result = await context.findMany<T>(table, {
      page,
      limit: PAGE_SIZE,
      filters,
      sort,
    });
    rows.push(...result.data);

    if (
      result.data.length < PAGE_SIZE ||
      (Number.isFinite(result.total) && rows.length >= result.total)
    ) {
      return rows;
    }
    page += 1;
  }
}

async function getCycleForOrganization(
  orgId: number,
  cycleId: string,
  context: IDataContext = getDB(),
): Promise<CalibrationCycle> {
  const cycle = await context.findOne<CalibrationCycle>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);
  return cycle;
}

async function getParticipantForCycle(
  cycleId: string,
  participantId: string,
  context: IDataContext = getDB(),
): Promise<StoredParticipant> {
  const participant = await context.findOne<StoredParticipant>(
    "review_cycle_participants",
    { id: participantId, cycle_id: cycleId },
  );
  if (!participant) throw new NotFoundError("ReviewCycleParticipant", participantId);
  return participant;
}

async function lockCycle(
  context: IDataContext,
  orgId: number,
  cycleId: string,
): Promise<void> {
  // Calibration writes are serialized on the cycle row. This closes the gap
  // where a decision could otherwise commit immediately after finalization.
  await context.raw(
    "SELECT id FROM review_cycles WHERE id = ? AND organization_id = ? FOR UPDATE",
    [cycleId, orgId],
  );
}

function asValidRating(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  return Math.round(rating * 100) / 100;
}

function computeBaseline(reviews: Review[]): number | null {
  const ratings = reviews
    .map((review) => asValidRating(review.overall_rating))
    .filter((rating): rating is number => rating !== null);
  if (ratings.length === 0) return null;
  return Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 100) / 100;
}

function buildRosterItem(
  participant: StoredParticipant,
  reviews: Review[],
  latestDecision: CalibrationDecision | null,
): CalibrationRosterItem {
  const submitted = reviews.filter(
    (review) => review.status === "submitted" && review.employee_id === participant.employee_id,
  );
  const incomplete: Array<"self" | "manager"> = [];

  const hasValidRequiredReview = (type: "self" | "manager", reviewerId: number) =>
    submitted.some(
      (review) =>
        review.type === type &&
        review.reviewer_id === reviewerId &&
        asValidRating(review.overall_rating) !== null,
    );

  if (!hasValidRequiredReview("self", participant.employee_id)) {
    incomplete.push("self");
  }
  if (
    participant.manager_id !== null &&
    !hasValidRequiredReview("manager", participant.manager_id)
  ) {
    incomplete.push("manager");
  }

  const baseline = incomplete.length === 0 ? computeBaseline(submitted) : null;
  const calibrated = latestDecision
    ? asValidRating(latestDecision.calibrated_rating)
    : null;

  return {
    participant_id: participant.id,
    employee_id: participant.employee_id,
    employee_name: null,
    manager_id: participant.manager_id,
    baseline_rating: baseline,
    calibrated_rating: calibrated,
    final_rating: calibrated ?? baseline,
    has_decision: latestDecision !== null,
    latest_decision: latestDecision,
    incomplete_required_reviews: incomplete,
  };
}

async function buildCalibrationRoster(
  orgId: number,
  cycle: CalibrationCycle,
  context: IDataContext = getDB(),
  enrichEmployeeNames = true,
): Promise<CalibrationRoster> {
  const [participants, reviews, decisions] = await Promise.all([
    findAll<StoredParticipant>("review_cycle_participants", {
      cycle_id: cycle.id,
    }, undefined, context),
    findAll<Review>("reviews", {
      organization_id: orgId,
      cycle_id: cycle.id,
    }, undefined, context),
    findAll<CalibrationDecision>(
      "review_calibration_decisions",
      { organization_id: orgId, cycle_id: cycle.id },
      { field: "version", order: "desc" },
      context,
    ),
  ]);

  const latestByParticipant = new Map<string, CalibrationDecision>();
  for (const decision of decisions) {
    const current = latestByParticipant.get(decision.participant_id);
    if (!current || Number(decision.version) > Number(current.version)) {
      latestByParticipant.set(decision.participant_id, decision);
    }
  }

  const roster = participants.map((participant) =>
    buildRosterItem(
      participant,
      reviews,
      latestByParticipant.get(participant.id) ?? null,
    ),
  );
  if (enrichEmployeeNames) {
    await Promise.all(
      roster.map(async (item) => {
        try {
          const employee = await findUserById(item.employee_id);
          if (employee?.organization_id === orgId) {
            item.employee_name = `${employee.first_name} ${employee.last_name}`.trim();
          }
        } catch {
          // Identity enrichment is best-effort. The stable employee id remains
          // available if the EmpCloud directory is temporarily unavailable.
        }
      }),
    );
  }
  const readyCount = roster.filter(
    (item) =>
      item.baseline_rating !== null && item.incomplete_required_reviews.length === 0,
  ).length;

  return {
    cycle_id: cycle.id,
    status: cycle.status,
    finalized_at: cycle.calibration_finalized_at ?? null,
    finalized_by: cycle.calibration_finalized_by ?? null,
    participants: roster,
    participant_count: roster.length,
    ready_count: readyCount,
    is_complete: roster.length > 0 && readyCount === roster.length,
  };
}

/** Returns the tenant-scoped roster, computed baseline, and latest override. */
export async function getCalibrationRoster(
  orgId: number,
  cycleId: string,
): Promise<CalibrationRoster> {
  const cycle = await getCycleForOrganization(orgId, cycleId);
  return buildCalibrationRoster(orgId, cycle);
}

/**
 * Appends a new decision version. Existing decisions are never updated or
 * deleted, so every adjustment and reason remains available for audit.
 */
export async function recordCalibrationDecision(
  orgId: number,
  cycleId: string,
  participantId: string,
  actorId: number,
  input: { rating: number; reason: string },
): Promise<CalibrationDecision> {
  const rating = asValidRating(input.rating);
  if (rating === null) {
    throw new ValidationError("Calibrated rating must be between 1 and 5");
  }
  const reason = input.reason?.trim() ?? "";
  if (reason.length < MIN_REASON_LENGTH) {
    throw new ValidationError(
      `Calibration reason must be at least ${MIN_REASON_LENGTH} characters`,
    );
  }

  return getDB().transaction(async (trx) => {
    await lockCycle(trx, orgId, cycleId);
    const cycle = await getCycleForOrganization(orgId, cycleId, trx);
    if (cycle.status !== "calibration") {
      throw new ValidationError("Calibration decisions require a cycle in calibration");
    }
    if (cycle.calibration_finalized_at) {
      throw new ConflictError("Calibration has already been finalized");
    }

    const participant = await getParticipantForCycle(cycleId, participantId, trx);
    const reviews = await findAll<Review>(
      "reviews",
      {
        organization_id: orgId,
        cycle_id: cycleId,
        employee_id: participant.employee_id,
      },
      undefined,
      trx,
    );
    const participantRoster = buildRosterItem(participant, reviews, null);
    if (participantRoster.baseline_rating === null) {
      throw new ValidationError(
        "A calibration decision cannot be recorded until required reviews have valid ratings",
      );
    }

    const previous = await trx.findMany<CalibrationDecision>(
      "review_calibration_decisions",
      {
        page: 1,
        limit: 1,
        filters: {
          organization_id: orgId,
          cycle_id: cycleId,
          participant_id: participantId,
        },
        sort: { field: "version", order: "desc" },
      },
    );
    const previousDecision = previous.data[0] ?? null;
    const version = Number(previousDecision?.version ?? 0) + 1;
    const decision = await trx.create<CalibrationDecision>(
      "review_calibration_decisions",
      {
        id: uuidv4(),
        organization_id: orgId,
        cycle_id: cycleId,
        participant_id: participantId,
        employee_id: participant.employee_id,
        baseline_rating: participantRoster.baseline_rating,
        calibrated_rating: rating,
        reason,
        version,
        decided_by: actorId,
      },
    );

    await trx.create("audit_logs", {
      id: uuidv4(),
      organization_id: orgId,
      user_id: actorId,
      action: "review_calibration.decision_recorded",
      entity_type: "review_cycle_participant",
      entity_id: participantId,
      old_values: previousDecision
        ? JSON.stringify({
            rating: Number(previousDecision.calibrated_rating),
            version: Number(previousDecision.version),
          })
        : null,
      new_values: JSON.stringify({
        cycle_id: cycleId,
        baseline_rating: participantRoster.baseline_rating,
        calibrated_rating: rating,
        reason,
        version,
      }),
      ip_address: null,
      user_agent: null,
    } as any);

    return decision;
  });
}

/** Returns every immutable decision version, newest first. */
export async function getCalibrationHistory(
  orgId: number,
  cycleId: string,
  participantId: string,
): Promise<CalibrationDecision[]> {
  await getCycleForOrganization(orgId, cycleId);
  await getParticipantForCycle(cycleId, participantId);
  return findAll<CalibrationDecision>(
    "review_calibration_decisions",
    {
      organization_id: orgId,
      cycle_id: cycleId,
      participant_id: participantId,
    },
    { field: "version", order: "desc" },
  );
}

/**
 * Locks the calibration inputs for release. An override is optional; where no
 * decision exists, the computed baseline is the effective final rating.
 */
export async function finalizeCalibration(
  orgId: number,
  cycleId: string,
  actorId: number,
): Promise<ReviewCycle> {
  return getDB().transaction(async (trx) => {
    await lockCycle(trx, orgId, cycleId);
    const current = await getCycleForOrganization(orgId, cycleId, trx);
    if (current.status !== "calibration") {
      throw new ValidationError("Only a cycle in calibration can be finalized");
    }
    if (current.calibration_finalized_at) {
      throw new ConflictError("Calibration has already been finalized");
    }

    const roster = await buildCalibrationRoster(orgId, current, trx, false);
    if (roster.participant_count === 0) {
      throw new ValidationError("Calibration cannot be finalized without participants");
    }
    if (!roster.is_complete) {
      const incompleteCount = roster.participant_count - roster.ready_count;
      throw new ValidationError(
        `Calibration cannot be finalized while ${incompleteCount} participant(s) have incomplete or invalid required reviews`,
      );
    }

    const finalizedAt = new Date().toISOString();
    const finalized = await trx.update<ReviewCycle>("review_cycles", cycleId, {
      calibration_finalized_at: finalizedAt,
      calibration_finalized_by: actorId,
    });

    await trx.create("audit_logs", {
      id: uuidv4(),
      organization_id: orgId,
      user_id: actorId,
      action: "review_calibration.finalized",
      entity_type: "review_cycle",
      entity_id: cycleId,
      old_values: JSON.stringify({ calibration_finalized_at: null }),
      new_values: JSON.stringify({
        calibration_finalized_at: finalizedAt,
        calibration_finalized_by: actorId,
        participant_count: roster.participant_count,
      }),
      ip_address: null,
      user_agent: null,
    } as any);

    return finalized;
  });
}

/**
 * Provides the frozen effective ratings used by cycle release. It refuses to
 * expose a releasable set until calibration has been explicitly finalized.
 */
export async function getFinalizedCalibrationRatings(
  orgId: number,
  cycleId: string,
): Promise<CalibrationFinalRating[]> {
  const cycle = await getCycleForOrganization(orgId, cycleId);
  if (!cycle.calibration_finalized_at) {
    throw new ConflictError("Calibration must be finalized before ratings are released");
  }

  const roster = await buildCalibrationRoster(orgId, cycle, getDB(), false);
  if (!roster.is_complete) {
    throw new ConflictError("Finalized calibration roster is no longer complete");
  }

  return roster.participants.map((participant) => ({
    participant_id: participant.participant_id,
    employee_id: participant.employee_id,
    baseline_rating: participant.baseline_rating as number,
    calibrated_rating: participant.final_rating as number,
    decision_id: participant.latest_decision?.id ?? null,
    decision_version: participant.latest_decision?.version ?? null,
  }));
}
