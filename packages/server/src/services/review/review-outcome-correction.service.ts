import { v4 as uuidv4 } from "uuid";
import type {
  RatingDistribution,
  ReviewCycle,
  ReviewCycleParticipant,
  ReviewOutcome,
  ReviewOutcomeRevision,
} from "@emp-performance/shared";
import { getDB } from "../../db/adapters";
import type { IDataContext } from "../../db/adapters/interface";
import type { ActorContext } from "../../security/actor-context";
import {
  assertOutcomeCorrectionAccess,
  isOutcomeCorrectionGovernor,
} from "../../security/policies/outcome-correction.policy";
import { ConflictError, NotFoundError, ValidationError } from "../../utils/errors";
import { enqueueIntegrationEvent } from "../integration/outbox.service";

export interface ProposeOutcomeCorrectionInput {
  rating: number;
  reason: string;
}

export interface DecideOutcomeCorrectionInput {
  review_note?: string;
}

function validateRating(value: number): number {
  const rating = Number(value);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new ValidationError("Corrected rating must be between 1 and 5");
  }
  return Math.round(rating * 100) / 100;
}

function validateRequiredText(value: string, min: number, max: number, label: string): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ValidationError(`${label} must be between ${min} and ${max} characters`);
  }
  return normalized;
}

function validateOptionalText(value: string | undefined, max: number, label: string): string | null {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > max) {
    throw new ValidationError(`${label} must be ${max} characters or fewer`);
  }
  return normalized;
}

function normalizeRevision(revision: ReviewOutcomeRevision): ReviewOutcomeRevision {
  return {
    ...revision,
    version: Number(revision.version),
    rating: Number(revision.rating),
  };
}

function normalizeRawRows<T>(result: any): T[] {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) return result[0] as T[];
    if (result.length === 0 || typeof result[0] === "object") return result as T[];
  }
  if (result && Array.isArray(result.rows)) return result.rows as T[];
  return [];
}

async function loadOutcome(
  db: IDataContext,
  orgId: number,
  outcomeId: string,
): Promise<ReviewOutcome> {
  const outcome = await db.findOne<ReviewOutcome>("review_outcomes", {
    id: outcomeId,
    organization_id: orgId,
  });
  if (!outcome) throw new NotFoundError("ReviewOutcome", outcomeId);
  return outcome;
}

async function lockOutcome(
  db: IDataContext,
  orgId: number,
  outcomeId: string,
): Promise<ReviewOutcome> {
  await db.raw(
    "SELECT id FROM review_outcomes WHERE id = ? AND organization_id = ? FOR UPDATE",
    [outcomeId, orgId],
  );
  return loadOutcome(db, orgId, outcomeId);
}

async function loadRevision(
  db: IDataContext,
  orgId: number,
  outcomeId: string,
  revisionId: string,
): Promise<ReviewOutcomeRevision> {
  const revision = await db.findOne<ReviewOutcomeRevision>("review_outcome_revisions", {
    id: revisionId,
    organization_id: orgId,
    outcome_id: outcomeId,
  });
  if (!revision) throw new NotFoundError("ReviewOutcomeRevision", revisionId);
  return revision;
}

async function lockRevision(
  db: IDataContext,
  orgId: number,
  outcomeId: string,
  revisionId: string,
): Promise<ReviewOutcomeRevision> {
  await db.raw(
    `SELECT id FROM review_outcome_revisions
      WHERE id = ? AND outcome_id = ? AND organization_id = ? FOR UPDATE`,
    [revisionId, outcomeId, orgId],
  );
  return loadRevision(db, orgId, outcomeId, revisionId);
}

async function recordCorrectionAudit(
  db: IDataContext,
  orgId: number,
  actorId: number,
  revisionId: string,
  action: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
): Promise<void> {
  await db.create("audit_logs", {
    id: uuidv4(),
    organization_id: orgId,
    user_id: actorId,
    action,
    entity_type: "review_outcome_revision",
    entity_id: revisionId,
    // Reasons and decision notes deliberately never enter the audit payload.
    old_values: JSON.stringify(oldValues),
    new_values: JSON.stringify(newValues),
    ip_address: null,
    user_agent: null,
  } as any);
}

function buildDistribution(ratings: number[]): RatingDistribution[] {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const value of ratings) {
    if (!Number.isFinite(value)) continue;
    counts[Math.max(1, Math.min(5, Math.round(value)))] += 1;
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: counts[rating],
    percentage: total > 0 ? Math.round((counts[rating] / total) * 10000) / 100 : 0,
  }));
}

async function refreshCompletedDistribution(
  db: IDataContext,
  orgId: number,
  cycle: ReviewCycle,
): Promise<void> {
  if (cycle.status !== "completed") return;

  const participantRows = normalizeRawRows<{ final_rating: string | number | null }>(
    await db.raw(
      `SELECT p.final_rating
         FROM review_cycle_participants p
         INNER JOIN review_cycles c ON c.id = p.cycle_id
        WHERE p.cycle_id = ? AND c.organization_id = ?
        FOR UPDATE`,
      [cycle.id, orgId],
    ),
  );
  const distribution = buildDistribution(
    participantRows
      .map((participant) => Number(participant.final_rating))
      .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5),
  );

  await db.deleteMany("rating_distributions", {
    organization_id: orgId,
    cycle_id: cycle.id,
  });
  await db.createMany(
    "rating_distributions",
    distribution.map((bucket) => ({
      id: uuidv4(),
      organization_id: orgId,
      cycle_id: cycle.id,
      rating: bucket.rating,
      count: bucket.count,
      percentage: bucket.percentage,
    })),
  );
}

export async function listOutcomeRevisions(
  orgId: number,
  outcomeId: string,
  actor: ActorContext,
): Promise<ReviewOutcomeRevision[]> {
  const db = getDB();
  const outcome = await loadOutcome(db, orgId, outcomeId);
  assertOutcomeCorrectionAccess(actor, "list_revisions", {
    organizationId: orgId,
    employeeId: outcome.employee_id,
  });

  const governor = isOutcomeCorrectionGovernor(actor);
  const result = await db.findMany<ReviewOutcomeRevision>("review_outcome_revisions", {
    filters: {
      organization_id: orgId,
      outcome_id: outcomeId,
      ...(governor ? {} : { status: "applied" }),
    },
    sort: { field: "version", order: "asc" },
    limit: 1000,
  });

  return result.data.map((row) => {
    const revision = normalizeRevision(row);
    return governor
      ? revision
      : {
          ...revision,
          reason: null,
          review_note: null,
          proposed_by: null,
          reviewed_by: null,
        };
  });
}

export async function proposeOutcomeCorrection(
  orgId: number,
  outcomeId: string,
  actor: ActorContext,
  input: ProposeOutcomeCorrectionInput,
): Promise<ReviewOutcomeRevision> {
  const rating = validateRating(input.rating);
  const reason = validateRequiredText(input.reason, 20, 4000, "Correction reason");
  const db = getDB();

  const revision = await db.transaction(async (trx) => {
    const outcome = await lockOutcome(trx, orgId, outcomeId);
    assertOutcomeCorrectionAccess(actor, "propose_correction", {
      organizationId: orgId,
      employeeId: outcome.employee_id,
    });
    if (outcome.appeal_status !== "upheld") {
      throw new ConflictError("A correction can only be proposed after an appeal is upheld");
    }
    if (!outcome.current_revision_id) {
      throw new ConflictError("This review outcome has no effective rating revision");
    }

    const currentRevision = await loadRevision(
      trx,
      orgId,
      outcomeId,
      outcome.current_revision_id,
    );
    if (Number(currentRevision.rating) === rating) {
      throw new ConflictError("The corrected rating must differ from the effective rating");
    }

    const pendingRows = normalizeRawRows<{ id: string }>(
      await trx.raw(
        `SELECT id FROM review_outcome_revisions
          WHERE organization_id = ? AND outcome_id = ? AND status = 'pending'
          FOR UPDATE`,
        [orgId, outcomeId],
      ),
    );
    if (pendingRows.length > 0) {
      throw new ConflictError("This review outcome already has a pending correction");
    }

    const latestRows = normalizeRawRows<{ version: string | number }>(
      await trx.raw(
        `SELECT version FROM review_outcome_revisions
          WHERE organization_id = ? AND outcome_id = ?
          ORDER BY version DESC LIMIT 1 FOR UPDATE`,
        [orgId, outcomeId],
      ),
    );
    const now = new Date();
    const created = await trx.create<ReviewOutcomeRevision>("review_outcome_revisions", {
      id: uuidv4(),
      organization_id: orgId,
      outcome_id: outcomeId,
      version: Number(latestRows[0]?.version ?? currentRevision.version) + 1,
      rating,
      source: "appeal_correction",
      status: "pending",
      reason,
      proposed_by: actor.userId,
      proposed_at: now as any,
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      supersedes_revision_id: outcome.current_revision_id,
    });
    await recordCorrectionAudit(
      trx,
      orgId,
      actor.userId,
      created.id,
      "review_outcome.correction_proposed",
      { status: null, effective_revision_id: outcome.current_revision_id },
      {
        status: "pending",
        outcome_id: outcomeId,
        version: created.version,
        proposed_rating: rating,
        reason_present: true,
      },
    );
    return created;
  });

  return normalizeRevision(revision);
}

export async function approveOutcomeCorrection(
  orgId: number,
  outcomeId: string,
  revisionId: string,
  actor: ActorContext,
  input: DecideOutcomeCorrectionInput = {},
): Promise<ReviewOutcomeRevision> {
  const reviewNote = validateOptionalText(input.review_note, 4000, "Review note");
  const db = getDB();

  const revision = await db.transaction(async (trx) => {
    const outcome = await lockOutcome(trx, orgId, outcomeId);
    const pending = await lockRevision(trx, orgId, outcomeId, revisionId);
    assertOutcomeCorrectionAccess(actor, "approve_correction", {
      organizationId: orgId,
      employeeId: outcome.employee_id,
      proposedBy: pending.proposed_by,
    });
    if (pending.status !== "pending") {
      throw new ConflictError("Only a pending correction can be approved");
    }
    if (!outcome.current_revision_id) {
      throw new ConflictError("This review outcome has no effective rating revision");
    }
    if (pending.supersedes_revision_id !== outcome.current_revision_id) {
      throw new ConflictError("This correction no longer targets the effective revision");
    }

    // Cycle-level locking serializes distribution refreshes before any
    // participant rating is changed, preventing cross-outcome lost updates.
    await trx.raw(
      "SELECT id FROM review_cycles WHERE id = ? AND organization_id = ? FOR UPDATE",
      [outcome.cycle_id, orgId],
    );
    const cycle = await trx.findOne<ReviewCycle>("review_cycles", {
      id: outcome.cycle_id,
      organization_id: orgId,
    });
    if (!cycle) throw new NotFoundError("ReviewCycle", outcome.cycle_id);
    const participant = await trx.findOne<ReviewCycleParticipant>(
      "review_cycle_participants",
      {
        id: outcome.participant_id,
        cycle_id: outcome.cycle_id,
        employee_id: outcome.employee_id,
      },
    );
    if (!participant) throw new NotFoundError("ReviewCycleParticipant", outcome.participant_id);

    const now = new Date();
    const applied = await trx.update<ReviewOutcomeRevision>(
      "review_outcome_revisions",
      revisionId,
      {
        status: "applied",
        reviewed_by: actor.userId,
        reviewed_at: now as any,
        review_note: reviewNote,
      },
    );
    await trx.update<ReviewOutcome>("review_outcomes", outcomeId, {
      current_revision_id: revisionId,
    });
    await trx.update<ReviewCycleParticipant>(
      "review_cycle_participants",
      outcome.participant_id,
      { final_rating: Number(pending.rating) },
    );
    await refreshCompletedDistribution(trx, orgId, cycle);

    await trx.create("notifications", {
      id: uuidv4(),
      organization_id: orgId,
      user_id: outcome.employee_id,
      type: "review_outcome_correction_applied",
      title: "Your performance review rating was corrected",
      body: "An approved appeal correction has been applied to your performance review outcome.",
      link: `/my/performance/reviews/${outcomeId}`,
      is_read: false,
      read_at: null,
    } as any);
    await recordCorrectionAudit(
      trx,
      orgId,
      actor.userId,
      revisionId,
      "review_outcome.correction_applied",
      {
        status: "pending",
        effective_revision_id: outcome.current_revision_id,
        effective_rating: Number(participant.final_rating),
      },
      {
        status: "applied",
        outcome_id: outcomeId,
        version: pending.version,
        effective_revision_id: revisionId,
        effective_rating: Number(pending.rating),
        review_note_present: reviewNote !== null,
        released_rating_unchanged: Number(outcome.released_rating),
      },
    );
    await enqueueIntegrationEvent(trx, {
      organizationId: orgId,
      eventType: "performance.review_outcome.correction_applied",
      aggregateType: "review_outcome",
      aggregateId: outcomeId,
      idempotencyKey: `performance.review_outcome.correction_applied:${outcomeId}:v${pending.version}`,
      payload: {
        event: "performance.review_outcome.correction_applied",
        source: "emp-performance",
        timestamp: now.toISOString(),
        data: {
          organizationId: orgId,
          outcomeId,
          cycleId: outcome.cycle_id,
          participantId: outcome.participant_id,
          employeeId: outcome.employee_id,
          revisionId,
          version: Number(pending.version),
          rating: Number(pending.rating),
        },
      },
    });
    return applied;
  });

  return normalizeRevision(revision);
}

export async function rejectOutcomeCorrection(
  orgId: number,
  outcomeId: string,
  revisionId: string,
  actor: ActorContext,
  input: Required<DecideOutcomeCorrectionInput>,
): Promise<ReviewOutcomeRevision> {
  const reviewNote = validateRequiredText(
    input.review_note,
    20,
    4000,
    "Rejection note",
  );
  const db = getDB();

  const revision = await db.transaction(async (trx) => {
    const outcome = await lockOutcome(trx, orgId, outcomeId);
    const pending = await lockRevision(trx, orgId, outcomeId, revisionId);
    assertOutcomeCorrectionAccess(actor, "reject_correction", {
      organizationId: orgId,
      employeeId: outcome.employee_id,
      proposedBy: pending.proposed_by,
    });
    if (pending.status !== "pending") {
      throw new ConflictError("Only a pending correction can be rejected");
    }

    const now = new Date();
    const rejected = await trx.update<ReviewOutcomeRevision>(
      "review_outcome_revisions",
      revisionId,
      {
        status: "rejected",
        reviewed_by: actor.userId,
        reviewed_at: now as any,
        review_note: reviewNote,
      },
    );
    await recordCorrectionAudit(
      trx,
      orgId,
      actor.userId,
      revisionId,
      "review_outcome.correction_rejected",
      { status: "pending" },
      {
        status: "rejected",
        outcome_id: outcomeId,
        version: pending.version,
        review_note_present: true,
        effective_revision_id: outcome.current_revision_id,
      },
    );
    return rejected;
  });

  return normalizeRevision(revision);
}
