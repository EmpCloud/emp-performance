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

// ---------------------------------------------------------------------------
// Skills Gap Analysis
// ---------------------------------------------------------------------------

export interface CompetencyGap {
  competency_id: string;
  name: string;
  category: string | null;
  currentRating: number;
  requiredRating: number;
  gap: number;
  status: "exceeds" | "meets" | "gap";
}

export interface SkillsGapResult {
  employee_id: number;
  competencies: CompetencyGap[];
  overallReadiness: number;
}

export interface LearningRecommendation {
  competency: string;
  gap: number;
  recommendation: string;
}

export async function getSkillsGap(
  orgId: number,
  employeeId: number,
): Promise<SkillsGapResult> {
  const db = getDB();

  // Find the employee's career track to determine required competencies
  const track = await db.findOne<any>("employee_career_tracks", {
    employee_id: employeeId,
  });

  // Get latest review for competency ratings
  const latestReview = await db.raw<any>(
    `SELECT r.id
     FROM reviews r
     WHERE r.organization_id = ?
       AND r.employee_id = ?
       AND r.status = 'submitted'
       AND r.overall_rating IS NOT NULL
     ORDER BY r.submitted_at DESC
     LIMIT 1`,
    [orgId, employeeId],
  );

  const reviewRows = Array.isArray(latestReview) ? (latestReview[0] || latestReview) : [];
  const reviewId = Array.isArray(reviewRows) && reviewRows.length > 0 ? reviewRows[0].id : null;

  // Get competency ratings from latest review
  const ratingMap = new Map<string, number>();
  if (reviewId) {
    const ratings = await db.findMany<any>("review_competency_ratings", {
      filters: { review_id: reviewId },
      limit: 100,
    });
    for (const r of ratings.data) {
      ratingMap.set(r.competency_id, r.rating);
    }
  }

  // Get required competencies from the career path framework or all org competencies
  let competencies: any[] = [];

  if (track) {
    // Get the career path's associated competency framework
    const careerPath = await db.findOne<any>("career_paths", {
      id: track.career_path_id,
      organization_id: orgId,
    });

    if (careerPath) {
      // Get competencies from all active frameworks in the org
      const frameworks = await db.findMany<any>("competency_frameworks", {
        filters: { organization_id: orgId, is_active: true },
        limit: 100,
      });

      for (const fw of frameworks.data) {
        const comps = await db.findMany<any>("competencies", {
          filters: { framework_id: fw.id },
          limit: 100,
        });
        competencies.push(...comps.data);
      }
    }
  }

  // If no career track, fall back to all active framework competencies
  if (competencies.length === 0) {
    const frameworks = await db.findMany<any>("competency_frameworks", {
      filters: { organization_id: orgId, is_active: true },
      limit: 100,
    });
    for (const fw of frameworks.data) {
      const comps = await db.findMany<any>("competencies", {
        filters: { framework_id: fw.id },
        limit: 100,
      });
      competencies.push(...comps.data);
    }
  }

  // Build gap analysis
  const gaps: CompetencyGap[] = competencies.map((comp) => {
    const currentRating = ratingMap.get(comp.id) ?? 0;
    // Required rating defaults to 3 (meets expectations) for each competency weight level
    const requiredRating = Math.min(5, Math.max(3, Math.round(comp.weight)));
    const gap = requiredRating - currentRating;

    let status: "exceeds" | "meets" | "gap";
    if (gap < 0) status = "exceeds";
    else if (gap === 0) status = "meets";
    else status = "gap";

    return {
      competency_id: comp.id,
      name: comp.name,
      category: comp.category,
      currentRating,
      requiredRating,
      gap,
      status,
    };
  });

  // Overall readiness: percentage of competencies that meet or exceed
  const meetsOrExceeds = gaps.filter((g) => g.status !== "gap").length;
  const overallReadiness = gaps.length > 0 ? Math.round((meetsOrExceeds / gaps.length) * 100) : 100;

  return {
    employee_id: employeeId,
    competencies: gaps,
    overallReadiness,
  };
}

export async function getDepartmentSkillsGap(
  orgId: number,
  departmentId: string,
): Promise<{
  department: string;
  employees: SkillsGapResult[];
  aggregatedGaps: CompetencyGap[];
  averageReadiness: number;
}> {
  const db = getDB();

  // Get employees in the department via career paths
  const careerPaths = await db.findMany<any>("career_paths", {
    filters: { organization_id: orgId, department: departmentId },
    limit: 100,
  });

  const employeeIds = new Set<number>();
  for (const path of careerPaths.data) {
    const tracks = await db.findMany<any>("employee_career_tracks", {
      filters: { career_path_id: path.id },
      limit: 1000,
    });
    for (const track of tracks.data) {
      employeeIds.add(track.employee_id);
    }
  }

  // Get skills gap for each employee
  const employeeGaps: SkillsGapResult[] = [];
  for (const empId of employeeIds) {
    const gap = await getSkillsGap(orgId, empId);
    employeeGaps.push(gap);
  }

  // Aggregate competency gaps across the department
  const competencyTotals = new Map<string, { name: string; category: string | null; totalCurrent: number; totalRequired: number; count: number }>();

  for (const empGap of employeeGaps) {
    for (const comp of empGap.competencies) {
      const existing = competencyTotals.get(comp.competency_id);
      if (existing) {
        existing.totalCurrent += comp.currentRating;
        existing.totalRequired += comp.requiredRating;
        existing.count += 1;
      } else {
        competencyTotals.set(comp.competency_id, {
          name: comp.name,
          category: comp.category,
          totalCurrent: comp.currentRating,
          totalRequired: comp.requiredRating,
          count: 1,
        });
      }
    }
  }

  const aggregatedGaps: CompetencyGap[] = [];
  for (const [id, data] of competencyTotals.entries()) {
    const avgCurrent = Math.round((data.totalCurrent / data.count) * 10) / 10;
    const avgRequired = Math.round((data.totalRequired / data.count) * 10) / 10;
    const gap = Math.round((avgRequired - avgCurrent) * 10) / 10;

    let status: "exceeds" | "meets" | "gap";
    if (gap < 0) status = "exceeds";
    else if (gap === 0) status = "meets";
    else status = "gap";

    aggregatedGaps.push({
      competency_id: id,
      name: data.name,
      category: data.category,
      currentRating: avgCurrent,
      requiredRating: avgRequired,
      gap,
      status,
    });
  }

  const avgReadiness =
    employeeGaps.length > 0
      ? Math.round(employeeGaps.reduce((sum, e) => sum + e.overallReadiness, 0) / employeeGaps.length)
      : 100;

  return {
    department: departmentId,
    employees: employeeGaps,
    aggregatedGaps,
    averageReadiness: avgReadiness,
  };
}

export function getLearningRecommendations(gaps: CompetencyGap[]): LearningRecommendation[] {
  const recommendations: LearningRecommendation[] = [];
  const gapCompetencies = gaps.filter((g) => g.status === "gap").sort((a, b) => b.gap - a.gap);

  const recommendationMap: Record<string, string> = {
    leadership: "Leadership development program recommended. Consider executive coaching and leadership workshops.",
    technical: "Technical skills training needed. Explore certifications, online courses, and hands-on projects.",
    communication: "Communication skills improvement suggested. Consider presentation workshops and writing courses.",
    core: "Core competency development required. Focus on foundational skill-building exercises and mentoring.",
    functional: "Functional expertise enhancement needed. Seek cross-functional projects and specialized training.",
    behavioral: "Behavioral competency improvement recommended. Consider 360-degree feedback coaching and self-awareness workshops.",
  };

  for (const gap of gapCompetencies) {
    const category = (gap.category ?? "core").toLowerCase();
    const recommendation =
      recommendationMap[category] ??
      `Training recommended for ${gap.name}. Gap of ${gap.gap} points between current and required level.`;

    recommendations.push({
      competency: gap.name,
      gap: gap.gap,
      recommendation,
    });
  }

  return recommendations;
}
