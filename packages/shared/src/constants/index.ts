// ============================================================================
// EMP-PERFORMANCE CONSTANTS
// ============================================================================

import { ReviewCycleType, GoalCategory, PIPStatus, FeedbackType } from "../types";

// ---------------------------------------------------------------------------
// Rating Scales
// ---------------------------------------------------------------------------

export const RATING_SCALES = {
  1: { label: "Needs Improvement", color: "#EF4444" },
  2: { label: "Below Expectations", color: "#F97316" },
  3: { label: "Meets Expectations", color: "#EAB308" },
  4: { label: "Exceeds Expectations", color: "#22C55E" },
  5: { label: "Outstanding", color: "#10B981" },
} as const;

// ---------------------------------------------------------------------------
// Review Cycle Types
// ---------------------------------------------------------------------------

export const REVIEW_CYCLE_TYPES = [
  { key: ReviewCycleType.QUARTERLY, label: "Quarterly Review" },
  { key: ReviewCycleType.ANNUAL, label: "Annual Review" },
  { key: ReviewCycleType.MID_YEAR, label: "Mid-Year Review" },
  { key: ReviewCycleType.THREE_SIXTY_DEGREE, label: "360-Degree Review" },
  { key: ReviewCycleType.PROBATION, label: "Probation Review" },
] as const;

// ---------------------------------------------------------------------------
// Goal Categories
// ---------------------------------------------------------------------------

export const GOAL_CATEGORIES = [
  { key: GoalCategory.INDIVIDUAL, label: "Individual", color: "#3B82F6" },
  { key: GoalCategory.TEAM, label: "Team", color: "#8B5CF6" },
  { key: GoalCategory.DEPARTMENT, label: "Department", color: "#F59E0B" },
  { key: GoalCategory.COMPANY, label: "Company", color: "#10B981" },
] as const;

// ---------------------------------------------------------------------------
// PIP Statuses
// ---------------------------------------------------------------------------

export const PIP_STATUSES = [
  { key: PIPStatus.DRAFT, label: "Draft", color: "#6B7280" },
  { key: PIPStatus.ACTIVE, label: "Active", color: "#3B82F6" },
  { key: PIPStatus.EXTENDED, label: "Extended", color: "#F59E0B" },
  { key: PIPStatus.COMPLETED_SUCCESS, label: "Completed (Success)", color: "#10B981" },
  { key: PIPStatus.COMPLETED_FAILURE, label: "Completed (Failure)", color: "#EF4444" },
  { key: PIPStatus.CANCELLED, label: "Cancelled", color: "#9CA3AF" },
] as const;

// ---------------------------------------------------------------------------
// Feedback Tags
// ---------------------------------------------------------------------------

export const FEEDBACK_TAGS = [
  "leadership",
  "teamwork",
  "communication",
  "technical_skills",
  "innovation",
  "problem_solving",
  "time_management",
  "customer_focus",
  "mentoring",
  "initiative",
] as const;

// ---------------------------------------------------------------------------
// Competency Categories
// ---------------------------------------------------------------------------

export const COMPETENCY_CATEGORIES = [
  "core",
  "technical",
  "leadership",
  "functional",
  "behavioral",
] as const;
