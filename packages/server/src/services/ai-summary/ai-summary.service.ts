// ============================================================================
// AI PERFORMANCE SUMMARY SERVICE
// Generates structured performance summaries from existing review, goal,
// and feedback data. Template-based by default; optionally uses OpenAI GPT
// when OPENAI_API_KEY is set.
// ============================================================================

import { getDB } from "../../db/adapters";
import { logger } from "../../utils/logger";
import { NotFoundError } from "../../utils/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CompetencyRatingDetail {
  competency_id: string;
  competency_name: string;
  category: string | null;
  rating: number;
  comments: string | null;
}

interface FeedbackTheme {
  type: string;
  count: number;
  sample_messages: string[];
}

interface GoalSummaryItem {
  id: string;
  title: string;
  status: string;
  progress: number;
  category: string;
}

export interface ReviewSummary {
  review_id: string;
  employee_id: number;
  reviewer_id: number;
  cycle_id: string;
  review_type: string;
  overall_rating: number | null;
  competency_analysis: {
    average_rating: number;
    strengths: CompetencyRatingDetail[];
    weaknesses: CompetencyRatingDetail[];
    all_ratings: CompetencyRatingDetail[];
  };
  goal_progress: {
    total_goals: number;
    completed: number;
    in_progress: number;
    completion_percentage: number;
    average_progress: number;
    highlights: GoalSummaryItem[];
  };
  feedback_themes: {
    positive: FeedbackTheme;
    constructive: FeedbackTheme;
    general: FeedbackTheme;
    total_feedback_count: number;
  };
  recommended_actions: string[];
  narrative_summary: string;
  generated_at: string;
}

export interface EmployeeSummary {
  employee_id: number;
  cycle_id: string;
  reviews: {
    self_review: ReviewSummary | null;
    manager_review: ReviewSummary | null;
    peer_reviews: ReviewSummary[];
  };
  consolidated_rating: number | null;
  competency_analysis: {
    average_rating: number;
    strengths: string[];
    development_areas: string[];
  };
  goal_progress: {
    total_goals: number;
    completed: number;
    completion_percentage: number;
    average_progress: number;
  };
  feedback_summary: {
    total_received: number;
    positive_count: number;
    constructive_count: number;
    themes: string[];
  };
  recommended_actions: string[];
  narrative_summary: string;
  generated_at: string;
}

export interface TeamMemberSummary {
  employee_id: number;
  rating: number | null;
  goal_completion_pct: number;
  feedback_received: number;
  status: "top_performer" | "on_track" | "needs_attention" | "no_data";
}

export interface TeamSummary {
  manager_id: number;
  cycle_id: string;
  team_size: number;
  average_rating: number | null;
  rating_distribution: Record<string, number>;
  goal_completion_rate: number;
  top_performers: TeamMemberSummary[];
  needs_attention: TeamMemberSummary[];
  team_members: TeamMemberSummary[];
  recommended_actions: string[];
  narrative_summary: string;
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRows<T>(result: any): T[] {
  const rows = Array.isArray(result) ? (result[0] || result) : [];
  return Array.isArray(rows) ? rows : [];
}

const RATING_THRESHOLD = 3; // Below this = weakness / needs improvement

function buildRecommendedActions(
  weaknesses: CompetencyRatingDetail[],
  goalCompletionPct: number,
  constructiveFeedbackCount: number,
): string[] {
  const actions: string[] = [];

  for (const w of weaknesses.slice(0, 3)) {
    actions.push(
      `Improve "${w.competency_name}" (rated ${w.rating}/5) — consider targeted training or mentoring in ${w.category || "this area"}.`,
    );
  }

  if (goalCompletionPct < 50) {
    actions.push(
      `Goal completion is at ${goalCompletionPct}%. Review goal-setting process and provide additional support to achieve targets.`,
    );
  } else if (goalCompletionPct < 80) {
    actions.push(
      `Goal completion is at ${goalCompletionPct}%. Close to target — focus on removing blockers for remaining goals.`,
    );
  }

  if (constructiveFeedbackCount >= 3) {
    actions.push(
      `${constructiveFeedbackCount} constructive feedback items received. Schedule a coaching conversation to discuss improvement areas.`,
    );
  }

  if (actions.length === 0) {
    actions.push("Continue current trajectory. Consider stretch goals or mentoring opportunities for further growth.");
  }

  return actions;
}

function buildNarrativeSummary(
  avgRating: number,
  goalCompletionPct: number,
  strengths: CompetencyRatingDetail[],
  weaknesses: CompetencyRatingDetail[],
  positiveFeedbackCount: number,
  constructiveFeedbackCount: number,
): string {
  const parts: string[] = [];

  // Rating assessment
  if (avgRating >= 4) {
    parts.push(`Strong overall performance with an average competency rating of ${avgRating.toFixed(1)}/5.`);
  } else if (avgRating >= 3) {
    parts.push(`Meets expectations with an average competency rating of ${avgRating.toFixed(1)}/5.`);
  } else if (avgRating > 0) {
    parts.push(`Below expectations with an average competency rating of ${avgRating.toFixed(1)}/5. Improvement needed.`);
  }

  // Strengths
  if (strengths.length > 0) {
    const topNames = strengths.slice(0, 3).map((s) => s.competency_name).join(", ");
    parts.push(`Key strengths include: ${topNames}.`);
  }

  // Weaknesses
  if (weaknesses.length > 0) {
    const bottomNames = weaknesses.slice(0, 3).map((w) => w.competency_name).join(", ");
    parts.push(`Development areas: ${bottomNames}.`);
  }

  // Goals
  parts.push(`Goal completion stands at ${goalCompletionPct}%.`);

  // Feedback
  if (positiveFeedbackCount > 0 || constructiveFeedbackCount > 0) {
    parts.push(
      `Received ${positiveFeedbackCount} positive and ${constructiveFeedbackCount} constructive feedback items from peers.`,
    );
  }

  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Optional OpenAI integration
// ---------------------------------------------------------------------------

async function tryOpenAISummary(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an HR performance management assistant. Generate concise, professional performance summaries based on the data provided. Be specific and actionable. Limit to 3-4 sentences.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      logger.warn("OpenAI API returned non-OK status, falling back to template");
      return null;
    }

    const data = (await response.json()) as any;
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    logger.warn("OpenAI API call failed, falling back to template summary", { error: err });
    return null;
  }
}

// ---------------------------------------------------------------------------
// generateReviewSummary
// ---------------------------------------------------------------------------

export async function generateReviewSummary(orgId: number, reviewId: string): Promise<ReviewSummary> {
  const db = getDB();

  // 1. Fetch the review
  const review = await db.findOne<any>("reviews", { id: reviewId, organization_id: orgId });
  if (!review) throw new NotFoundError("Review", reviewId);

  // 2. Fetch competency ratings with competency names
  const ratingsRaw = await db.raw<any>(
    `SELECT rcr.competency_id, rcr.rating, rcr.comments,
            c.name as competency_name, c.category
     FROM review_competency_ratings rcr
     INNER JOIN competencies c ON c.id = rcr.competency_id
     WHERE rcr.review_id = ?
     ORDER BY rcr.rating DESC`,
    [reviewId],
  );
  const ratings: CompetencyRatingDetail[] = extractRows(ratingsRaw);

  const avgRating =
    ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : 0;

  const strengths = ratings.filter((r) => r.rating >= 4);
  const weaknesses = ratings.filter((r) => r.rating < RATING_THRESHOLD);

  // 3. Fetch goals for this employee in this cycle
  const cycle = await db.findOne<any>("review_cycles", { id: review.cycle_id });
  const goalsRaw = await db.raw<any>(
    `SELECT id, title, status, progress, category
     FROM goals
     WHERE organization_id = ? AND employee_id = ?
       AND (cycle_id = ? OR (due_date >= ? AND due_date <= ?))
     ORDER BY progress DESC`,
    [orgId, review.employee_id, review.cycle_id, cycle?.start_date || "2000-01-01", cycle?.end_date || "2099-12-31"],
  );
  const goals: GoalSummaryItem[] = extractRows(goalsRaw);
  const completedGoals = goals.filter((g) => g.status === "completed");
  const inProgressGoals = goals.filter((g) => g.status === "in_progress");
  const goalCompletionPct = goals.length > 0 ? Math.round((completedGoals.length / goals.length) * 100) : 0;
  const avgProgress = goals.length > 0 ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0;

  // 4. Fetch feedback for this employee
  const feedbackRaw = await db.raw<any>(
    `SELECT type, message FROM continuous_feedback
     WHERE organization_id = ? AND to_user_id = ?
     ORDER BY created_at DESC LIMIT 50`,
    [orgId, review.employee_id],
  );
  const feedbackItems: { type: string; message: string }[] = extractRows(feedbackRaw);

  const buildTheme = (type: string): FeedbackTheme => {
    const items = feedbackItems.filter((f) => f.type === type);
    return {
      type,
      count: items.length,
      sample_messages: items.slice(0, 3).map((f) => f.message),
    };
  };

  const positiveTheme = buildTheme("kudos");
  const constructiveTheme = buildTheme("constructive");
  const generalTheme = buildTheme("general");

  // 5. Build recommended actions
  const recommendedActions = buildRecommendedActions(weaknesses, goalCompletionPct, constructiveTheme.count);

  // 6. Build narrative
  let narrative = buildNarrativeSummary(
    avgRating,
    goalCompletionPct,
    strengths,
    weaknesses,
    positiveTheme.count,
    constructiveTheme.count,
  );

  // 7. Optionally enhance with OpenAI
  const aiNarrative = await tryOpenAISummary(
    `Generate a performance review summary for an employee with:\n` +
      `- Average competency rating: ${avgRating.toFixed(1)}/5\n` +
      `- Strengths: ${strengths.map((s) => s.competency_name).join(", ") || "none identified"}\n` +
      `- Weaknesses: ${weaknesses.map((w) => w.competency_name).join(", ") || "none identified"}\n` +
      `- Goal completion: ${goalCompletionPct}% (${completedGoals.length}/${goals.length} goals)\n` +
      `- Positive feedback count: ${positiveTheme.count}\n` +
      `- Constructive feedback count: ${constructiveTheme.count}`,
  );
  if (aiNarrative) narrative = aiNarrative;

  return {
    review_id: reviewId,
    employee_id: review.employee_id,
    reviewer_id: review.reviewer_id,
    cycle_id: review.cycle_id,
    review_type: review.type,
    overall_rating: review.overall_rating,
    competency_analysis: {
      average_rating: Math.round(avgRating * 100) / 100,
      strengths,
      weaknesses,
      all_ratings: ratings,
    },
    goal_progress: {
      total_goals: goals.length,
      completed: completedGoals.length,
      in_progress: inProgressGoals.length,
      completion_percentage: goalCompletionPct,
      average_progress: avgProgress,
      highlights: goals.slice(0, 5),
    },
    feedback_themes: {
      positive: positiveTheme,
      constructive: constructiveTheme,
      general: generalTheme,
      total_feedback_count: feedbackItems.length,
    },
    recommended_actions: recommendedActions,
    narrative_summary: narrative,
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// generateEmployeeSummary
// ---------------------------------------------------------------------------

export async function generateEmployeeSummary(
  orgId: number,
  userId: number,
  cycleId: string,
): Promise<EmployeeSummary> {
  const db = getDB();

  // Verify cycle exists
  const cycle = await db.findOne<any>("review_cycles", { id: cycleId, organization_id: orgId });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  // Fetch all reviews for this employee in this cycle
  const reviewsResult = await db.findMany<any>("reviews", {
    filters: { organization_id: orgId, employee_id: userId, cycle_id: cycleId },
    limit: 100,
  });
  const reviews = reviewsResult.data;

  // Generate summaries for each review
  let selfReview: ReviewSummary | null = null;
  let managerReview: ReviewSummary | null = null;
  const peerReviews: ReviewSummary[] = [];

  for (const r of reviews) {
    if (r.status !== "submitted") continue;
    const summary = await generateReviewSummary(orgId, r.id);
    if (r.type === "self") selfReview = summary;
    else if (r.type === "manager") managerReview = summary;
    else if (r.type === "peer") peerReviews.push(summary);
  }

  // Consolidated rating: average of all submitted review ratings
  const submittedReviews = reviews.filter((r: any) => r.status === "submitted" && r.overall_rating != null);
  const consolidatedRating =
    submittedReviews.length > 0
      ? Math.round(
          (submittedReviews.reduce((s: number, r: any) => s + r.overall_rating, 0) / submittedReviews.length) * 100,
        ) / 100
      : null;

  // Aggregate competency ratings across all reviews
  const allCompRatingsRaw = await db.raw<any>(
    `SELECT c.name, AVG(rcr.rating) as avg_rating
     FROM review_competency_ratings rcr
     INNER JOIN reviews r ON r.id = rcr.review_id
     INNER JOIN competencies c ON c.id = rcr.competency_id
     WHERE r.organization_id = ? AND r.employee_id = ? AND r.cycle_id = ? AND r.status = 'submitted'
     GROUP BY c.id, c.name
     ORDER BY avg_rating DESC`,
    [orgId, userId, cycleId],
  );
  const allCompRatings: { name: string; avg_rating: number }[] = extractRows(allCompRatingsRaw);

  const overallCompAvg =
    allCompRatings.length > 0
      ? Math.round((allCompRatings.reduce((s, c) => s + Number(c.avg_rating), 0) / allCompRatings.length) * 100) / 100
      : 0;

  const compStrengths = allCompRatings.filter((c) => Number(c.avg_rating) >= 4).map((c) => c.name);
  const compDevAreas = allCompRatings.filter((c) => Number(c.avg_rating) < RATING_THRESHOLD).map((c) => c.name);

  // Goal progress
  const goalsRaw = await db.raw<any>(
    `SELECT status, progress FROM goals
     WHERE organization_id = ? AND employee_id = ?
       AND (cycle_id = ? OR (due_date >= ? AND due_date <= ?))`,
    [orgId, userId, cycleId, cycle.start_date, cycle.end_date],
  );
  const goals: { status: string; progress: number }[] = extractRows(goalsRaw);
  const completedGoals = goals.filter((g) => g.status === "completed");
  const goalCompletionPct = goals.length > 0 ? Math.round((completedGoals.length / goals.length) * 100) : 0;
  const avgProgress = goals.length > 0 ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0;

  // Feedback summary
  const feedbackRaw = await db.raw<any>(
    `SELECT type, message FROM continuous_feedback
     WHERE organization_id = ? AND to_user_id = ?
     ORDER BY created_at DESC LIMIT 100`,
    [orgId, userId],
  );
  const feedbackItems: { type: string; message: string }[] = extractRows(feedbackRaw);
  const positiveCount = feedbackItems.filter((f) => f.type === "kudos").length;
  const constructiveCount = feedbackItems.filter((f) => f.type === "constructive").length;

  // Identify themes from feedback messages (simple word frequency)
  const themes: string[] = [];
  if (positiveCount > constructiveCount) themes.push("Predominantly positive peer sentiment");
  if (constructiveCount >= 3) themes.push("Multiple constructive feedback items — potential development area");
  if (feedbackItems.length === 0) themes.push("No peer feedback received");

  // Recommended actions
  const recommendedActions: string[] = [];
  if (compDevAreas.length > 0) {
    recommendedActions.push(`Focus development on: ${compDevAreas.slice(0, 3).join(", ")}.`);
  }
  if (goalCompletionPct < 70) {
    recommendedActions.push(`Goal completion at ${goalCompletionPct}% — review priorities and remove blockers.`);
  }
  if (constructiveCount >= 3) {
    recommendedActions.push("Address recurring constructive feedback themes through coaching.");
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push("Performing well overall. Consider stretch assignments for continued growth.");
  }

  // Build narrative
  let narrative = buildNarrativeSummary(
    overallCompAvg,
    goalCompletionPct,
    allCompRatings
      .filter((c) => Number(c.avg_rating) >= 4)
      .map((c) => ({ competency_id: "", competency_name: c.name, category: null, rating: Number(c.avg_rating), comments: null })),
    allCompRatings
      .filter((c) => Number(c.avg_rating) < RATING_THRESHOLD)
      .map((c) => ({ competency_id: "", competency_name: c.name, category: null, rating: Number(c.avg_rating), comments: null })),
    positiveCount,
    constructiveCount,
  );

  const aiNarrative = await tryOpenAISummary(
    `Generate a comprehensive employee performance summary:\n` +
      `- Consolidated rating: ${consolidatedRating ?? "N/A"}\n` +
      `- Reviews: ${submittedReviews.length} submitted (self, manager, ${peerReviews.length} peers)\n` +
      `- Competency avg: ${overallCompAvg}/5. Strengths: ${compStrengths.join(", ") || "none"}. Dev areas: ${compDevAreas.join(", ") || "none"}\n` +
      `- Goal completion: ${goalCompletionPct}%\n` +
      `- Feedback: ${positiveCount} positive, ${constructiveCount} constructive`,
  );
  if (aiNarrative) narrative = aiNarrative;

  return {
    employee_id: userId,
    cycle_id: cycleId,
    reviews: {
      self_review: selfReview,
      manager_review: managerReview,
      peer_reviews: peerReviews,
    },
    consolidated_rating: consolidatedRating,
    competency_analysis: {
      average_rating: overallCompAvg,
      strengths: compStrengths,
      development_areas: compDevAreas,
    },
    goal_progress: {
      total_goals: goals.length,
      completed: completedGoals.length,
      completion_percentage: goalCompletionPct,
      average_progress: avgProgress,
    },
    feedback_summary: {
      total_received: feedbackItems.length,
      positive_count: positiveCount,
      constructive_count: constructiveCount,
      themes,
    },
    recommended_actions: recommendedActions,
    narrative_summary: narrative,
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// generateTeamSummary
// ---------------------------------------------------------------------------

export async function generateTeamSummary(
  orgId: number,
  managerId: number,
  cycleId: string,
): Promise<TeamSummary> {
  const db = getDB();

  // Verify cycle
  const cycle = await db.findOne<any>("review_cycles", { id: cycleId, organization_id: orgId });
  if (!cycle) throw new NotFoundError("ReviewCycle", cycleId);

  // Get direct reports from review_cycle_participants
  const participantsResult = await db.findMany<any>("review_cycle_participants", {
    filters: { cycle_id: cycleId, manager_id: managerId },
    limit: 1000,
  });
  const directReports = participantsResult.data;
  const teamSize = directReports.length;

  // For each team member, gather ratings and goal data
  const teamMembers: TeamMemberSummary[] = [];
  const allRatings: number[] = [];
  const ratingDist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let totalGoals = 0;
  let completedGoals = 0;

  for (const participant of directReports) {
    const empId = participant.employee_id;

    // Get average rating from submitted reviews
    const ratingRaw = await db.raw<any>(
      `SELECT AVG(overall_rating) as avg_rating
       FROM reviews
       WHERE organization_id = ? AND employee_id = ? AND cycle_id = ?
         AND status = 'submitted' AND overall_rating IS NOT NULL`,
      [orgId, empId, cycleId],
    );
    const ratingRows: { avg_rating: number | null }[] = extractRows(ratingRaw);
    const avgRating = ratingRows[0]?.avg_rating != null ? Number(ratingRows[0].avg_rating) : null;

    if (avgRating != null) {
      allRatings.push(avgRating);
      const bucket = String(Math.min(5, Math.max(1, Math.round(avgRating))));
      ratingDist[bucket] = (ratingDist[bucket] || 0) + 1;
    }

    // Goal completion
    const goalsRaw = await db.raw<any>(
      `SELECT status FROM goals
       WHERE organization_id = ? AND employee_id = ?
         AND (cycle_id = ? OR (due_date >= ? AND due_date <= ?))`,
      [orgId, empId, cycleId, cycle.start_date, cycle.end_date],
    );
    const empGoals: { status: string }[] = extractRows(goalsRaw);
    const empCompleted = empGoals.filter((g) => g.status === "completed").length;
    const goalCompPct = empGoals.length > 0 ? Math.round((empCompleted / empGoals.length) * 100) : 0;
    totalGoals += empGoals.length;
    completedGoals += empCompleted;

    // Feedback count
    const feedbackCount = await db.count("continuous_feedback", {
      organization_id: orgId,
      to_user_id: empId,
    });

    // Determine status
    let status: TeamMemberSummary["status"] = "no_data";
    if (avgRating != null) {
      if (avgRating >= 4) status = "top_performer";
      else if (avgRating >= RATING_THRESHOLD) status = "on_track";
      else status = "needs_attention";
    }

    teamMembers.push({
      employee_id: empId,
      rating: avgRating != null ? Math.round(avgRating * 100) / 100 : null,
      goal_completion_pct: goalCompPct,
      feedback_received: feedbackCount,
      status,
    });
  }

  const avgTeamRating =
    allRatings.length > 0
      ? Math.round((allRatings.reduce((s, r) => s + r, 0) / allRatings.length) * 100) / 100
      : null;

  const overallGoalCompletion = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

  const topPerformers = teamMembers.filter((m) => m.status === "top_performer");
  const needsAttention = teamMembers.filter((m) => m.status === "needs_attention");

  // Recommended actions for the manager
  const recommendedActions: string[] = [];
  if (needsAttention.length > 0) {
    recommendedActions.push(
      `${needsAttention.length} team member(s) rated below expectations. Schedule coaching sessions and create development plans.`,
    );
  }
  if (overallGoalCompletion < 60) {
    recommendedActions.push(
      `Team goal completion at ${overallGoalCompletion}%. Review goal alignment and remove blockers across the team.`,
    );
  }
  if (teamMembers.filter((m) => m.status === "no_data").length > 0) {
    recommendedActions.push(
      `${teamMembers.filter((m) => m.status === "no_data").length} team member(s) have no review data. Ensure all reviews are submitted.`,
    );
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push("Team performing well. Consider team-level stretch goals or cross-functional projects.");
  }

  // Build narrative
  let narrative = `Team of ${teamSize} members with ${avgTeamRating != null ? `an average rating of ${avgTeamRating}/5` : "no ratings yet"}.`;
  narrative += ` ${topPerformers.length} top performer(s) and ${needsAttention.length} member(s) needing attention.`;
  narrative += ` Overall goal completion stands at ${overallGoalCompletion}%.`;

  const aiNarrative = await tryOpenAISummary(
    `Generate a team performance summary for a manager:\n` +
      `- Team size: ${teamSize}\n` +
      `- Average team rating: ${avgTeamRating ?? "N/A"}/5\n` +
      `- Top performers: ${topPerformers.length}\n` +
      `- Needs attention: ${needsAttention.length}\n` +
      `- Goal completion: ${overallGoalCompletion}%\n` +
      `- Rating distribution: ${JSON.stringify(ratingDist)}`,
  );
  if (aiNarrative) narrative = aiNarrative;

  return {
    manager_id: managerId,
    cycle_id: cycleId,
    team_size: teamSize,
    average_rating: avgTeamRating,
    rating_distribution: ratingDist,
    goal_completion_rate: overallGoalCompletion,
    top_performers: topPerformers,
    needs_attention: needsAttention,
    team_members: teamMembers,
    recommended_actions: recommendedActions,
    narrative_summary: narrative,
    generated_at: new Date().toISOString(),
  };
}
