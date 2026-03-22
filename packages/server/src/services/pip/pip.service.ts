// ============================================================================
// PIP SERVICE
// Business logic for Performance Improvement Plans.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { NotFoundError, AppError } from "../../utils/errors";
import type {
  PerformanceImprovementPlan,
  PIPObjective,
  PIPUpdate,
  PIPStatus,
  GoalStatus,
} from "@emp-performance/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreatePIPInput {
  employee_id: number;
  manager_id?: number;
  title?: string;
  reason: string;
  start_date: string;
  end_date: string;
}

interface ListPIPsParams {
  status?: string;
  employeeId?: number;
  managerId?: number;
  page?: number;
  perPage?: number;
  sort?: string;
  order?: "asc" | "desc";
  search?: string;
}

interface AddObjectiveInput {
  title: string;
  description?: string;
  success_criteria?: string;
  due_date?: string;
}

interface AddUpdateInput {
  notes: string;
  progress_rating?: number;
  objective_id?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createPIP(
  orgId: number,
  createdBy: number,
  data: CreatePIPInput,
): Promise<PerformanceImprovementPlan> {
  const db = getDB();

  // Check if employee already has an active PIP
  const existing = await db.findOne<PerformanceImprovementPlan>("performance_improvement_plans", {
    organization_id: orgId,
    employee_id: data.employee_id,
    status: "active",
  });

  if (existing) {
    throw new AppError(
      409,
      "CONFLICT",
      "Employee already has an active Performance Improvement Plan",
    );
  }

  const pip = await db.create<PerformanceImprovementPlan>("performance_improvement_plans", {
    id: uuidv4(),
    organization_id: orgId,
    employee_id: data.employee_id,
    manager_id: data.manager_id ?? createdBy,
    status: "active" as PIPStatus,
    reason: data.reason,
    start_date: data.start_date,
    end_date: data.end_date,
    extended_end_date: null,
    outcome_notes: null,
    created_by: createdBy,
  });

  return pip;
}

export async function listPIPs(
  orgId: number,
  params: ListPIPsParams,
): Promise<{ data: PerformanceImprovementPlan[]; total: number; page: number; perPage: number; totalPages: number }> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.status) filters.status = params.status;
  if (params.employeeId) filters.employee_id = params.employeeId;
  if (params.managerId) filters.manager_id = params.managerId;

  const result = await db.findMany<PerformanceImprovementPlan>(
    "performance_improvement_plans",
    {
      page,
      limit: perPage,
      sort: {
        field: params.sort ?? "created_at",
        order: params.order ?? "desc",
      },
      filters,
    },
  );

  return {
    data: result.data,
    total: result.total,
    page: result.page,
    perPage,
    totalPages: result.totalPages,
  };
}

export async function getPIP(
  orgId: number,
  id: string,
): Promise<
  PerformanceImprovementPlan & { objectives: PIPObjective[]; updates: PIPUpdate[] }
> {
  const db = getDB();

  const pip = await db.findOne<PerformanceImprovementPlan>(
    "performance_improvement_plans",
    { id, organization_id: orgId },
  );
  if (!pip) throw new NotFoundError("PIP", id);

  const objectivesResult = await db.findMany<PIPObjective>("pip_objectives", {
    filters: { pip_id: id },
    sort: { field: "created_at", order: "asc" },
    limit: 100,
  });

  const updatesResult = await db.findMany<PIPUpdate>("pip_updates", {
    filters: { pip_id: id },
    sort: { field: "created_at", order: "desc" },
    limit: 100,
  });

  return {
    ...pip,
    objectives: objectivesResult.data,
    updates: updatesResult.data,
  };
}

export async function updatePIP(
  orgId: number,
  id: string,
  data: Partial<Pick<PerformanceImprovementPlan, "reason" | "end_date" | "outcome_notes">>,
): Promise<PerformanceImprovementPlan> {
  const db = getDB();

  const existing = await db.findOne<PerformanceImprovementPlan>(
    "performance_improvement_plans",
    { id, organization_id: orgId },
  );
  if (!existing) throw new NotFoundError("PIP", id);

  const updates: Record<string, any> = {};
  if (data.reason !== undefined) updates.reason = data.reason;
  if (data.end_date !== undefined) updates.end_date = data.end_date;
  if (data.outcome_notes !== undefined) updates.outcome_notes = data.outcome_notes;

  return db.update<PerformanceImprovementPlan>("performance_improvement_plans", id, updates);
}

// ---------------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------------

export async function addObjective(
  orgId: number,
  pipId: string,
  data: AddObjectiveInput,
): Promise<PIPObjective> {
  const db = getDB();

  const pip = await db.findOne<PerformanceImprovementPlan>(
    "performance_improvement_plans",
    { id: pipId, organization_id: orgId },
  );
  if (!pip) throw new NotFoundError("PIP", pipId);

  const objective = await db.create<PIPObjective>("pip_objectives", {
    id: uuidv4(),
    pip_id: pipId,
    title: data.title,
    description: data.description ?? null,
    success_criteria: data.success_criteria ?? null,
    due_date: data.due_date ?? null,
    status: "not_started" as GoalStatus,
  });

  return objective;
}

export async function updateObjective(
  orgId: number,
  pipId: string,
  objectiveId: string,
  data: Partial<AddObjectiveInput> & { status?: string },
): Promise<PIPObjective> {
  const db = getDB();

  const pip = await db.findOne<PerformanceImprovementPlan>(
    "performance_improvement_plans",
    { id: pipId, organization_id: orgId },
  );
  if (!pip) throw new NotFoundError("PIP", pipId);

  const existing = await db.findOne<PIPObjective>("pip_objectives", {
    id: objectiveId,
    pip_id: pipId,
  });
  if (!existing) throw new NotFoundError("PIP Objective", objectiveId);

  const updates: Record<string, any> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.success_criteria !== undefined) updates.success_criteria = data.success_criteria;
  if (data.due_date !== undefined) updates.due_date = data.due_date;
  if (data.status !== undefined) updates.status = data.status;

  return db.update<PIPObjective>("pip_objectives", objectiveId, updates);
}

// ---------------------------------------------------------------------------
// Updates / Check-ins
// ---------------------------------------------------------------------------

export async function addUpdate(
  orgId: number,
  pipId: string,
  authorId: number,
  data: AddUpdateInput,
): Promise<PIPUpdate> {
  const db = getDB();

  const pip = await db.findOne<PerformanceImprovementPlan>(
    "performance_improvement_plans",
    { id: pipId, organization_id: orgId },
  );
  if (!pip) throw new NotFoundError("PIP", pipId);

  const update = await db.create<PIPUpdate>("pip_updates", {
    id: uuidv4(),
    pip_id: pipId,
    author_id: authorId,
    notes: data.notes,
    progress_rating: data.progress_rating ?? null,
  });

  return update;
}

// ---------------------------------------------------------------------------
// Close / Extend
// ---------------------------------------------------------------------------

export async function closePIP(
  orgId: number,
  id: string,
  outcome: "completed_success" | "completed_failure" | "cancelled",
  outcomeNotes?: string,
): Promise<PerformanceImprovementPlan> {
  const db = getDB();

  const pip = await db.findOne<PerformanceImprovementPlan>(
    "performance_improvement_plans",
    { id, organization_id: orgId },
  );
  if (!pip) throw new NotFoundError("PIP", id);

  if (!["active", "extended"].includes(pip.status)) {
    throw new AppError(400, "INVALID_STATUS", "Only active or extended PIPs can be closed");
  }

  return db.update<PerformanceImprovementPlan>("performance_improvement_plans", id, {
    status: outcome as PIPStatus,
    outcome_notes: outcomeNotes ?? null,
  } as any);
}

export async function extendPIP(
  orgId: number,
  id: string,
  newEndDate: string,
): Promise<PerformanceImprovementPlan> {
  const db = getDB();

  const pip = await db.findOne<PerformanceImprovementPlan>(
    "performance_improvement_plans",
    { id, organization_id: orgId },
  );
  if (!pip) throw new NotFoundError("PIP", id);

  if (!["active", "extended"].includes(pip.status)) {
    throw new AppError(400, "INVALID_STATUS", "Only active or extended PIPs can be extended");
  }

  return db.update<PerformanceImprovementPlan>("performance_improvement_plans", id, {
    status: "extended" as PIPStatus,
    extended_end_date: newEndDate,
  } as any);
}
