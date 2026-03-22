// ============================================================================
// ANALYTICS SERVICE
// Provides performance analytics: overview stats, ratings distribution,
// trends, team comparisons, goal completion, and top performers.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { logger } from "../../utils/logger";
import { NotFoundError, ValidationError } from "../../utils/errors";
import type {
  NineBoxPosition,
  NineBoxData,
  NineBoxEmployee,
  NineBoxCell,
  PotentialAssessment,
  SuccessionPlan,
  SuccessionCandidate,
} from "@emp-performance/shared";

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getOverview(orgId: number) {
  const db = getDB();

  const [activeCycles, pendingReviews, totalGoals, completedGoals, pipCount, feedbackCount] =
    await Promise.all([
      db.count("review_cycles", { organization_id: orgId, status: "active" }),
      db.count("reviews", { organization_id: orgId, status: "pending" }),
      db.count("goals", { organization_id: orgId }),
      db.count("goals", { organization_id: orgId, status: "completed" }),
      db.count("performance_improvement_plans", { organization_id: orgId, status: "active" }),
      db.count("continuous_feedback", { organization_id: orgId }),
    ]);

  const goalCompletionRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  return {
    activeCycles,
    pendingReviews,
    goalCompletionRate,
    pipCount,
    feedbackCount,
    totalGoals,
    completedGoals,
  };
}

// ---------------------------------------------------------------------------
// Ratings Distribution (bell curve)
// ---------------------------------------------------------------------------

export async function getRatingsDistribution(orgId: number, cycleId: string) {
  const db = getDB();

  // Try cached distribution first
  const cached = await db.findMany<any>("rating_distributions", {
    filters: { organization_id: orgId, cycle_id: cycleId },
    sort: { field: "rating", order: "asc" },
    limit: 10,
  });

  if (cached.data.length > 0) {
    return cached.data;
  }

  // Compute from reviews on the fly
  const result = await db.raw<any>(
    `SELECT
       FLOOR(overall_rating) as rating,
       COUNT(*) as count
     FROM reviews
     WHERE organization_id = ?
       AND cycle_id = ?
       AND overall_rating IS NOT NULL
       AND status = 'submitted'
     GROUP BY FLOOR(overall_rating)
     ORDER BY rating ASC`,
    [orgId, cycleId],
  );

  const rows = Array.isArray(result) ? (result[0] || result) : [];
  return Array.isArray(rows) ? rows : [];
}

// ---------------------------------------------------------------------------
// Trends (ratings over multiple cycles)
// ---------------------------------------------------------------------------

export async function getTrends(orgId: number) {
  const db = getDB();

  const result = await db.raw<any>(
    `SELECT
       rc.name as cycle_name,
       rc.id as cycle_id,
       AVG(r.overall_rating) as avg_rating,
       COUNT(r.id) as review_count
     FROM review_cycles rc
     LEFT JOIN reviews r ON r.cycle_id = rc.id
       AND r.organization_id = ?
       AND r.status = 'submitted'
       AND r.overall_rating IS NOT NULL
     WHERE rc.organization_id = ?
     GROUP BY rc.id, rc.name, rc.start_date
     ORDER BY rc.start_date ASC
     LIMIT 10`,
    [orgId, orgId],
  );

  const rows = Array.isArray(result) ? (result[0] || result) : [];
  return Array.isArray(rows) ? rows : [];
}

// ---------------------------------------------------------------------------
// Team Comparison
// ---------------------------------------------------------------------------

export async function getTeamComparison(orgId: number, managerId: number) {
  const db = getDB();

  const result = await db.raw<any>(
    `SELECT
       r.employee_id,
       AVG(r.overall_rating) as avg_rating,
       COUNT(r.id) as review_count
     FROM reviews r
     INNER JOIN review_cycle_participants rcp ON rcp.cycle_id = r.cycle_id
       AND rcp.employee_id = r.employee_id
     WHERE r.organization_id = ?
       AND rcp.manager_id = ?
       AND r.status = 'submitted'
       AND r.overall_rating IS NOT NULL
     GROUP BY r.employee_id
     ORDER BY avg_rating DESC`,
    [orgId, managerId],
  );

  const rows = Array.isArray(result) ? (result[0] || result) : [];
  return Array.isArray(rows) ? rows : [];
}

// ---------------------------------------------------------------------------
// Goal Completion
// ---------------------------------------------------------------------------

export async function getGoalCompletion(orgId: number) {
  const db = getDB();

  const result = await db.raw<any>(
    `SELECT
       category,
       COUNT(*) as total,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
       ROUND(AVG(progress), 1) as avg_progress
     FROM goals
     WHERE organization_id = ?
     GROUP BY category
     ORDER BY category ASC`,
    [orgId],
  );

  const rows = Array.isArray(result) ? (result[0] || result) : [];
  return Array.isArray(rows) ? rows : [];
}

// ---------------------------------------------------------------------------
// Top Performers
// ---------------------------------------------------------------------------

export async function getTopPerformers(orgId: number, cycleId: string) {
  const db = getDB();

  const result = await db.raw<any>(
    `SELECT
       r.employee_id,
       AVG(r.overall_rating) as avg_rating,
       COUNT(r.id) as review_count
     FROM reviews r
     WHERE r.organization_id = ?
       AND r.cycle_id = ?
       AND r.status = 'submitted'
       AND r.overall_rating IS NOT NULL
     GROUP BY r.employee_id
     ORDER BY avg_rating DESC
     LIMIT 20`,
    [orgId, cycleId],
  );

  const rows = Array.isArray(result) ? (result[0] || result) : [];
  return Array.isArray(rows) ? rows : [];
}

// ---------------------------------------------------------------------------
// Nine-Box Grid (Performance vs Potential)
// ---------------------------------------------------------------------------

function classifyNineBox(performance: number, potential: number): NineBoxPosition {
  const perfLevel = performance >= 4 ? "high" : performance >= 2.5 ? "medium" : "low";
  const potLevel = potential >= 4 ? "high" : potential >= 2.5 ? "medium" : "low";

  const matrix: Record<string, Record<string, NineBoxPosition>> = {
    high: {
      high: "Star",
      medium: "High Performer",
      low: "Solid Performer",
    },
    medium: {
      high: "High Potential",
      medium: "Core Player",
      low: "Average",
    },
    low: {
      high: "Inconsistent",
      medium: "Improvement Needed",
      low: "Action Required",
    },
  };

  return matrix[perfLevel][potLevel];
}

export async function getNineBoxData(
  orgId: number,
  cycleId: string,
): Promise<NineBoxData> {
  const db = getDB();

  const cycle = await db.findOne<any>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  const participants = await db.findMany<any>("review_cycle_participants", {
    filters: { cycle_id: cycleId },
    limit: 10000,
  });

  const assessments = await db.findMany<PotentialAssessment>("potential_assessments", {
    filters: { organization_id: orgId, cycle_id: cycleId },
    limit: 10000,
  });

  const potentialMap = new Map<number, number>();
  for (const a of assessments.data) {
    potentialMap.set(a.employee_id, a.potential_rating);
  }

  const boxNames: NineBoxPosition[] = [
    "Star", "High Performer", "Solid Performer",
    "High Potential", "Core Player", "Average",
    "Inconsistent", "Improvement Needed", "Action Required",
  ];

  const boxes: Record<string, NineBoxCell> = {};
  for (const name of boxNames) {
    boxes[name] = { employees: [], count: 0 };
  }

  let totalEmployees = 0;

  for (const p of participants.data) {
    const performance = p.final_rating;
    const potential = potentialMap.get(p.employee_id);

    if (performance == null || potential == null) continue;

    const position = classifyNineBox(performance, potential);

    const employee: NineBoxEmployee = {
      id: p.employee_id,
      name: `Employee ${p.employee_id}`,
      department: null,
      rating: performance,
      potential,
    };

    boxes[position].employees.push(employee);
    boxes[position].count++;
    totalEmployees++;
  }

  return {
    boxes: boxes as Record<NineBoxPosition, NineBoxCell>,
    totalEmployees,
  };
}

// ---------------------------------------------------------------------------
// Potential Assessments
// ---------------------------------------------------------------------------

export async function createPotentialAssessment(
  orgId: number,
  data: {
    cycle_id: string;
    employee_id: number;
    potential_rating: number;
    notes?: string;
  },
  assessedBy: number,
): Promise<PotentialAssessment> {
  const db = getDB();

  if (data.potential_rating < 1 || data.potential_rating > 5) {
    throw new ValidationError("potential_rating must be between 1 and 5");
  }

  const cycle = await db.findOne<any>("review_cycles", {
    id: data.cycle_id,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", data.cycle_id);

  const existing = await db.findOne<PotentialAssessment>("potential_assessments", {
    cycle_id: data.cycle_id,
    employee_id: data.employee_id,
  });

  if (existing) {
    return db.update<PotentialAssessment>("potential_assessments", existing.id, {
      potential_rating: data.potential_rating,
      notes: data.notes ?? null,
      assessed_by: assessedBy,
    } as any);
  }

  const record: Record<string, any> = {
    id: uuidv4(),
    organization_id: orgId,
    cycle_id: data.cycle_id,
    employee_id: data.employee_id,
    assessed_by: assessedBy,
    potential_rating: data.potential_rating,
    notes: data.notes ?? null,
  };

  return db.create<PotentialAssessment>("potential_assessments", record as any);
}

export async function listPotentialAssessments(
  orgId: number,
  cycleId: string,
): Promise<PotentialAssessment[]> {
  const db = getDB();

  const cycle = await db.findOne<any>("review_cycles", {
    id: cycleId,
    organization_id: orgId,
  });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  const result = await db.findMany<PotentialAssessment>("potential_assessments", {
    filters: { organization_id: orgId, cycle_id: cycleId },
    limit: 10000,
  });

  return result.data;
}

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
