import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import type { IDataContext } from "../../db/adapters/interface";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { findUserById } from "../../db/empcloud";
import { enqueueIntegrationEvent } from "../integration/outbox.service";
import { getFinalizedCalibrationRatings } from "./calibration.service";
import { createReviewOutcomesForRelease } from "./review-outcome.service";
import type {
  CompetencyFramework,
  ReviewCycle,
  ReviewCycleParticipant,
  ReviewCycleStatus,
  RatingDistribution,
  Review,
} from "@emp-performance/shared";

type ParticipantInput = { employee_id: number; manager_id?: number };

async function assertUsableFramework(
  orgId: number,
  frameworkId: string,
  db: IDataContext = getDB(),
): Promise<CompetencyFramework> {
  const framework = await db.findOne<CompetencyFramework>("competency_frameworks", {
    id: frameworkId,
    organization_id: orgId,
    is_active: true,
    deleted_at: null,
  });
  if (!framework) {
    throw new ValidationError("Framework must be active and belong to this organization");
  }
  return framework;
}

async function getValidatedParticipant(
  orgId: number,
  input: ParticipantInput,
): Promise<{ employee_id: number; manager_id: number | null }> {
  const employee = await findUserById(input.employee_id);
  if (!employee || employee.organization_id !== orgId || employee.status !== 1) {
    throw new ValidationError("Participant must be an active user in this organization");
  }

  const expectedManagerId = employee.reporting_manager_id ?? null;
  const managerId = input.manager_id ?? expectedManagerId;
  if (input.manager_id !== undefined && input.manager_id !== expectedManagerId) {
    throw new ValidationError("Participant manager must match the employee's reporting manager");
  }
  if (managerId === input.employee_id) {
    throw new ValidationError("An employee cannot be their own manager");
  }
  if (managerId !== null) {
    const manager = await findUserById(managerId);
    if (!manager || manager.organization_id !== orgId || manager.status !== 1) {
      throw new ValidationError("Participant manager must be an active user in this organization");
    }
  }

  return { employee_id: input.employee_id, manager_id: managerId };
}

async function assertStoredParticipantRelationship(
  orgId: number,
  participant: ReviewCycleParticipant,
): Promise<void> {
  const validated = await getValidatedParticipant(orgId, {
    employee_id: participant.employee_id,
    manager_id: participant.manager_id ?? undefined,
  });
  if (validated.manager_id !== participant.manager_id) {
    throw new ValidationError(
      "Participant manager is out of date; remove and re-add the participant before launch",
    );
  }
}

// Columns that may be used in an ORDER BY for the cycle list. Anything not in
// this set falls back to created_at, preventing SQL injection through the
// client-supplied `sort` query param (#R3).
const CYCLE_SORTABLE_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "name",
  "type",
  "status",
  "start_date",
  "end_date",
  "review_deadline",
]);

// ---------------------------------------------------------------------------
// Cycle CRUD
// ---------------------------------------------------------------------------

export async function createCycle(
  orgId: number,
  data: {
    name: string;
    type: string;
    start_date: string;
    end_date: string;
    review_deadline?: string;
    framework_id?: string;
    description?: string;
  },
  createdBy: number,
): Promise<ReviewCycle> {
  const db = getDB();

  // End date must not precede start date — guard the DB write so the API
  // returns a clear validation error instead of letting an invalid range
  // through (#11).
  if (data.end_date < data.start_date) {
    throw new ValidationError("End date cannot be before start date");
  }
  if (data.review_deadline && data.review_deadline < data.start_date) {
    throw new ValidationError("Review deadline cannot be before start date");
  }
  if (data.framework_id) {
    await assertUsableFramework(orgId, data.framework_id);
  }

  const record: Record<string, any> = {
    id: uuidv4(),
    organization_id: orgId,
    name: data.name,
    type: data.type,
    status: "draft",
    start_date: data.start_date,
    end_date: data.end_date,
    review_deadline: data.review_deadline ?? null,
    framework_id: data.framework_id ?? null,
    description: data.description ?? null,
    created_by: createdBy,
  };
  return db.create<ReviewCycle>("review_cycles", record as any);
}

export async function listCycles(
  orgId: number,
  params: {
    page?: number;
    perPage?: number;
    status?: string;
    type?: string;
    search?: string;
    sort?: string;
    order?: "asc" | "desc";
  },
): Promise<{ data: (ReviewCycle & { participant_count: number })[]; total: number; page: number; perPage: number }> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.status) filters.status = params.status;
  if (params.type) filters.type = params.type;

  const search = (params.search ?? "").trim();
  let result: { data: ReviewCycle[]; total: number; page: number; perPage: number; totalPages: number };

  if (search) {
    // The shared findMany helper has no LIKE support, so fall through to a
    // raw query for free-text search on name/description (#13).
    const offset = (page - 1) * perPage;
    const where: string[] = ["organization_id = ?"];
    const args: any[] = [orgId];
    if (params.status) {
      where.push("status = ?");
      args.push(params.status);
    }
    if (params.type) {
      where.push("type = ?");
      args.push(params.type);
    }
    where.push("(name LIKE ? OR description LIKE ?)");
    const term = `%${search}%`;
    args.push(term, term);

    // Whitelist the sort column and bind the direction so neither can be used
    // to inject SQL through the ORDER BY clause (#R3).
    const orderField = CYCLE_SORTABLE_COLUMNS.has(params.sort ?? "")
      ? (params.sort as string)
      : "created_at";
    const orderDir = (params.order ?? "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";

    const rowsRes = await db.raw<any>(
      `SELECT * FROM review_cycles WHERE ${where.join(" AND ")} ORDER BY ${orderField} ${orderDir} LIMIT ? OFFSET ?`,
      [...args, perPage, offset],
    );
    const totalRes = await db.raw<any>(
      `SELECT COUNT(*) AS c FROM review_cycles WHERE ${where.join(" AND ")}`,
      args,
    );
    const rows = (Array.isArray(rowsRes) ? rowsRes[0] || rowsRes : []) as any[];
    const totalRows = (Array.isArray(totalRes) ? totalRes[0] || totalRes : []) as any[];
    const total = Number(totalRows?.[0]?.c ?? 0);
    result = {
      data: rows as ReviewCycle[],
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    };
  } else {
    const queryResult = await db.findMany<ReviewCycle>("review_cycles", {
      page,
      limit: perPage,
      filters,
      sort: params.sort
        ? { field: params.sort, order: params.order ?? "desc" }
        : { field: "created_at", order: "desc" },
    });
    result = {
      data: queryResult.data,
      total: queryResult.total,
      page: queryResult.page,
      perPage: queryResult.limit,
      totalPages: queryResult.totalPages,
    };
  }

  // Attach participant counts
  const cyclesWithCounts = await Promise.all(
    result.data.map(async (cycle) => {
      const count = await db.count("review_cycle_participants", { cycle_id: cycle.id });
      return { ...cycle, participant_count: count };
    }),
  );

  return { data: cyclesWithCounts, total: result.total, page, perPage };
}

export async function getCycle(
  orgId: number,
  id: string,
): Promise<ReviewCycle & { participant_count: number; stats: { pending: number; submitted: number; draft: number } }> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", id);

  const participantCount = await db.count("review_cycle_participants", { cycle_id: id });

  // Review stats
  const pending = await db.count("reviews", { cycle_id: id, organization_id: orgId, status: "pending" });
  const draft = await db.count("reviews", { cycle_id: id, organization_id: orgId, status: "draft" });
  const submitted = await db.count("reviews", { cycle_id: id, organization_id: orgId, status: "submitted" });

  return {
    ...cycle,
    participant_count: participantCount,
    stats: { pending, submitted, draft },
  };
}

export async function updateCycle(
  orgId: number,
  id: string,
  data: Record<string, any>,
): Promise<ReviewCycle> {
  const db = getDB();
  return db.transaction(async (trx) => {
    await trx.raw(
      "SELECT id FROM review_cycles WHERE id = ? AND organization_id = ? FOR UPDATE",
      [id, orgId],
    );
    const existing = await trx.findOne<ReviewCycle>("review_cycles", {
      id,
      organization_id: orgId,
    });
    if (!existing) throw new NotFoundError("ReviewCycle", id);
    if (existing.status === "completed" || existing.status === "cancelled") {
      throw new ValidationError("Cannot update a completed or cancelled cycle");
    }

  if (
    Object.prototype.hasOwnProperty.call(data, "status") &&
    data.status !== existing.status
  ) {
    throw new ValidationError("Cycle status must be changed through a lifecycle action");
  }

  const nextStartDate = data.start_date ?? existing.start_date;
  const nextEndDate = data.end_date ?? existing.end_date;
  const nextReviewDeadline = data.review_deadline ?? existing.review_deadline;
  if (nextEndDate < nextStartDate) {
    throw new ValidationError("End date cannot be before start date");
  }
  if (nextReviewDeadline && nextReviewDeadline < nextStartDate) {
    throw new ValidationError("Review deadline cannot be before start date");
  }

  const changesFramework =
    Object.prototype.hasOwnProperty.call(data, "framework_id") &&
    (data.framework_id ?? null) !== existing.framework_id;
  if (changesFramework) {
    if (existing.status !== "draft") {
      throw new ValidationError("Framework can only be changed while the cycle is in draft");
    }
    const reviewCount = await trx.count("reviews", {
      organization_id: orgId,
      cycle_id: id,
    });
    if (reviewCount > 0) {
      throw new ValidationError("Framework cannot be changed after reviews have been created");
    }
  }

  const effectiveFrameworkId = Object.prototype.hasOwnProperty.call(data, "framework_id")
    ? (data.framework_id as string | null | undefined)
    : existing.framework_id;
  if (effectiveFrameworkId) {
    await assertUsableFramework(orgId, effectiveFrameworkId, trx);
  }

    return trx.update<ReviewCycle>("review_cycles", id, data as any);
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// Delete a cycle that hasn't started yet. Block deletion of active cycles
// so we don't drop reviews mid-flight.
export async function deleteCycle(orgId: number, id: string): Promise<void> {
  const db = getDB();
  await db.transaction(async (trx) => {
    await trx.raw(
      "SELECT id FROM review_cycles WHERE id = ? AND organization_id = ? FOR UPDATE",
      [id, orgId],
    );
    const cycle = await trx.findOne<ReviewCycle>("review_cycles", {
      id,
      organization_id: orgId,
    });
    if (!cycle) throw new NotFoundError("ReviewCycle", id);
    if (cycle.status !== "draft") {
      throw new ValidationError("Only draft cycles can be deleted");
    }
    await trx.delete("review_cycles", id);
  });
}

export async function launchCycle(orgId: number, id: string): Promise<ReviewCycle> {
  const db = getDB();
  return db.transaction(async (trx) => {
    await trx.raw(
      "SELECT id FROM review_cycles WHERE id = ? AND organization_id = ? FOR UPDATE",
      [id, orgId],
    );
    const cycle = await trx.findOne<ReviewCycle>("review_cycles", {
      id,
      organization_id: orgId,
    });
    if (!cycle) throw new NotFoundError("ReviewCycle", id);
    if (cycle.status !== "draft") {
      throw new ValidationError("Only draft cycles can be launched");
    }
    if (cycle.framework_id) {
      await assertUsableFramework(orgId, cycle.framework_id, trx);
    }

    const participants = await trx.findMany<ReviewCycleParticipant>("review_cycle_participants", {
      filters: { cycle_id: id },
      limit: 100000,
    });
    if (participants.data.length === 0) {
      throw new ValidationError("Cannot launch a cycle with no participants");
    }
    for (const participant of participants.data) {
      await assertStoredParticipantRelationship(orgId, participant);
    }

  // Generate the review rows for every participant so reviewers actually have
  // something to fill in once the cycle is live (#R2). Previously launch only
  // flipped the status and no reviews were ever created. Generate while the
  // cycle is still draft so any failure leaves it closed to reviewers and a
  // retry can safely fill only the missing idempotent rows.
    await generateReviewsForCycle(orgId, id, participants.data, trx);
    return trx.update<ReviewCycle>("review_cycles", id, { status: "active" } as any);
  });
}

// Creates the self + manager (+ approved peer) review rows for each cycle
// participant. Idempotent: skips any (employee, reviewer, type) tuple that
// already exists, so re-running after adding participants is safe.
export async function generateReviewsForCycle(
  orgId: number,
  cycleId: string,
  participantRows?: ReviewCycleParticipant[],
  context?: IDataContext,
): Promise<number> {
  const db = context ?? getDB();

  const participants = participantRows
    ? { data: participantRows }
    : await db.findMany<ReviewCycleParticipant>("review_cycle_participants", {
        filters: { cycle_id: cycleId },
        limit: 100000,
      });

  // Approved peer nominations grouped by employee.
  const approvedPeers = await db.findMany<{ employee_id: number; nominee_id: number }>(
    "peer_review_nominations",
    { filters: { cycle_id: cycleId, status: "approved" }, limit: 100000 },
  );
  const peersByEmployee = new Map<number, number[]>();
  for (const nom of approvedPeers.data) {
    const list = peersByEmployee.get(nom.employee_id) ?? [];
    list.push(nom.nominee_id);
    peersByEmployee.set(nom.employee_id, list);
  }

  let created = 0;
  for (const participant of participants.data) {
    const targets: { reviewer_id: number; type: string }[] = [
      { reviewer_id: participant.employee_id, type: "self" },
    ];
    if (participant.manager_id) {
      targets.push({ reviewer_id: participant.manager_id, type: "manager" });
    }
    for (const peerId of peersByEmployee.get(participant.employee_id) ?? []) {
      targets.push({ reviewer_id: peerId, type: "peer" });
    }

    for (const t of targets) {
      const existing = await db.findOne<Review>("reviews", {
        cycle_id: cycleId,
        employee_id: participant.employee_id,
        reviewer_id: t.reviewer_id,
        type: t.type,
        organization_id: orgId,
      });
      if (existing) continue;

      try {
        await db.create<Review>("reviews", {
          id: uuidv4(),
          organization_id: orgId,
          cycle_id: cycleId,
          employee_id: participant.employee_id,
          reviewer_id: t.reviewer_id,
          type: t.type,
          status: "pending",
          overall_rating: null,
          summary: null,
          strengths: null,
          improvements: null,
          submitted_at: null,
        } as any);
        created++;
      } catch (error) {
        // A concurrent launch/add-participant request may create the same
        // unique assignment after the pre-check. Treat that winner as an
        // idempotent success while preserving unrelated persistence errors.
        const concurrent = await db.findOne<Review>("reviews", {
          cycle_id: cycleId,
          employee_id: participant.employee_id,
          reviewer_id: t.reviewer_id,
          type: t.type,
          organization_id: orgId,
        });
        if (!concurrent) throw error;
      }
    }
  }

  return created;
}

export async function closeCycle(
  orgId: number,
  id: string,
  releasedBy: number,
): Promise<ReviewCycle> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", id);
  // POST /close is an idempotent release command. A caller may legitimately
  // retry after the first response is lost; returning the already-released
  // resource avoids reporting a false failure for a successful publication.
  if (cycle.status === "completed") return cycle;
  if (cycle.status !== "calibration") {
    throw new ValidationError("Only a cycle in calibration can be released");
  }

  // Finalization freezes the append-only calibration inputs. Fetching them
  // before the transaction is safe because further decisions are rejected
  // after calibration_finalized_at is set.
  const finalRatings = await getFinalizedCalibrationRatings(orgId, id);
  const distribution = buildRatingDistribution(
    finalRatings.map((rating) => rating.calibrated_rating),
  );

  const closedCycle = await db.transaction(async (trx) => {
    // Re-check the release boundary inside the transaction so concurrent close
    // requests cannot both publish a cycle.
    await trx.raw(
      "SELECT id FROM review_cycles WHERE id = ? AND organization_id = ? FOR UPDATE",
      [id, orgId],
    );
    const current = await trx.findOne<ReviewCycle>("review_cycles", {
      id,
      organization_id: orgId,
    });
    if (!current) throw new NotFoundError("ReviewCycle", id);
    if (current.status === "completed") return current;
    if (current.status !== "calibration" || !current.calibration_finalized_at) {
      throw new ValidationError(
        "Calibration must be finalized before the cycle can be released",
      );
    }

    const lockedParticipants = await trx.findMany<ReviewCycleParticipant>(
      "review_cycle_participants",
      { filters: { cycle_id: id }, limit: 100000 },
    );
    const releasedRoster = new Map(
      finalRatings.map((rating) => [rating.participant_id, rating.employee_id]),
    );
    const rosterMatchesSnapshot =
      lockedParticipants.data.length === releasedRoster.size &&
      lockedParticipants.data.every(
        (participant) => releasedRoster.get(participant.id) === participant.employee_id,
      );
    if (!rosterMatchesSnapshot) {
      throw new ValidationError(
        "Cycle participants changed after calibration finalization; finalize calibration again before release",
      );
    }

    for (const rating of finalRatings) {
      await trx.update("review_cycle_participants", rating.participant_id, {
        final_rating: rating.calibrated_rating,
        status: "completed",
      } as any);
    }

    await persistRatingDistribution(trx, orgId, id, distribution);

    const releasedAt = new Date();
    const outcomes = await createReviewOutcomesForRelease(
      trx,
      orgId,
      id,
      finalRatings.map((rating) => ({
        participant_id: rating.participant_id,
        employee_id: rating.employee_id,
        released_rating: rating.calibrated_rating,
      })),
      releasedAt,
    );

    await trx.createMany(
      "notifications",
      outcomes.map((outcome) => ({
        id: uuidv4(),
        organization_id: orgId,
        user_id: outcome.employee_id,
        type: "review_outcome_released",
        title: `${current.name} results are available`,
        body: "Review your released outcome, acknowledge receipt, or submit an appeal within the stated window.",
        link: `/my/performance/reviews/${outcome.id}`,
        is_read: false,
        read_at: null,
      })),
    );

    const released = await trx.update<ReviewCycle>("review_cycles", id, {
      status: "completed",
    } as any);

    await trx.create("audit_logs", {
      id: uuidv4(),
      organization_id: orgId,
      user_id: releasedBy,
      action: "review_cycle.ratings_released",
      entity_type: "review_cycle",
      entity_id: id,
      old_values: JSON.stringify({ status: current.status }),
      new_values: JSON.stringify({
        status: "completed",
        calibration_finalized_at: current.calibration_finalized_at,
        calibration_snapshot_hash: current.calibration_snapshot_hash,
        participant_count: finalRatings.length,
        distribution,
        outcome_ids: outcomes.map((outcome) => outcome.id),
        ratings: finalRatings.map((rating) => ({
          participant_id: rating.participant_id,
          employee_id: rating.employee_id,
          baseline_rating: rating.baseline_rating,
          released_rating: rating.calibrated_rating,
          decision_id: rating.decision_id,
          decision_version: rating.decision_version,
        })),
      }),
      ip_address: null,
      user_agent: null,
    } as any);

    await enqueueIntegrationEvent(trx, {
      organizationId: orgId,
      eventType: "performance.cycle_completed",
      aggregateType: "review_cycle",
      aggregateId: id,
      idempotencyKey: `performance.cycle_completed:${id}:v1`,
      payload: {
        event: "performance.cycle_completed",
        source: "emp-performance",
        timestamp: releasedAt.toISOString(),
        data: {
          organizationId: orgId,
          cycleId: id,
          cycleName: current.name,
          participantCount: finalRatings.length,
          outcomes: outcomes.map((outcome) => ({
            outcomeId: outcome.id,
            employeeId: outcome.employee_id,
          })),
        },
      },
    });

    return released;
  });

  return closedCycle;
}

// Move a cycle into an explicit intermediate workflow state. Allowed forward
// transitions: active -> in_review -> calibration (#R8).
const FORWARD_TRANSITIONS: Record<string, string[]> = {
  active: ["in_review"],
  in_review: ["calibration"],
  calibration: [],
};

export async function transitionCycle(
  orgId: number,
  id: string,
  toStatus: "in_review" | "calibration",
  transitionedBy: number,
): Promise<ReviewCycle> {
  const db = getDB();
  return db.transaction(async (trx) => {
    await trx.raw(
      "SELECT id FROM review_cycles WHERE id = ? AND organization_id = ? FOR UPDATE",
      [id, orgId],
    );
    const cycle = await trx.findOne<ReviewCycle>("review_cycles", {
      id,
      organization_id: orgId,
    });
    if (!cycle) throw new NotFoundError("ReviewCycle", id);

    const allowed = FORWARD_TRANSITIONS[cycle.status] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new ValidationError(
        `Cannot move a '${cycle.status}' cycle to '${toStatus}'`,
      );
    }

    if (toStatus === "calibration") {
      await assertRequiredReviewsReady(trx, orgId, id);
    }

    const transitioned = await trx.update<ReviewCycle>("review_cycles", id, {
      status: toStatus,
    } as any);
    await trx.create("audit_logs", {
      id: uuidv4(),
      organization_id: orgId,
      user_id: transitionedBy,
      action: "review_cycle.status_transitioned",
      entity_type: "review_cycle",
      entity_id: id,
      old_values: JSON.stringify({ status: cycle.status }),
      new_values: JSON.stringify({ status: toStatus }),
      ip_address: null,
      user_agent: null,
    } as any);

    return transitioned;
  });
}

async function assertRequiredReviewsReady(
  db: IDataContext,
  orgId: number,
  cycleId: string,
): Promise<void> {
  const [participants, reviews] = await Promise.all([
    db.findMany<ReviewCycleParticipant>("review_cycle_participants", {
      filters: { cycle_id: cycleId },
      limit: 100000,
    }),
    db.findMany<Review>("reviews", {
      filters: { organization_id: orgId, cycle_id: cycleId },
      limit: 100000,
    }),
  ]);

  const incomplete = new Set<string>();
  for (const participant of participants.data) {
    const required = [
      { type: "self", reviewerId: participant.employee_id },
      ...(participant.manager_id
        ? [{ type: "manager", reviewerId: participant.manager_id }]
        : []),
    ];
    for (const assignment of required) {
      const valid = reviews.data.some((review) => {
        const rating = Number(review.overall_rating);
        return (
          review.employee_id === participant.employee_id &&
          review.reviewer_id === assignment.reviewerId &&
          review.type === assignment.type &&
          review.status === "submitted" &&
          Number.isFinite(rating) &&
          rating >= 1 &&
          rating <= 5
        );
      });
      if (!valid) incomplete.add(`${participant.employee_id}:${assignment.type}`);
    }

    for (const review of reviews.data.filter(
      (candidate) => candidate.employee_id === participant.employee_id,
    )) {
      const rating = Number(review.overall_rating);
      if (
        review.status !== "submitted" ||
        !Number.isFinite(rating) ||
        rating < 1 ||
        rating > 5
      ) {
        incomplete.add(`${participant.employee_id}:${review.type}:${review.id}`);
      }
    }
  }

  if (participants.data.length === 0 || incomplete.size > 0) {
    throw new ValidationError(
      `Cannot start calibration while ${Math.max(incomplete.size, 1)} required review assignment(s) are incomplete or invalid`,
    );
  }
}

// Completed cycles are the feedback-release boundary. Reopening would make
// already-visible results disappear and would undermine the audit trail. A
// future correction flow should create a versioned amendment instead.
export async function reopenCycle(orgId: number, id: string): Promise<ReviewCycle> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", id);
  if (cycle.status !== "completed") {
    throw new ValidationError("Only completed cycles can be reopened");
  }

  throw new ValidationError(
    "Completed review cycles are final; create a correction cycle instead of reopening released results",
  );
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export async function addParticipants(
  orgId: number,
  cycleId: string,
  participants: ParticipantInput[],
): Promise<ReviewCycleParticipant[]> {
  const db = getDB();
  return db.transaction(async (trx) => {
    await trx.raw(
      "SELECT id FROM review_cycles WHERE id = ? AND organization_id = ? FOR UPDATE",
      [cycleId, orgId],
    );
    const cycle = await trx.findOne<ReviewCycle>("review_cycles", {
      id: cycleId,
      organization_id: orgId,
    });
    if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);
    if (cycle.status !== "draft" && cycle.status !== "active") {
      throw new ValidationError("Can only add participants to draft or active cycles");
    }

    const created: ReviewCycleParticipant[] = [];
    for (const p of participants) {
      // Skip duplicates
      const existing = await trx.findOne<ReviewCycleParticipant>("review_cycle_participants", {
        cycle_id: cycleId,
        employee_id: p.employee_id,
      });
      if (existing) continue;

      const validated = await getValidatedParticipant(orgId, p);

      const record: Record<string, any> = {
        id: uuidv4(),
        cycle_id: cycleId,
        employee_id: validated.employee_id,
        manager_id: validated.manager_id,
        status: "pending",
      };
      try {
        const participant = await trx.create<ReviewCycleParticipant>(
          "review_cycle_participants",
          record as any,
        );
        created.push(participant);
      } catch (error) {
        // The assignment tuple is unique. Treat a concurrent request that won
        // the insert as the same idempotent outcome; surface genuine DB errors.
        const concurrent = await trx.findOne<ReviewCycleParticipant>("review_cycle_participants", {
          cycle_id: cycleId,
          employee_id: p.employee_id,
        });
        if (!concurrent) throw error;
      }
    }

  // If the cycle is already launched, generate the review rows for the newly
  // added participants too — otherwise reviews only ever get created by
  // launchCycle, so someone added to an active cycle got a participant row but
  // zero self/manager/peer reviews and could never be reviewed (audit M2).
  // generateReviewsForCycle is idempotent (skips existing tuples).
    if (cycle.status === "active") {
      await generateReviewsForCycle(orgId, cycleId, undefined, trx);
    }

    return created;
  });
}

export type ParticipantWithNames = ReviewCycleParticipant & {
  employee_name: string | null;
  manager_name: string | null;
};

export async function listParticipants(
  orgId: number,
  cycleId: string,
  params: {
    page?: number;
    perPage?: number;
    status?: string;
    search?: string;
  } = {},
): Promise<{ data: ParticipantWithNames[]; total: number; page: number; perPage: number }> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  const filters: Record<string, any> = { cycle_id: cycleId };
  if (params.status) filters.status = params.status;

  const result = await db.findMany<ReviewCycleParticipant>("review_cycle_participants", {
    page,
    limit: perPage,
    filters,
    sort: { field: "created_at", order: "desc" },
  });

  // Resolve EmpCloud names so the UI does not have to render raw ids (#R7/#R6).
  const ids = new Set<number>();
  for (const p of result.data) {
    ids.add(p.employee_id);
    if (p.manager_id) ids.add(p.manager_id);
  }
  const nameMap = await resolveUserNames(orgId, [...ids]);

  let withNames: ParticipantWithNames[] = result.data.map((p) => ({
    ...p,
    employee_name: nameMap.get(p.employee_id) ?? null,
    manager_name: p.manager_id ? nameMap.get(p.manager_id) ?? null : null,
  }));

  // Free-text search runs over the resolved names + ids for the current page
  // worth of rows. (Participant counts per cycle are bounded, so an in-memory
  // filter is acceptable and keeps name resolution in one place.)
  const search = (params.search ?? "").trim().toLowerCase();
  let total = result.total;
  if (search) {
    const allRows = await db.findMany<ReviewCycleParticipant>("review_cycle_participants", {
      filters,
      limit: 100000,
    });
    const allIds = new Set<number>();
    for (const p of allRows.data) {
      allIds.add(p.employee_id);
      if (p.manager_id) allIds.add(p.manager_id);
    }
    const allNames = await resolveUserNames(orgId, [...allIds]);
    const matched = allRows.data
      .map((p) => ({
        ...p,
        employee_name: allNames.get(p.employee_id) ?? null,
        manager_name: p.manager_id ? allNames.get(p.manager_id) ?? null : null,
      }))
      .filter((p) => {
        const hay = `${p.employee_name ?? ""} ${p.manager_name ?? ""} ${p.employee_id} ${p.manager_id ?? ""}`.toLowerCase();
        return hay.includes(search);
      });
    total = matched.length;
    const start = (page - 1) * perPage;
    withNames = matched.slice(start, start + perPage);
  }

  return { data: withNames, total, page, perPage };
}

// Resolve a set of EmpCloud user ids to "First Last" display names, scoped to
// the org. Missing/foreign users resolve to null. Lookups are best-effort:
// if the EmpCloud DB is unavailable we degrade to ids only.
async function resolveUserNames(orgId: number, ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const user = await findUserById(id);
        if (user && user.organization_id === orgId) {
          map.set(id, `${user.first_name} ${user.last_name}`.trim());
        }
      } catch {
        // ignore — leave unresolved
      }
    }),
  );
  return map;
}

export async function removeParticipant(
  orgId: number,
  cycleId: string,
  participantId: string,
): Promise<void> {
  const db = getDB();
  await db.transaction(async (trx) => {
    await trx.raw(
      "SELECT id FROM review_cycles WHERE id = ? AND organization_id = ? FOR UPDATE",
      [cycleId, orgId],
    );
    const cycle = await trx.findOne<ReviewCycle>("review_cycles", {
      id: cycleId,
      organization_id: orgId,
    });
    if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);
    if (cycle.status !== "draft") {
      throw new ValidationError("Can only remove participants from draft cycles");
    }

    const participant = await trx.findOne<ReviewCycleParticipant>("review_cycle_participants", {
      id: participantId,
      cycle_id: cycleId,
    });
    if (!participant) throw new NotFoundError("Participant", participantId);

  // Draft peer approvals may already have produced canonical assignments.
  // Preserve that review history and prevent orphaned rows; an administrator
  // must resolve the assignments/nominations before removing the participant.
    const existingReview = await trx.findOne<Review>("reviews", {
      organization_id: orgId,
      cycle_id: cycleId,
      employee_id: participant.employee_id,
    });
    const existingNomination = await trx.findOne("peer_review_nominations", {
      cycle_id: cycleId,
      employee_id: participant.employee_id,
    });
    if (existingReview || existingNomination) {
      throw new ValidationError(
        "Cannot remove a participant with review assignments or peer nominations",
      );
    }

    await trx.delete("review_cycle_participants", participantId);
  });
}

// ---------------------------------------------------------------------------
// Ratings Distribution (bell-curve data)
// ---------------------------------------------------------------------------

export async function getRatingsDistribution(
  orgId: number,
  cycleId: string,
): Promise<RatingDistribution[]> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  // Completed cycles read the persisted snapshot written at close time, so we
  // don't recompute over potentially thousands of reviews on each request (#R11).
  if (cycle.status === "completed") {
    const persisted = await db.findMany<RatingDistribution & { rating: number }>(
      "rating_distributions",
      { filters: { organization_id: orgId, cycle_id: cycleId }, limit: 10 },
    );
    if (persisted.data.length > 0) {
      const byRating = new Map<number, RatingDistribution>();
      for (const row of persisted.data) {
        byRating.set(row.rating, {
          rating: row.rating,
          count: row.count,
          percentage: Number(row.percentage),
        });
      }
      return [1, 2, 3, 4, 5].map(
        (rating) => byRating.get(rating) ?? { rating, count: 0, percentage: 0 },
      );
    }
  }

  return computeRatingDistribution(orgId, cycleId);
}

// Compute the live 1-5 bell-curve distribution from one baseline rating per
// participant. Counting reviewer rows directly lets employees with more peer
// reviewers distort the organization-level curve.
async function computeRatingDistribution(
  orgId: number,
  cycleId: string,
): Promise<RatingDistribution[]> {
  const db = getDB();
  const [participants, reviews] = await Promise.all([
    db.findMany<ReviewCycleParticipant>("review_cycle_participants", {
      filters: { cycle_id: cycleId },
      limit: 100000,
    }),
    db.findMany<Review>("reviews", {
      filters: { cycle_id: cycleId, organization_id: orgId, status: "submitted" },
      limit: 100000,
    }),
  ]);

  const participantRatings: number[] = [];
  for (const participant of participants.data) {
    const ratings = reviews.data
      .filter((review) => review.employee_id === participant.employee_id)
      .map((review) => Number(review.overall_rating))
      .filter((rating) => Number.isFinite(rating) && rating >= 1 && rating <= 5);
    if (ratings.length > 0) {
      participantRatings.push(
        ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
      );
    }
  }

  return buildRatingDistribution(participantRatings);
}

export function buildRatingDistribution(ratings: number[]): RatingDistribution[] {
  const buckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const value of ratings) {
    if (Number.isFinite(value)) {
      const rounded = Math.round(value);
      const clamped = Math.max(1, Math.min(5, rounded));
      buckets[clamped]++;
    }
  }
  const total = Object.values(buckets).reduce((sum, count) => sum + count, 0);

  return [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: buckets[rating],
    percentage: total > 0 ? Math.round((buckets[rating] / total) * 10000) / 100 : 0,
  }));
}

// Persist the release snapshot inside the same transaction as participant and
// cycle updates. The unique constraint guarantees one row per rating bucket.
async function persistRatingDistribution(
  db: IDataContext,
  orgId: number,
  cycleId: string,
  distribution: RatingDistribution[],
): Promise<void> {
  await db.deleteMany("rating_distributions", {
    organization_id: orgId,
    cycle_id: cycleId,
  });
  await db.createMany(
    "rating_distributions",
    distribution.map((bucket) => ({
      id: uuidv4(),
      organization_id: orgId,
      cycle_id: cycleId,
      rating: bucket.rating,
      count: bucket.count,
      percentage: bucket.percentage,
    })),
  );
}
