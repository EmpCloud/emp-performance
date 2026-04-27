// ============================================================================
// SUCCESSION PLANNING SERVICE
// Create/list/manage succession plans and candidates.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, ValidationError } from "../../utils/errors";
import type {
  SuccessionPlan,
  SuccessionCandidate,
} from "@emp-performance/shared";

// ---------------------------------------------------------------------------
// Succession Plans
// ---------------------------------------------------------------------------

export async function createSuccessionPlan(
  orgId: number,
  data: {
    position_title: string;
    current_holder_id?: number;
    department?: string;
    criticality?: string;
    status?: string;
  },
): Promise<SuccessionPlan> {
  const db = getDB();

  // Reject obviously invalid employee ids — they must be positive
  // integers that match an EmpCloud user row (#26).
  if (data.current_holder_id !== undefined && data.current_holder_id !== null) {
    if (!Number.isInteger(data.current_holder_id) || data.current_holder_id <= 0) {
      throw new ValidationError("current_holder_id must be a positive integer");
    }
  }

  const record: Record<string, any> = {
    id: uuidv4(),
    organization_id: orgId,
    position_title: data.position_title,
    current_holder_id: data.current_holder_id ?? null,
    department: data.department ?? null,
    criticality: data.criticality ?? "medium",
    status: data.status ?? "identified",
  };

  return db.create<SuccessionPlan>("succession_plans", record as any);
}

export async function listSuccessionPlans(
  orgId: number,
): Promise<(SuccessionPlan & { candidate_count: number })[]> {
  const db = getDB();

  const result = await db.findMany<SuccessionPlan>("succession_plans", {
    filters: { organization_id: orgId },
    sort: { field: "created_at", order: "desc" },
    limit: 1000,
  });

  const plansWithCounts = await Promise.all(
    result.data.map(async (plan) => {
      const count = await db.count("succession_candidates", { plan_id: plan.id });
      return { ...plan, candidate_count: count };
    }),
  );

  return plansWithCounts;
}

export async function getSuccessionPlan(
  orgId: number,
  planId: string,
): Promise<SuccessionPlan & { candidates: SuccessionCandidate[] }> {
  const db = getDB();

  const plan = await db.findOne<SuccessionPlan>("succession_plans", {
    id: planId,
    organization_id: orgId,
  });
  if (!plan) throw new NotFoundError("SuccessionPlan", planId);

  const candidatesResult = await db.findMany<SuccessionCandidate>("succession_candidates", {
    filters: { plan_id: planId },
    limit: 1000,
  });

  return { ...plan, candidates: candidatesResult.data };
}

export async function addSuccessionCandidate(
  orgId: number,
  planId: string,
  data: {
    employee_id: number;
    readiness?: string;
    development_notes?: string;
    nine_box_position?: string;
  },
): Promise<SuccessionCandidate> {
  const db = getDB();

  const plan = await db.findOne<SuccessionPlan>("succession_plans", {
    id: planId,
    organization_id: orgId,
  });
  if (!plan) throw new NotFoundError("SuccessionPlan", planId);

  const record: Record<string, any> = {
    id: uuidv4(),
    plan_id: planId,
    employee_id: data.employee_id,
    readiness: data.readiness ?? "3_5_years",
    development_notes: data.development_notes ?? null,
    nine_box_position: data.nine_box_position ?? null,
  };

  return db.create<SuccessionCandidate>("succession_candidates", record as any);
}

export async function updateSuccessionCandidate(
  orgId: number,
  planId: string,
  candidateId: string,
  data: {
    readiness?: string;
    development_notes?: string;
    nine_box_position?: string;
  },
): Promise<SuccessionCandidate> {
  const db = getDB();

  const plan = await db.findOne<SuccessionPlan>("succession_plans", {
    id: planId,
    organization_id: orgId,
  });
  if (!plan) throw new NotFoundError("SuccessionPlan", planId);

  const candidate = await db.findOne<SuccessionCandidate>("succession_candidates", {
    id: candidateId,
    plan_id: planId,
  });
  if (!candidate) throw new NotFoundError("SuccessionCandidate", candidateId);

  const updateData: Record<string, any> = {};
  if (data.readiness !== undefined) updateData.readiness = data.readiness;
  if (data.development_notes !== undefined) updateData.development_notes = data.development_notes;
  if (data.nine_box_position !== undefined) updateData.nine_box_position = data.nine_box_position;

  return db.update<SuccessionCandidate>("succession_candidates", candidateId, updateData as any);
}
