// ============================================================================
// GOAL / OKR SERVICE
// Business logic for goals, key results, and check-ins.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { AppError, NotFoundError } from "../../utils/errors";
import type {
  Goal,
  KeyResult,
  GoalCheckIn,
  GoalStatus,
  GoalCategory,
} from "@emp-performance/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateGoalInput {
  title: string;
  description?: string;
  category?: string;
  priority?: string;
  start_date?: string;
  due_date?: string;
  cycle_id?: string;
  parent_goal_id?: string;
  employee_id?: number;
}

interface ListGoalsParams {
  employeeId?: number;
  cycleId?: string;
  category?: string;
  status?: string;
  page?: number;
  perPage?: number;
  sort?: string;
  order?: "asc" | "desc";
  search?: string;
}

interface AddKeyResultInput {
  title: string;
  metric_type?: string;
  target_value: number;
  current_value?: number;
  unit?: string;
  weight?: number;
}

interface CheckInInput {
  progress: number;
  notes?: string;
  key_result_id?: string;
  current_value?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function createGoal(
  orgId: number,
  createdBy: number,
  data: CreateGoalInput,
): Promise<Goal> {
  const db = getDB();

  // Validate parent goal belongs to same org if provided
  if (data.parent_goal_id) {
    const parent = await db.findOne<Goal>("goals", {
      id: data.parent_goal_id,
      organization_id: orgId,
    });
    if (!parent) {
      throw new NotFoundError("Parent goal", data.parent_goal_id);
    }
  }

  const goal = await db.create<Goal>("goals", {
    id: uuidv4(),
    organization_id: orgId,
    employee_id: data.employee_id ?? createdBy,
    title: data.title,
    description: data.description ?? null,
    category: (data.category ?? "individual") as GoalCategory,
    priority: (data.priority ?? "medium") as any,
    status: "not_started" as GoalStatus,
    progress: 0,
    start_date: data.start_date ?? null,
    due_date: data.due_date ?? null,
    completed_at: null,
    cycle_id: data.cycle_id ?? null,
    parent_goal_id: data.parent_goal_id ?? null,
    created_by: createdBy,
  });

  return goal;
}

export async function listGoals(
  orgId: number,
  params: ListGoalsParams,
): Promise<{ data: Goal[]; total: number; page: number; perPage: number; totalPages: number }> {
  const db = getDB();
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 20;

  const filters: Record<string, any> = { organization_id: orgId };
  if (params.employeeId) filters.employee_id = params.employeeId;
  if (params.cycleId) filters.cycle_id = params.cycleId;
  if (params.category) filters.category = params.category;
  if (params.status) filters.status = params.status;

  const search = (params.search ?? "").trim();

  if (search) {
    // findMany has no LIKE support, so issue a raw query for free-text
    // search on title/description (#14).
    const offset = (page - 1) * perPage;
    const where: string[] = ["organization_id = ?"];
    const args: any[] = [orgId];
    if (params.employeeId) {
      where.push("employee_id = ?");
      args.push(params.employeeId);
    }
    if (params.cycleId) {
      where.push("cycle_id = ?");
      args.push(params.cycleId);
    }
    if (params.category) {
      where.push("category = ?");
      args.push(params.category);
    }
    if (params.status) {
      where.push("status = ?");
      args.push(params.status);
    }
    where.push("(title LIKE ? OR description LIKE ?)");
    const term = `%${search}%`;
    args.push(term, term);

    const orderField = params.sort ?? "created_at";
    const orderDir = (params.order ?? "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";

    const rowsRes = await db.raw<any>(
      `SELECT * FROM goals WHERE ${where.join(" AND ")} ORDER BY ${orderField} ${orderDir} LIMIT ? OFFSET ?`,
      [...args, perPage, offset],
    );
    const totalRes = await db.raw<any>(
      `SELECT COUNT(*) AS c FROM goals WHERE ${where.join(" AND ")}`,
      args,
    );
    const rows = (Array.isArray(rowsRes) ? rowsRes[0] || rowsRes : []) as any[];
    const totalRows = (Array.isArray(totalRes) ? totalRes[0] || totalRes : []) as any[];
    const total = Number(totalRows?.[0]?.c ?? 0);
    return {
      data: rows as Goal[],
      total,
      page,
      perPage,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  const result = await db.findMany<Goal>("goals", {
    page,
    limit: perPage,
    sort: {
      field: params.sort ?? "created_at",
      order: params.order ?? "desc",
    },
    filters,
  });

  return {
    data: result.data,
    total: result.total,
    page: result.page,
    perPage,
    totalPages: result.totalPages,
  };
}

export async function getGoal(
  orgId: number,
  id: string,
): Promise<Goal & { key_results: KeyResult[]; check_ins: GoalCheckIn[] }> {
  const db = getDB();

  const goal = await db.findOne<Goal>("goals", { id, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", id);

  const krResult = await db.findMany<KeyResult>("key_results", {
    filters: { goal_id: id },
    sort: { field: "created_at", order: "asc" },
    limit: 100,
  });

  const checkInResult = await db.findMany<GoalCheckIn>("goal_check_ins", {
    filters: { goal_id: id },
    sort: { field: "created_at", order: "desc" },
    limit: 50,
  });

  return {
    ...goal,
    key_results: krResult.data,
    check_ins: checkInResult.data,
  };
}

export async function updateGoal(
  orgId: number,
  id: string,
  data: Partial<CreateGoalInput> & { status?: string },
): Promise<Goal> {
  const db = getDB();

  const existing = await db.findOne<Goal>("goals", { id, organization_id: orgId });
  if (!existing) throw new NotFoundError("Goal", id);

  const updates: Record<string, any> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.category !== undefined) updates.category = data.category;
  if (data.priority !== undefined) updates.priority = data.priority;
  if (data.status !== undefined) updates.status = data.status;
  if (data.start_date !== undefined) updates.start_date = data.start_date;
  if (data.due_date !== undefined) updates.due_date = data.due_date;
  if (data.cycle_id !== undefined) updates.cycle_id = data.cycle_id;

  if (data.status === "completed") {
    updates.completed_at = new Date().toISOString().slice(0, 19).replace("T", " ");
    updates.progress = 100;
  }

  return db.update<Goal>("goals", id, updates);
}

export async function deleteGoal(orgId: number, id: string): Promise<void> {
  const db = getDB();

  const existing = await db.findOne<Goal>("goals", { id, organization_id: orgId });
  if (!existing) throw new NotFoundError("Goal", id);

  // Soft delete via status change to cancelled
  await db.update<Goal>("goals", id, { status: "cancelled" as GoalStatus } as any);
}

// ---------------------------------------------------------------------------
// Key Results
// ---------------------------------------------------------------------------

export async function addKeyResult(
  orgId: number,
  goalId: string,
  data: AddKeyResultInput,
): Promise<KeyResult> {
  const db = getDB();

  const goal = await db.findOne<Goal>("goals", { id: goalId, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", goalId);

  const kr = await db.create<KeyResult>("key_results", {
    id: uuidv4(),
    goal_id: goalId,
    title: data.title,
    metric_type: (data.metric_type ?? "number") as any,
    target_value: data.target_value,
    current_value: data.current_value ?? 0,
    unit: data.unit ?? null,
    weight: data.weight ?? 1,
  });

  // Recompute goal progress
  await computeGoalProgress(orgId, goalId);

  return kr;
}

export async function updateKeyResult(
  orgId: number,
  goalId: string,
  krId: string,
  data: Partial<AddKeyResultInput> & { current_value?: number },
): Promise<KeyResult> {
  const db = getDB();

  const goal = await db.findOne<Goal>("goals", { id: goalId, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", goalId);

  const existing = await db.findOne<KeyResult>("key_results", { id: krId, goal_id: goalId });
  if (!existing) throw new NotFoundError("Key Result", krId);

  const updates: Record<string, any> = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.metric_type !== undefined) updates.metric_type = data.metric_type;
  if (data.target_value !== undefined) updates.target_value = data.target_value;
  if (data.current_value !== undefined) updates.current_value = data.current_value;
  if (data.unit !== undefined) updates.unit = data.unit;
  if (data.weight !== undefined) updates.weight = data.weight;

  const updated = await db.update<KeyResult>("key_results", krId, updates);

  // Recompute goal progress
  await computeGoalProgress(orgId, goalId);

  return updated;
}

export async function deleteKeyResult(
  orgId: number,
  goalId: string,
  krId: string,
): Promise<void> {
  const db = getDB();

  const goal = await db.findOne<Goal>("goals", { id: goalId, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", goalId);

  const existing = await db.findOne<KeyResult>("key_results", { id: krId, goal_id: goalId });
  if (!existing) throw new NotFoundError("Key Result", krId);

  await db.delete("key_results", krId);

  // Recompute goal progress
  await computeGoalProgress(orgId, goalId);
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------

export async function checkIn(
  orgId: number,
  goalId: string,
  authorId: number,
  data: CheckInInput,
): Promise<GoalCheckIn> {
  const db = getDB();

  const goal = await db.findOne<Goal>("goals", { id: goalId, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", goalId);

  // If a key result is referenced, update its current_value
  if (data.key_result_id && data.current_value !== undefined) {
    const kr = await db.findOne<KeyResult>("key_results", {
      id: data.key_result_id,
      goal_id: goalId,
    });
    if (!kr) throw new NotFoundError("Key Result", data.key_result_id);

    await db.update<KeyResult>("key_results", data.key_result_id, {
      current_value: data.current_value,
    } as any);
  }

  const checkInRecord = await db.create<GoalCheckIn>("goal_check_ins", {
    id: uuidv4(),
    goal_id: goalId,
    author_id: authorId,
    progress: data.progress,
    notes: data.notes ?? null,
  });

  // Update goal progress
  await computeGoalProgress(orgId, goalId);

  // Auto-transition status if needed
  if (goal.status === "not_started" && data.progress > 0) {
    await db.update<Goal>("goals", goalId, { status: "in_progress" as GoalStatus } as any);
  }

  return checkInRecord;
}

export async function getCheckIns(
  orgId: number,
  goalId: string,
): Promise<GoalCheckIn[]> {
  const db = getDB();

  const goal = await db.findOne<Goal>("goals", { id: goalId, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", goalId);

  const result = await db.findMany<GoalCheckIn>("goal_check_ins", {
    filters: { goal_id: goalId },
    sort: { field: "created_at", order: "desc" },
    limit: 100,
  });

  return result.data;
}

// ---------------------------------------------------------------------------
// Progress Computation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Goal Alignment Tree
// ---------------------------------------------------------------------------

interface GoalTreeNode {
  id: string;
  title: string;
  category: string;
  status: string;
  progress: number;
  employee_id: number;
  parent_goal_id: string | null;
  due_date: string | null;
  children: GoalTreeNode[];
  rollup_progress: number;
}

export async function getGoalTree(
  orgId: number,
  cycleId?: string,
): Promise<GoalTreeNode[]> {
  const db = getDB();

  const filters: Record<string, any> = { organization_id: orgId };
  if (cycleId) filters.cycle_id = cycleId;

  const result = await db.findMany<Goal>("goals", {
    filters,
    sort: { field: "category", order: "asc" },
    limit: 10000,
  });

  const goals = result.data;
  const goalMap = new Map<string, GoalTreeNode>();

  // Create tree nodes
  for (const g of goals) {
    goalMap.set(g.id, {
      id: g.id,
      title: g.title,
      category: g.category,
      status: g.status,
      progress: g.progress,
      employee_id: g.employee_id,
      parent_goal_id: g.parent_goal_id,
      due_date: g.due_date,
      children: [],
      rollup_progress: g.progress,
    });
  }

  // Build tree structure
  const roots: GoalTreeNode[] = [];
  for (const node of goalMap.values()) {
    if (node.parent_goal_id && goalMap.has(node.parent_goal_id)) {
      goalMap.get(node.parent_goal_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Compute rollup progress bottom-up (parent = weighted avg of children)
  function computeRollup(node: GoalTreeNode): number {
    if (node.children.length === 0) {
      node.rollup_progress = node.progress;
      return node.progress;
    }

    let totalWeight = 0;
    let weightedProgress = 0;
    for (const child of node.children) {
      const childProgress = computeRollup(child);
      weightedProgress += childProgress;
      totalWeight += 1;
    }

    node.rollup_progress =
      totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : node.progress;
    return node.rollup_progress;
  }

  for (const root of roots) {
    computeRollup(root);
  }

  // Sort roots: company first, then department, team, individual
  const categoryOrder: Record<string, number> = {
    company: 0,
    department: 1,
    team: 2,
    individual: 3,
  };

  roots.sort(
    (a, b) => (categoryOrder[a.category] ?? 4) - (categoryOrder[b.category] ?? 4),
  );

  return roots;
}

export async function getGoalAlignment(
  orgId: number,
  goalId: string,
): Promise<{ goal: Goal; ancestors: Goal[]; descendants: Goal[] }> {
  const db = getDB();

  const goal = await db.findOne<Goal>("goals", { id: goalId, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", goalId);

  // Walk up the ancestor chain
  const ancestors: Goal[] = [];
  let currentParentId = goal.parent_goal_id;
  while (currentParentId) {
    const parent = await db.findOne<Goal>("goals", {
      id: currentParentId,
      organization_id: orgId,
    });
    if (!parent) break;
    ancestors.unshift(parent); // oldest ancestor first
    currentParentId = parent.parent_goal_id;
  }

  // Gather all descendants BFS
  const descendants: Goal[] = [];
  const queue: string[] = [goalId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const childResult = await db.findMany<Goal>("goals", {
      filters: { organization_id: orgId, parent_goal_id: parentId },
      limit: 1000,
    });
    for (const child of childResult.data) {
      descendants.push(child);
      queue.push(child.id);
    }
  }

  return { goal, ancestors, descendants };
}

// ---------------------------------------------------------------------------
// Progress Computation
// ---------------------------------------------------------------------------

export async function computeGoalProgress(
  orgId: number,
  goalId: string,
): Promise<number> {
  const db = getDB();

  const goal = await db.findOne<Goal>("goals", { id: goalId, organization_id: orgId });
  if (!goal) throw new NotFoundError("Goal", goalId);

  const krResult = await db.findMany<KeyResult>("key_results", {
    filters: { goal_id: goalId },
    limit: 100,
  });

  const keyResults = krResult.data;

  if (keyResults.length === 0) {
    // No key results — use latest check-in progress
    const checkIns = await db.findMany<GoalCheckIn>("goal_check_ins", {
      filters: { goal_id: goalId },
      sort: { field: "created_at", order: "desc" },
      limit: 1,
    });
    const progress = checkIns.data.length > 0 ? checkIns.data[0].progress : 0;
    await db.update<Goal>("goals", goalId, { progress } as any);
    return progress;
  }

  // Weighted average of key result progress
  let totalWeight = 0;
  let weightedProgress = 0;

  for (const kr of keyResults) {
    const krProgress =
      kr.target_value > 0
        ? Math.min(100, Math.round((kr.current_value / kr.target_value) * 100))
        : 0;
    weightedProgress += krProgress * kr.weight;
    totalWeight += kr.weight;
  }

  const progress = totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
  await db.update<Goal>("goals", goalId, { progress } as any);

  return progress;
}
