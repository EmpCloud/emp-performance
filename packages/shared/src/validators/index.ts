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
  SuccessionCriticality,
  SuccessionStatus,
  CandidateReadiness,
} from "../types";

const NINE_BOX_POSITIONS = [
  "Star",
  "High Performer",
  "Solid Performer",
  "High Potential",
  "Core Player",
  "Average",
  "Inconsistent",
  "Improvement Needed",
  "Action Required",
] as const;

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

export const calibrationDecisionSchema = z.object({
  rating: z.number().min(1).max(5),
  reason: z.string().trim().min(10).max(2000),
});

export const calibrationParticipantParamSchema = z.object({
  id: z.string().uuid(),
  participantId: z.string().uuid(),
});

export const transitionReviewCycleSchema = z.object({
  status: z.enum([ReviewCycleStatus.IN_REVIEW, ReviewCycleStatus.CALIBRATION]),
});

// ---------------------------------------------------------------------------
// Released review outcomes / employee response governance
// ---------------------------------------------------------------------------

export const acknowledgeReviewOutcomeSchema = z
  .object({
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

export const submitReviewOutcomeAppealSchema = z
  .object({
    reason: z.string().trim().min(20).max(4000),
  })
  .strict();

export const resolveReviewOutcomeAppealSchema = z
  .object({
    outcome: z.enum(["upheld", "not_upheld"]),
    resolution_note: z.string().trim().min(20).max(4000),
  })
  .strict();

export const reviewOutcomeAppealListQuerySchema = z.object({
  cycleId: z.string().uuid().optional(),
  status: z
    .enum(["submitted", "under_review", "upheld", "not_upheld", "withdrawn"])
    .optional(),
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

export const reassignReviewerSchema = z.object({
  reviewer_id: z.number().int(),
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

export const reorderCompetenciesSchema = z.object({
  competency_ids: z.array(z.string().uuid()).min(1),
});

// Competency proficiency levels (e.g. 1=Beginner .. 5=Expert) with behavioral
// anchors describing what each level looks like in practice.
export const createCompetencyLevelSchema = z.object({
  level: z.number().int().min(1).max(10),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  behavioral_anchors: z.array(z.string().min(1).max(1000)).max(50).optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const updateCompetencyLevelSchema = createCompetencyLevelSchema.partial();

export const reorderCompetencyLevelsSchema = z.object({
  level_ids: z.array(z.string().uuid()).min(1),
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

export const updateGoalSchema = z
  .object({
    title: z.string().min(2).max(300).optional(),
    description: z.string().nullable().optional(),
    category: z.nativeEnum(GoalCategory).optional(),
    priority: z.nativeEnum(GoalPriority).optional(),
    status: z.nativeEnum(GoalStatus).optional(),
    start_date: z.string().nullable().optional(),
    due_date: z.string().nullable().optional(),
    cycle_id: z.string().uuid().nullable().optional(),
    parent_goal_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export const addKeyResultSchema = z.object({
  title: z.string().min(2).max(300),
  metric_type: z.nativeEnum(MetricType).default(MetricType.NUMBER),
  target_value: z.number(),
  current_value: z.number().default(0),
  unit: z.string().max(50).optional(),
  weight: z.number().min(0).max(100).default(1),
});

export const updateKeyResultSchema = z
  .object({
    title: z.string().min(2).max(300).optional(),
    metric_type: z.nativeEnum(MetricType).optional(),
    target_value: z.number().optional(),
    current_value: z.number().optional(),
    unit: z.string().max(50).nullable().optional(),
    weight: z.number().min(0).max(100).optional(),
  })
  .strict();

export const checkInSchema = z
  .object({
    progress: z.number().min(0).max(100),
    notes: z.string().optional(),
    key_result_id: z.string().uuid().optional(),
    current_value: z.number().optional(),
  })
  .refine(
    (val) => val.key_result_id === undefined || val.current_value !== undefined,
    {
      message: "current_value is required when key_result_id is provided",
      path: ["current_value"],
    },
  );

// ---------------------------------------------------------------------------
// Performance Improvement Plans (PIPs)
// ---------------------------------------------------------------------------

export const createPIPSchema = z.object({
  employee_id: z.number().int(),
  manager_id: z.number().int().optional(),
  title: z.string().min(2).max(300).optional(),
  reason: z.string().min(10),
  start_date: z.string(),
  end_date: z.string(),
});

// P5/P6: validate PUT /pips/:id (was raw, unvalidated body).
export const updatePIPSchema = z
  .object({
    reason: z.string().min(10).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    outcome_notes: z.string().nullable().optional(),
  })
  .strict();

export const addPIPObjectiveSchema = z.object({
  title: z.string().min(2).max(300),
  description: z.string().optional(),
  success_criteria: z.string().optional(),
  due_date: z.string().optional(),
});

// P5/P6: validate PUT /pips/:id/objectives/:objId (was raw, unvalidated body).
// `status` is constrained to the GoalStatus enum so arbitrary strings are rejected.
export const updatePIPObjectiveSchema = z
  .object({
    title: z.string().min(2).max(300).optional(),
    description: z.string().nullable().optional(),
    success_criteria: z.string().nullable().optional(),
    due_date: z.string().nullable().optional(),
    status: z.nativeEnum(GoalStatus).optional(),
  })
  .strict();

export const addPIPUpdateSchema = z.object({
  notes: z.string().min(1),
  progress_rating: z.number().int().min(1).max(5).optional(),
  objective_id: z.string().uuid().optional(),
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

// P5: validate POST /pips/:id/extend (was reading raw body, no date ordering).
export const extendPIPSchema = z.object({
  end_date: z.string().min(1),
});

// P7: employee acknowledgement / sign-off on a PIP.
export const acknowledgePIPSchema = z.object({
  note: z.string().max(2000).optional(),
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
// Succession Planning
// ---------------------------------------------------------------------------

export const createSuccessionPlanSchema = z.object({
  position_title: z.string().min(2).max(255),
  current_holder_id: z.coerce.number().int().positive().optional(),
  department: z.string().max(100).optional(),
  criticality: z.nativeEnum(SuccessionCriticality).optional(),
  status: z.nativeEnum(SuccessionStatus).optional(),
});

export const updateSuccessionPlanSchema = z
  .object({
    position_title: z.string().min(2).max(255).optional(),
    current_holder_id: z.coerce.number().int().positive().nullable().optional(),
    department: z.string().max(100).nullable().optional(),
    criticality: z.nativeEnum(SuccessionCriticality).optional(),
    status: z.nativeEnum(SuccessionStatus).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const addSuccessionCandidateSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  readiness: z.nativeEnum(CandidateReadiness).optional(),
  development_notes: z.string().max(5000).optional(),
  nine_box_position: z.enum(NINE_BOX_POSITIONS).optional(),
});

export const updateSuccessionCandidateSchema = z
  .object({
    readiness: z.nativeEnum(CandidateReadiness).optional(),
    development_notes: z.string().max(5000).nullable().optional(),
    nine_box_position: z.enum(NINE_BOX_POSITIONS).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

// ---------------------------------------------------------------------------
// 1-on-1 Meetings
// ---------------------------------------------------------------------------

export const createMeetingSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  manager_id: z.coerce.number().int().positive(),
  title: z.string().min(2).max(200),
  scheduled_at: z.string().min(1),
  duration_minutes: z.coerce.number().int().min(5).max(480).default(30),
});

export const addAgendaItemSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  order: z.coerce.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// Continuous Feedback
// ---------------------------------------------------------------------------

export const giveFeedbackSchema = z.object({
  to_user_id: z.coerce.number().int().positive(),
  type: z.nativeEnum(FeedbackType),
  visibility: z.nativeEnum(FeedbackVisibility).default(FeedbackVisibility.MANAGER_VISIBLE),
  message: z.string().min(1).max(5000),
  tags: z.array(z.string().max(50)).max(20).optional(),
  is_anonymous: z.boolean().default(false),
});

export const updateFeedbackSchema = z
  .object({
    type: z.nativeEnum(FeedbackType).optional(),
    visibility: z.nativeEnum(FeedbackVisibility).optional(),
    message: z.string().min(1).max(5000).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Peer Review Nominations
// ---------------------------------------------------------------------------

export const nominatePeerSchema = z.object({
  cycle_id: z.string().uuid(),
  employee_id: z.number().int(),
  nominee_id: z.number().int(),
});

// Submission a nominated peer reviewer fills out for an approved nomination (#F9).
export const submitPeerReviewSchema = z.object({
  overall_rating: z.number().min(1).max(5),
  ratings: z
    .array(
      z.object({
        competency_id: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        comments: z.string().max(2000).optional(),
      }),
    )
    .max(100)
    .optional(),
  strengths: z.string().max(5000).optional(),
  improvements: z.string().max(5000).optional(),
  comments: z.string().max(5000).optional(),
});

// ---------------------------------------------------------------------------
// AI Summary
// ---------------------------------------------------------------------------

export const reviewSummaryParamsSchema = z.object({
  reviewId: z.string().uuid(),
});

export const employeeSummaryParamsSchema = z.object({
  userId: z.coerce.number().int(),
});

export const employeeSummaryQuerySchema = z.object({
  cycleId: z.string().uuid(),
});

export const teamSummaryParamsSchema = z.object({
  managerId: z.coerce.number().int(),
});

export const teamSummaryQuerySchema = z.object({
  cycleId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Manager Effectiveness
// ---------------------------------------------------------------------------

export const periodQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-Q[1-4]$/, "period must be in format YYYY-QN (e.g. 2026-Q1)"),
});

export const calculateScoreParamsSchema = z.object({
  managerId: z.coerce.number().int(),
});

export const calculateScoreBodySchema = z.object({
  period: z.string().regex(/^\d{4}-Q[1-4]$/, "period must be in format YYYY-QN (e.g. 2026-Q1)"),
});

export const calculateAllBodySchema = z.object({
  period: z.string().regex(/^\d{4}-Q[1-4]$/, "period must be in format YYYY-QN (e.g. 2026-Q1)"),
});

export const managerDetailParamsSchema = z.object({
  managerId: z.coerce.number().int(),
});

export const managerDetailQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-Q[1-4]$/, "period must be in format YYYY-QN (e.g. 2026-Q1)"),
});

// ---------------------------------------------------------------------------
// One-on-One Meetings (Batch 4)
// ---------------------------------------------------------------------------

export const updateMeetingSchema = z
  .object({
    title: z.string().min(2).max(200).optional(),
    scheduled_at: z.string().min(1).optional(),
    duration_minutes: z.coerce.number().int().min(5).max(480).optional(),
    meeting_notes: z.string().max(20000).nullable().optional(),
    action_items: z.string().max(20000).nullable().optional(),
    status: z.nativeEnum(MeetingStatus).optional(),
  })
  .strict();

export const requestMeetingSchema = z.object({
  manager_id: z.coerce.number().int().positive(),
  title: z.string().min(2).max(200),
  scheduled_at: z.string().min(1),
  duration_minutes: z.coerce.number().int().min(5).max(480).optional(),
});

export const updateAgendaItemSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(5000).nullable().optional(),
    order: z.coerce.number().int().min(0).optional(),
    is_discussed: z.boolean().optional(),
  })
  .strict();

export const actionItemStatusEnum = z.enum(["open", "in_progress", "done", "cancelled"]);

export const createActionItemSchema = z.object({
  description: z.string().min(1).max(1000),
  assignee_id: z.coerce.number().int().positive().nullable().optional(),
  due_date: z.string().min(1).nullable().optional(),
  status: actionItemStatusEnum.optional(),
});

export const updateActionItemSchema = z
  .object({
    description: z.string().min(1).max(1000).optional(),
    assignee_id: z.coerce.number().int().positive().nullable().optional(),
    due_date: z.string().min(1).nullable().optional(),
    status: actionItemStatusEnum.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Potential Assessments (nine-box) — A5/A7
// ---------------------------------------------------------------------------

export const createPotentialAssessmentSchema = z.object({
  cycle_id: z.string().uuid(),
  employee_id: z.coerce.number().int().positive(),
  potential_rating: z.coerce.number().int().min(1).max(5),
  notes: z.string().max(2000).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Performance Letters (Batch 8)
// ---------------------------------------------------------------------------

export const letterTypeEnum = z.enum([
  "appraisal",
  "increment",
  "promotion",
  "confirmation",
  "warning",
]);

export const createLetterTemplateSchema = z.object({
  type: letterTypeEnum,
  name: z.string().min(1).max(255),
  content_template: z.string().min(1).max(50000),
  is_default: z.boolean().optional(),
});

export const updateLetterTemplateSchema = z
  .object({
    type: letterTypeEnum.optional(),
    name: z.string().min(1).max(255).optional(),
    content_template: z.string().min(1).max(50000).optional(),
    is_default: z.boolean().optional(),
  })
  .strict();

export const generateLetterSchema = z.object({
  employee_id: z.coerce.number().int().positive(),
  template_id: z.string().uuid(),
  cycle_id: z.string().uuid().nullable().optional(),
});

export const previewLetterTemplateSchema = z.object({
  content_template: z.string().min(1).max(50000).optional(),
  template_id: z.string().uuid().optional(),
  employee_id: z.coerce.number().int().positive().optional(),
  cycle_id: z.string().uuid().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Auth & account management (Batch 9 — platform)
// ---------------------------------------------------------------------------

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);

export const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
});

export const registerSchema = z.object({
  orgName: z.string().min(1).max(255),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().max(255),
  password: passwordSchema,
  country: z.string().min(2).max(64).optional(),
});

export const ssoSchema = z.object({
  token: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

// ---------------------------------------------------------------------------
// Notifications (Batch 9 — platform)
// ---------------------------------------------------------------------------

export const notificationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  unreadOnly: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((v) => v === true || v === "true"),
});

export const notificationLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(["sent", "failed"]).optional(),
  category: z.string().max(64).optional(),
});

// ---------------------------------------------------------------------------
// Notification / general settings (Batch 9 — PL7)
// ---------------------------------------------------------------------------

export const updateNotificationSettingsSchema = z
  .object({
    review_reminders_enabled: z.boolean().optional(),
    pip_reminders_enabled: z.boolean().optional(),
    meeting_reminders_enabled: z.boolean().optional(),
    goal_reminders_enabled: z.boolean().optional(),
    reminder_days_before_deadline: z.coerce.number().int().min(1).max(60).optional(),
    rating_scale: z.coerce.number().int().min(2).max(10).optional(),
    default_framework: z.string().max(255).optional(),
  })
  .strict();
