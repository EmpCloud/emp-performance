import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError, AppError } from "../../utils/errors";
import type {
  ReviewCycle,
  ReviewCycleParticipant,
  ReviewCycleStatus,
  RatingDistribution,
  Review,
} from "@emp-performance/shared";

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

    const orderField = params.sort ?? "created_at";
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
  const existing = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!existing) throw new NotFoundError("ReviewCycle", id);
  if (existing.status === "completed" || existing.status === "cancelled") {
    throw new ValidationError("Cannot update a completed or cancelled cycle");
  }

  return db.update<ReviewCycle>("review_cycles", id, data as any);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// Delete a cycle that hasn't started yet. Block deletion of active cycles
// so we don't drop reviews mid-flight.
export async function deleteCycle(orgId: number, id: string): Promise<void> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", id);
  if (cycle.status !== "draft") {
    throw new ValidationError("Only draft cycles can be deleted");
  }
  await db.delete("review_cycles", id);
}

export async function launchCycle(orgId: number, id: string): Promise<ReviewCycle> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", id);
  if (cycle.status !== "draft") {
    throw new ValidationError("Only draft cycles can be launched");
  }

  const participantCount = await db.count("review_cycle_participants", { cycle_id: id });
  if (participantCount === 0) {
    throw new ValidationError("Cannot launch a cycle with no participants");
  }

  return db.update<ReviewCycle>("review_cycles", id, { status: "active" } as any);
}

export async function closeCycle(orgId: number, id: string): Promise<ReviewCycle> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", id);
  if (cycle.status !== "active" && cycle.status !== "in_review" && cycle.status !== "calibration") {
    throw new ValidationError("Only active, in_review, or calibration cycles can be closed");
  }

  // Compute average final ratings for each participant (from submitted reviews)
  const participants = await db.findMany<ReviewCycleParticipant>("review_cycle_participants", {
    filters: { cycle_id: id },
  });

  for (const participant of participants.data) {
    const reviews = await db.findMany<Review>("reviews", {
      filters: {
        cycle_id: id,
        employee_id: participant.employee_id,
        status: "submitted",
        organization_id: orgId,
      },
    });

    if (reviews.data.length > 0) {
      const totalRating = reviews.data.reduce((sum, r) => sum + (Number(r.overall_rating) || 0), 0);
      const avgRating = Math.round((totalRating / reviews.data.length) * 100) / 100;
      await db.update("review_cycle_participants", participant.id, {
        final_rating: avgRating,
        status: "completed",
      } as any);
    }
  }

  const closedCycle = await db.update<ReviewCycle>("review_cycles", id, { status: "completed" } as any);

  // Notify EMP Cloud about the cycle completion (non-blocking)
  const webhookUrl = process.env.EMPCLOUD_WEBHOOK_URL;
  if (webhookUrl) {
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "performance.cycle_completed",
        data: {
          cycleId: id,
          cycleName: cycle.name,
          participantCount: participants.data.length,
        },
        source: "emp-performance",
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {}); // fire-and-forget
  }

  return closedCycle;
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export async function addParticipants(
  orgId: number,
  cycleId: string,
  participants: { employee_id: number; manager_id?: number }[],
): Promise<ReviewCycleParticipant[]> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
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
    const existing = await db.findOne<ReviewCycleParticipant>("review_cycle_participants", {
      cycle_id: cycleId,
      employee_id: p.employee_id,
    });
    if (existing) continue;

    const record: Record<string, any> = {
      id: uuidv4(),
      cycle_id: cycleId,
      employee_id: p.employee_id,
      manager_id: p.manager_id ?? null,
      status: "pending",
    };
    const participant = await db.create<ReviewCycleParticipant>("review_cycle_participants", record as any);
    created.push(participant);
  }

  return created;
}

export async function listParticipants(
  orgId: number,
  cycleId: string,
): Promise<ReviewCycleParticipant[]> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  const result = await db.findMany<ReviewCycleParticipant>("review_cycle_participants", {
    filters: { cycle_id: cycleId },
  });
  return result.data;
}

export async function removeParticipant(
  orgId: number,
  cycleId: string,
  participantId: string,
): Promise<void> {
  const db = getDB();
  const cycle = await db.findOne<ReviewCycle>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);
  if (cycle.status !== "draft") {
    throw new ValidationError("Can only remove participants from draft cycles");
  }

  const participant = await db.findOne<ReviewCycleParticipant>("review_cycle_participants", {
    id: participantId,
    cycle_id: cycleId,
  });
  if (!participant) throw new NotFoundError("Participant", participantId);

  await db.delete("review_cycle_participants", participantId);
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

  // Get all submitted reviews for this cycle
  const reviews = await db.findMany<Review>("reviews", {
    filters: { cycle_id: cycleId, organization_id: orgId, status: "submitted" },
    limit: 10000,
  });

  // Bucket ratings 1-5
  const buckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;

  for (const review of reviews.data) {
    if (review.overall_rating !== null) {
      const rounded = Math.round(review.overall_rating);
      const clamped = Math.max(1, Math.min(5, rounded));
      buckets[clamped]++;
      total++;
    }
  }

  return [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: buckets[rating],
    percentage: total > 0 ? Math.round((buckets[rating] / total) * 10000) / 100 : 0,
  }));
}
