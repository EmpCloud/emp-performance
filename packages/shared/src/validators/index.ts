// ============================================================================
// EMP-PERFORMANCE SHARED VALIDATORS (Zod schemas)
// ============================================================================

import { z } from "zod";
import {
  ReviewCycleType,
  ReviewCycleStatus,
  ReviewType,
  ReviewStatus,
  GoalCategory,
  GoalPriority,
  GoalStatus,
  PIPStatus,
  MeetingStatus,
  FeedbackType,
  FeedbackVisibility,
  NominationStatus,
  MetricType,
} from "../types";

// ---------------------------------------------------------------------------
// Common / Reusable
// ---------------------------------------------------------------------------

export const paginationSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    perPage: z.coerce.number().int().min(1).max(100).optional(),
    per_page: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.string().optional(),
    order: z.enum(["asc", "desc"]).default("desc"),
    search: z.string().optional(),
  })
  .transform((val) => ({
    ...val,
    perPage: val.perPage ?? val.per_page ?? 20,
  }));

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Review Cycles
// ---------------------------------------------------------------------------

export const createReviewCycleSchema = z.object({
  name: z.string().min(2).max(200),
  type: z.nativeEnum(ReviewCycleType),
  start_date: z.string(),
  end_date: z.string(),
  review_deadline: z.string().optional(),
  framework_id: z.string().uuid().optional(),
  description: z.string().optional(),
});

export const launchCycleSchema = z.object({
  status: z.literal(ReviewCycleStatus.ACTIVE),
});

export const addParticipantsSchema = z.object({
  participants: z.array(
    z.object({
      employee_id: z.number().int(),
      manager_id: z.number().int().optional(),
    })
  ).min(1),
});

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export const createReviewSchema = z.object({
  cycle_id: z.string().uuid(),
  employee_id: z.number().int(),
  reviewer_id: z.number().int(),
  type: z.nativeEnum(ReviewType),
});

export const submitReviewSchema = z.object({
  overall_rating: z.number().min(1).max(5),
  summary: z.string().min(1),
  strengths: z.string().optional(),
  improvements: z.string().optional(),
});

export const rateCompetencySchema = z.object({
  competency_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comments: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Competency Frameworks
// ---------------------------------------------------------------------------

export const createFrameworkSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().optional(),
  is_active: z.boolean().default(true),
});

export const addCompetencySchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().optional(),
  category: z.string().max(100).optional(),
  weight: z.number().min(0).max(100).default(1),
  order: z.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// Goals & OKRs
// ---------------------------------------------------------------------------

export const createGoalSchema = z.object({
  title: z.string().min(2).max(300),
  description: z.string().optional(),
  category: z.nativeEnum(GoalCategory).default(GoalCategory.INDIVIDUAL),
  priority: z.nativeEnum(GoalPriority).default(GoalPriority.MEDIUM),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  cycle_id: z.string().uuid().optional(),
  parent_goal_id: z.string().uuid().optional(),
  employee_id: z.number().int().optional(),
});

export const addKeyResultSchema = z.object({
  title: z.string().min(2).max(300),
  metric_type: z.nativeEnum(MetricType).default(MetricType.NUMBER),
  target_value: z.number(),
  current_value: z.number().default(0),
  unit: z.string().max(50).optional(),
  weight: z.number().min(0).max(100).default(1),
});

export const checkInSchema = z.object({
  progress: z.number().min(0).max(100),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Performance Improvement Plans (PIPs)
// ---------------------------------------------------------------------------

export const createPIPSchema = z.object({
  employee_id: z.number().int(),
  reason: z.string().min(10),
  start_date: z.string(),
  end_date: z.string(),
});

export const addPIPObjectiveSchema = z.object({
  title: z.string().min(2).max(300),
  description: z.string().optional(),
  success_criteria: z.string().optional(),
  due_date: z.string().optional(),
});

export const addPIPUpdateSchema = z.object({
  notes: z.string().min(1),
  progress_rating: z.number().int().min(1).max(5).optional(),
});

export const closePIPSchema = z.object({
  status: z.enum([
    PIPStatus.COMPLETED_SUCCESS,
    PIPStatus.COMPLETED_FAILURE,
    PIPStatus.CANCELLED,
    PIPStatus.EXTENDED,
  ]),
  outcome_notes: z.string().optional(),
  extended_end_date: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Career Paths
// ---------------------------------------------------------------------------

export const createCareerPathSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().optional(),
  department: z.string().max(100).optional(),
  is_active: z.boolean().default(true),
});

export const addLevelSchema = z.object({
  title: z.string().min(2).max(200),
  level: z.number().int().min(1),
  description: z.string().optional(),
  requirements: z.string().optional(),
  min_years_experience: z.number().min(0).optional(),
});

export const assignCareerTrackSchema = z.object({
  employee_id: z.number().int(),
  career_path_id: z.string().uuid(),
  current_level_id: z.string().uuid(),
  target_level_id: z.string().uuid().optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// 1-on-1 Meetings
// ---------------------------------------------------------------------------

export const createMeetingSchema = z.object({
  employee_id: z.number().int(),
  title: z.string().min(2).max(200),
  scheduled_at: z.string(),
  duration_minutes: z.number().int().min(15).max(240).default(30),
});

export const addAgendaItemSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  order: z.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// Continuous Feedback
// ---------------------------------------------------------------------------

export const giveFeedbackSchema = z.object({
  to_user_id: z.number().int(),
  type: z.nativeEnum(FeedbackType),
  visibility: z.nativeEnum(FeedbackVisibility).default(FeedbackVisibility.MANAGER_VISIBLE),
  message: z.string().min(1),
  tags: z.array(z.string()).optional(),
  is_anonymous: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Peer Review Nominations
// ---------------------------------------------------------------------------

export const nominatePeerSchema = z.object({
  cycle_id: z.string().uuid(),
  employee_id: z.number().int(),
  nominee_id: z.number().int(),
});
