// ============================================================================
// ANALYTICS SERVICE
// Provides performance analytics: overview stats, ratings distribution,
// trends, team comparisons, goal completion, and top performers.
// ============================================================================

import { getDB } from "../../db/adapters";
import { logger } from "../../utils/logger";

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
