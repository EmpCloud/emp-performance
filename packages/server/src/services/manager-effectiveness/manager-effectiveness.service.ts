// ============================================================================
// MANAGER EFFECTIVENESS SERVICE
// Scores managers based on team engagement, review quality, and team
// performance metrics. Results stored in manager_effectiveness_scores table.
// ============================================================================

import { v4 as uuidv4 } from "uuid";
import { getDB } from "../../db/adapters";
import { logger } from "../../utils/logger";
import { NotFoundError, ValidationError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ManagerEffectivenessScore {
  id: string;
  organization_id: number;
  manager_user_id: number;
  period: string;
  overall_score: number | null;
  team_performance_score: number | null;
  review_quality_score: number | null;
  engagement_score: number | null;
  team_size: number;
  avg_team_rating: number | null;
  reviews_completed_on_time_pct: number | null;
  one_on_one_frequency: number | null;
  goal_completion_rate: number | null;
  feedback_given_count: number;
  calculated_at: string;
  created_at: string;
}

export interface ManagerScoreDetail extends ManagerEffectivenessScore {
  breakdown: {
    team_performance: {
      avg_team_rating: number | null;
      team_size: number;
      description: string;
    };
    review_quality: {
      reviews_completed_on_time_pct: number | null;
      rating_variance: number | null;
      description: string;
    };
    engagement: {
      one_on_one_frequency: number | null;
      feedback_given_count: number;
      goal_completion_rate: number | null;
      description: string;
    };
  };
}

export interface DashboardStats {
  org_average: number | null;
  top_performers: ManagerEffectivenessScore[];
  bottom_performers: ManagerEffectivenessScore[];
  total_managers: number;
  period: string;
  score_distribution: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRows<T>(result: any): T[] {
  const rows = Array.isArray(result) ? (result[0] || result) : [];
  return Array.isArray(rows) ? rows : [];
}

/**
 * Normalizes a raw metric value to a 0–100 scale.
 */
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 50;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

// Weights for the three scoring dimensions (must sum to 1)
const WEIGHTS = {
  teamPerformance: 0.4,
  reviewQuality: 0.3,
  engagement: 0.3,
};

// ---------------------------------------------------------------------------
// calculateScore
// ---------------------------------------------------------------------------

export async function calculateScore(
  orgId: number,
  managerUserId: number,
  period: string,
): Promise<ManagerEffectivenessScore> {
  const db = getDB();

  if (!period || !/^\d{4}-Q[1-4]$/.test(period)) {
    throw new ValidationError("period must be in format YYYY-QN (e.g. 2026-Q1)");
  }

  // Determine date range for the period
  const year = parseInt(period.split("-")[0]);
  const quarter = parseInt(period.split("Q")[1]);
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const periodStart = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const periodEnd = `${year}-${String(endMonth).padStart(2, "0")}-${endMonth === 2 ? 28 : [4, 6, 9, 11].includes(endMonth) ? 30 : 31}`;

  // ---- 1. Team Performance Score ----

  // Get direct reports: employees this manager manages in review_cycle_participants
  const directReportsRaw = await db.raw<any>(
    `SELECT DISTINCT rcp.employee_id
     FROM review_cycle_participants rcp
     INNER JOIN review_cycles rc ON rc.id = rcp.cycle_id AND rc.organization_id = ?
     WHERE rcp.manager_id = ?`,
    [orgId, managerUserId],
  );
  const directReports: { employee_id: number }[] = extractRows(directReportsRaw);
  const teamSize = directReports.length;

  let avgTeamRating: number | null = null;
  let teamPerformanceScore: number | null = null;

  if (teamSize > 0) {
    const employeeIds = directReports.map((d) => d.employee_id);
    const placeholders = employeeIds.map(() => "?").join(",");

    const ratingRaw = await db.raw<any>(
      `SELECT AVG(r.overall_rating) as avg_rating
       FROM reviews r
       WHERE r.organization_id = ?
         AND r.employee_id IN (${placeholders})
         AND r.status = 'submitted'
         AND r.overall_rating IS NOT NULL
         AND r.submitted_at >= ? AND r.submitted_at <= ?`,
      [orgId, ...employeeIds, periodStart, periodEnd],
    );
    const ratingRows: any[] = extractRows(ratingRaw);
    avgTeamRating = ratingRows[0]?.avg_rating != null ? Math.round(Number(ratingRows[0].avg_rating) * 100) / 100 : null;

    // Normalize: rating 1–5 mapped to 0–100
    teamPerformanceScore = avgTeamRating != null ? normalize(avgTeamRating, 1, 5) : null;
  }

  // ---- 2. Review Quality Score ----

  // Completion on time: reviews submitted before cycle review_deadline
  let reviewsCompletedOnTimePct: number | null = null;
  let ratingVariance: number | null = null;

  if (teamSize > 0) {
    const employeeIds = directReports.map((d) => d.employee_id);
    const placeholders = employeeIds.map(() => "?").join(",");

    // Reviews this manager has written for their team
    const reviewQualityRaw = await db.raw<any>(
      `SELECT r.id, r.overall_rating, r.submitted_at, rc.review_deadline
       FROM reviews r
       INNER JOIN review_cycles rc ON rc.id = r.cycle_id AND rc.organization_id = ?
       WHERE r.organization_id = ?
         AND r.reviewer_id = ?
         AND r.employee_id IN (${placeholders})
         AND r.submitted_at >= ? AND r.submitted_at <= ?`,
      [orgId, orgId, managerUserId, ...employeeIds, periodStart, periodEnd],
    );
    const managerReviews: any[] = extractRows(reviewQualityRaw);

    if (managerReviews.length > 0) {
      // On-time completion
      const onTime = managerReviews.filter(
        (r) => r.submitted_at && r.review_deadline && new Date(r.submitted_at) <= new Date(r.review_deadline),
      ).length;
      reviewsCompletedOnTimePct = Math.round((onTime / managerReviews.length) * 100);

      // Rating variance (low variance = rubber-stamping indicator)
      const ratings = managerReviews.filter((r) => r.overall_rating != null).map((r) => Number(r.overall_rating));
      if (ratings.length > 1) {
        const mean = ratings.reduce((s, r) => s + r, 0) / ratings.length;
        const variance = ratings.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / ratings.length;
        ratingVariance = Math.round(variance * 100) / 100;
      }
    }
  }

  // Review quality: on-time pct (60%) + rating variance penalty/bonus (40%)
  // Higher on-time pct is better. Very low variance (< 0.1) penalized as rubber-stamping.
  let reviewQualityScore: number | null = null;
  if (reviewsCompletedOnTimePct != null) {
    let onTimeComponent = reviewsCompletedOnTimePct; // already 0–100
    let varianceComponent = 50; // neutral default
    if (ratingVariance != null) {
      if (ratingVariance < 0.1) {
        // Very low variance — potential rubber-stamping
        varianceComponent = 20;
      } else if (ratingVariance < 0.5) {
        varianceComponent = 60;
      } else if (ratingVariance <= 2) {
        varianceComponent = 80; // Good differentiation
      } else {
        varianceComponent = 50; // Extremely high variance
      }
    }
    reviewQualityScore = Math.round(onTimeComponent * 0.6 + varianceComponent * 0.4);
  }

  // ---- 3. Engagement Score ----

  // 1-on-1 frequency: meetings conducted per direct report during period
  const meetingsRaw = await db.raw<any>(
    `SELECT COUNT(*) as cnt
     FROM one_on_one_meetings
     WHERE organization_id = ?
       AND manager_id = ?
       AND status = 'completed'
       AND scheduled_at >= ? AND scheduled_at <= ?`,
    [orgId, managerUserId, periodStart, periodEnd],
  );
  const meetingsRows: any[] = extractRows(meetingsRaw);
  const meetingCount = meetingsRows[0]?.cnt ? Number(meetingsRows[0].cnt) : 0;
  const oneOnOneFrequency = teamSize > 0 ? Math.round((meetingCount / teamSize) * 100) / 100 : 0;

  // Feedback given count
  const feedbackRaw = await db.raw<any>(
    `SELECT COUNT(*) as cnt
     FROM continuous_feedback
     WHERE organization_id = ?
       AND from_user_id = ?
       AND created_at >= ? AND created_at <= ?`,
    [orgId, managerUserId, periodStart, periodEnd],
  );
  const feedbackRows: any[] = extractRows(feedbackRaw);
  const feedbackGivenCount = feedbackRows[0]?.cnt ? Number(feedbackRows[0].cnt) : 0;

  // Goal completion rate of team
  let goalCompletionRate: number | null = null;
  if (teamSize > 0) {
    const employeeIds = directReports.map((d) => d.employee_id);
    const placeholders = employeeIds.map(() => "?").join(",");

    const goalRaw = await db.raw<any>(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
       FROM goals
       WHERE organization_id = ?
         AND employee_id IN (${placeholders})
         AND due_date >= ? AND due_date <= ?`,
      [orgId, ...employeeIds, periodStart, periodEnd],
    );
    const goalRows: any[] = extractRows(goalRaw);
    const totalGoals = goalRows[0]?.total ? Number(goalRows[0].total) : 0;
    const completedGoals = goalRows[0]?.completed ? Number(goalRows[0].completed) : 0;
    goalCompletionRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : null;
  }

  // Engagement composite: 1-on-1 frequency (40%) + feedback count (30%) + goal completion (30%)
  // Expected: ~4 1-on-1s per report per quarter (weekly-ish)
  const oneOnOneComponent = normalize(oneOnOneFrequency, 0, 6) * 0.4;
  const feedbackComponent = normalize(feedbackGivenCount, 0, teamSize * 4) * 0.3;
  const goalComponent = (goalCompletionRate != null ? goalCompletionRate : 50) * 0.3;
  const engagementScore = Math.round(oneOnOneComponent + feedbackComponent + goalComponent);

  // ---- Overall Score ----

  const scores = [
    { value: teamPerformanceScore, weight: WEIGHTS.teamPerformance },
    { value: reviewQualityScore, weight: WEIGHTS.reviewQuality },
    { value: engagementScore, weight: WEIGHTS.engagement },
  ];

  let totalWeight = 0;
  let weightedSum = 0;
  for (const s of scores) {
    if (s.value != null) {
      weightedSum += s.value * s.weight;
      totalWeight += s.weight;
    }
  }

  const overallScore = totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) / 100 : null;

  // ---- Upsert Score ----

  const existing = await db.findOne<ManagerEffectivenessScore>("manager_effectiveness_scores", {
    organization_id: orgId,
    manager_user_id: managerUserId,
    period,
  });

  const scoreData: Record<string, any> = {
    organization_id: orgId,
    manager_user_id: managerUserId,
    period,
    overall_score: overallScore,
    team_performance_score: teamPerformanceScore,
    review_quality_score: reviewQualityScore,
    engagement_score: engagementScore,
    team_size: teamSize,
    avg_team_rating: avgTeamRating,
    reviews_completed_on_time_pct: reviewsCompletedOnTimePct,
    one_on_one_frequency: oneOnOneFrequency,
    goal_completion_rate: goalCompletionRate,
    feedback_given_count: feedbackGivenCount,
    calculated_at: new Date().toISOString(),
  };

  if (existing) {
    return db.update<ManagerEffectivenessScore>("manager_effectiveness_scores", existing.id, scoreData as any);
  }

  return db.create<ManagerEffectivenessScore>("manager_effectiveness_scores", {
    id: uuidv4(),
    ...scoreData,
  } as any);
}

// ---------------------------------------------------------------------------
// listManagerScores
// ---------------------------------------------------------------------------

export async function listManagerScores(
  orgId: number,
  period: string,
): Promise<ManagerEffectivenessScore[]> {
  const db = getDB();

  const result = await db.findMany<ManagerEffectivenessScore>("manager_effectiveness_scores", {
    filters: { organization_id: orgId, period },
    sort: { field: "overall_score", order: "desc" },
    limit: 1000,
  });

  return result.data;
}

// ---------------------------------------------------------------------------
// getManagerDetail
// ---------------------------------------------------------------------------

export async function getManagerDetail(
  orgId: number,
  managerUserId: number,
  period: string,
): Promise<ManagerScoreDetail> {
  const db = getDB();

  const score = await db.findOne<ManagerEffectivenessScore>("manager_effectiveness_scores", {
    organization_id: orgId,
    manager_user_id: managerUserId,
    period,
  });

  if (!score) throw new NotFoundError("ManagerEffectivenessScore", `${managerUserId}/${period}`);

  // Build detailed breakdown descriptions
  const teamPerfDesc =
    score.avg_team_rating != null
      ? `Team of ${score.team_size} with average rating ${score.avg_team_rating}/5.`
      : `Team of ${score.team_size} with no ratings in this period.`;

  let reviewQualityDesc = "";
  if (score.reviews_completed_on_time_pct != null) {
    reviewQualityDesc = `${score.reviews_completed_on_time_pct}% of reviews completed on time.`;
  } else {
    reviewQualityDesc = "No manager reviews found for this period.";
  }

  const engagementDesc =
    `${score.one_on_one_frequency ?? 0} 1-on-1 meetings per direct report, ` +
    `${score.feedback_given_count} feedback items given, ` +
    `${score.goal_completion_rate ?? 0}% team goal completion.`;

  return {
    ...score,
    breakdown: {
      team_performance: {
        avg_team_rating: score.avg_team_rating,
        team_size: score.team_size,
        description: teamPerfDesc,
      },
      review_quality: {
        reviews_completed_on_time_pct: score.reviews_completed_on_time_pct,
        rating_variance: null, // Not stored, computed at calculation time
        description: reviewQualityDesc,
      },
      engagement: {
        one_on_one_frequency: score.one_on_one_frequency,
        feedback_given_count: score.feedback_given_count,
        goal_completion_rate: score.goal_completion_rate,
        description: engagementDesc,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// getDashboard
// ---------------------------------------------------------------------------

export async function getDashboard(orgId: number): Promise<DashboardStats> {
  const db = getDB();

  // Get the most recent period with data
  const latestRaw = await db.raw<any>(
    `SELECT period, AVG(overall_score) as org_avg, COUNT(*) as total
     FROM manager_effectiveness_scores
     WHERE organization_id = ?
     GROUP BY period
     ORDER BY period DESC
     LIMIT 1`,
    [orgId],
  );
  const latestRows: any[] = extractRows(latestRaw);

  if (latestRows.length === 0) {
    return {
      org_average: null,
      top_performers: [],
      bottom_performers: [],
      total_managers: 0,
      period: "",
      score_distribution: {},
    };
  }

  const period = latestRows[0].period;
  const orgAvg = latestRows[0].org_avg != null ? Math.round(Number(latestRows[0].org_avg) * 100) / 100 : null;
  const totalManagers = Number(latestRows[0].total);

  // Top 5 performers
  const topResult = await db.findMany<ManagerEffectivenessScore>("manager_effectiveness_scores", {
    filters: { organization_id: orgId, period },
    sort: { field: "overall_score", order: "desc" },
    limit: 5,
  });

  // Bottom 5 performers (ascending)
  const bottomResult = await db.findMany<ManagerEffectivenessScore>("manager_effectiveness_scores", {
    filters: { organization_id: orgId, period },
    sort: { field: "overall_score", order: "asc" },
    limit: 5,
  });

  // Score distribution buckets: 0-20, 20-40, 40-60, 60-80, 80-100
  const distRaw = await db.raw<any>(
    `SELECT
       CASE
         WHEN overall_score < 20 THEN '0-20'
         WHEN overall_score < 40 THEN '20-40'
         WHEN overall_score < 60 THEN '40-60'
         WHEN overall_score < 80 THEN '60-80'
         ELSE '80-100'
       END as bucket,
       COUNT(*) as cnt
     FROM manager_effectiveness_scores
     WHERE organization_id = ? AND period = ? AND overall_score IS NOT NULL
     GROUP BY bucket
     ORDER BY bucket`,
    [orgId, period],
  );
  const distRows: { bucket: string; cnt: number }[] = extractRows(distRaw);
  const distribution: Record<string, number> = {
    "0-20": 0,
    "20-40": 0,
    "40-60": 0,
    "60-80": 0,
    "80-100": 0,
  };
  for (const row of distRows) {
    distribution[row.bucket] = Number(row.cnt);
  }

  return {
    org_average: orgAvg,
    top_performers: topResult.data,
    bottom_performers: bottomResult.data,
    total_managers: totalManagers,
    period,
    score_distribution: distribution,
  };
}

// ---------------------------------------------------------------------------
// calculateAll — Batch calculate for all managers in the org
// ---------------------------------------------------------------------------

export async function calculateAll(
  orgId: number,
  period: string,
): Promise<{ calculated: number; errors: number }> {
  const db = getDB();

  if (!period || !/^\d{4}-Q[1-4]$/.test(period)) {
    throw new ValidationError("period must be in format YYYY-QN (e.g. 2026-Q1)");
  }

  // Find all distinct managers in review_cycle_participants for this org
  const managersRaw = await db.raw<any>(
    `SELECT DISTINCT rcp.manager_id
     FROM review_cycle_participants rcp
     INNER JOIN review_cycles rc ON rc.id = rcp.cycle_id AND rc.organization_id = ?
     WHERE rcp.manager_id IS NOT NULL`,
    [orgId],
  );
  const managers: { manager_id: number }[] = extractRows(managersRaw);

  let calculated = 0;
  let errors = 0;

  for (const mgr of managers) {
    try {
      await calculateScore(orgId, mgr.manager_id, period);
      calculated++;
    } catch (err) {
      logger.error(`Failed to calculate score for manager ${mgr.manager_id}`, { error: err });
      errors++;
    }
  }

  logger.info(`Manager effectiveness batch calculation complete`, { orgId, period, calculated, errors });
  return { calculated, errors };
}
