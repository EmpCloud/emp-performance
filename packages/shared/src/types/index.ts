// ============================================================================
// EMP-PERFORMANCE SHARED TYPES
// These types are the single source of truth for both server and client.
// ============================================================================

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum ReviewCycleType {
  QUARTERLY = "quarterly",
  ANNUAL = "annual",
  MID_YEAR = "mid_year",
  THREE_SIXTY_DEGREE = "360_degree",
  PROBATION = "probation",
}

export enum ReviewCycleStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  IN_REVIEW = "in_review",
  CALIBRATION = "calibration",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export enum ReviewType {
  SELF = "self",
  MANAGER = "manager",
  PEER = "peer",
}

export enum ReviewStatus {
  PENDING = "pending",
  DRAFT = "draft",
  SUBMITTED = "submitted",
}

export enum GoalCategory {
  INDIVIDUAL = "individual",
  TEAM = "team",
  DEPARTMENT = "department",
  COMPANY = "company",
}

export enum GoalPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export enum GoalStatus {
  NOT_STARTED = "not_started",
  IN_PROGRESS = "in_progress",
  AT_RISK = "at_risk",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export enum PIPStatus {
  DRAFT = "draft",
  ACTIVE = "active",
  EXTENDED = "extended",
  COMPLETED_SUCCESS = "completed_success",
  COMPLETED_FAILURE = "completed_failure",
  CANCELLED = "cancelled",
}

export enum MeetingStatus {
  SCHEDULED = "scheduled",
  COMPLETED = "completed",
  CANCELLED = "cancelled",
}

export enum FeedbackType {
  KUDOS = "kudos",
  CONSTRUCTIVE = "constructive",
  GENERAL = "general",
}

export enum FeedbackVisibility {
  PRIVATE = "private",
  MANAGER_VISIBLE = "manager_visible",
  PUBLIC = "public",
}

export enum NominationStatus {
  PENDING = "pending",
  APPROVED = "approved",
  DECLINED = "declined",
}

export enum MetricType {
  NUMBER = "number",
  PERCENTAGE = "percentage",
  CURRENCY = "currency",
  BOOLEAN = "boolean",
}

export enum SuccessionCriticality {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export enum SuccessionStatus {
  IDENTIFIED = "identified",
  DEVELOPING = "developing",
  READY = "ready",
}

export enum CandidateReadiness {
  READY_NOW = "ready_now",
  ONE_TWO_YEARS = "1_2_years",
  THREE_FIVE_YEARS = "3_5_years",
}

export type NineBoxPosition =
  | "Star"
  | "High Performer"
  | "Solid Performer"
  | "High Potential"
  | "Core Player"
  | "Average"
  | "Inconsistent"
  | "Improvement Needed"
  | "Action Required";

// ---------------------------------------------------------------------------
// API Response envelope
// ---------------------------------------------------------------------------

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthPayload {
  empcloudUserId: number;
  empcloudOrgId: number;
  performanceProfileId: string | null;
  role: "super_admin" | "org_admin" | "hr_admin" | "hr_manager" | "employee";
  email: string;
  firstName: string;
  lastName: string;
  orgName: string;
}

// ---------------------------------------------------------------------------
// Core Interfaces
// ---------------------------------------------------------------------------

export interface CompetencyFramework {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface Competency {
  id: string;
  framework_id: string;
  name: string;
  description: string | null;
  category: string | null;
  weight: number;
  order: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewCycle {
  id: string;
  organization_id: number;
  name: string;
  type: ReviewCycleType;
  status: ReviewCycleStatus;
  start_date: string;
  end_date: string;
  review_deadline: string | null;
  framework_id: string | null;
  description: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewCycleParticipant {
  id: string;
  cycle_id: string;
  employee_id: number;
  manager_id: number | null;
  status: string;
  created_at: string;
}

export interface Review {
  id: string;
  organization_id: number;
  cycle_id: string;
  employee_id: number;
  reviewer_id: number;
  type: ReviewType;
  status: ReviewStatus;
  overall_rating: number | null;
  summary: string | null;
  strengths: string | null;
  improvements: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewCompetencyRating {
  id: string;
  review_id: string;
  competency_id: string;
  rating: number;
  comments: string | null;
  created_at: string;
}

export interface Goal {
  id: string;
  organization_id: number;
  employee_id: number;
  title: string;
  description: string | null;
  category: GoalCategory;
  priority: GoalPriority;
  status: GoalStatus;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  cycle_id: string | null;
  parent_goal_id: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface KeyResult {
  id: string;
  goal_id: string;
  title: string;
  metric_type: MetricType;
  target_value: number;
  current_value: number;
  unit: string | null;
  weight: number;
  created_at: string;
  updated_at: string;
}

export interface GoalCheckIn {
  id: string;
  goal_id: string;
  author_id: number;
  progress: number;
  notes: string | null;
  created_at: string;
}

export interface PerformanceImprovementPlan {
  id: string;
  organization_id: number;
  employee_id: number;
  manager_id: number;
  status: PIPStatus;
  reason: string;
  start_date: string;
  end_date: string;
  extended_end_date: string | null;
  outcome_notes: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface PIPObjective {
  id: string;
  pip_id: string;
  title: string;
  description: string | null;
  success_criteria: string | null;
  due_date: string | null;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
}

export interface PIPUpdate {
  id: string;
  pip_id: string;
  author_id: number;
  notes: string;
  progress_rating: number | null;
  created_at: string;
}

export interface ContinuousFeedback {
  id: string;
  organization_id: number;
  from_user_id: number;
  to_user_id: number;
  type: FeedbackType;
  visibility: FeedbackVisibility;
  message: string;
  tags: string | null;
  is_anonymous: boolean;
  created_at: string;
}

export interface CareerPath {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  department: string | null;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface CareerPathLevel {
  id: string;
  career_path_id: string;
  title: string;
  level: number;
  description: string | null;
  requirements: string | null;
  min_years_experience: number | null;
  created_at: string;
}

export interface EmployeeCareerTrack {
  id: string;
  employee_id: number;
  career_path_id: string;
  current_level_id: string;
  target_level_id: string | null;
  assigned_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OneOnOneMeeting {
  id: string;
  organization_id: number;
  employee_id: number;
  manager_id: number;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  status: MeetingStatus;
  meeting_notes: string | null;
  action_items: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeetingAgendaItem {
  id: string;
  meeting_id: string;
  title: string;
  description: string | null;
  added_by: number;
  order: number;
  is_discussed: boolean;
  created_at: string;
}

export interface PeerReviewNomination {
  id: string;
  cycle_id: string;
  employee_id: number;
  nominee_id: number;
  status: NominationStatus;
  nominated_by: number;
  approved_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface RatingDistribution {
  rating: number;
  count: number;
  percentage: number;
}

export interface PotentialAssessment {
  id: string;
  organization_id: number;
  cycle_id: string;
  employee_id: number;
  assessed_by: number;
  potential_rating: number;
  notes: string | null;
  created_at: string;
}

export interface SuccessionPlan {
  id: string;
  organization_id: number;
  position_title: string;
  current_holder_id: number | null;
  department: string | null;
  criticality: SuccessionCriticality;
  status: SuccessionStatus;
  created_at: string;
  updated_at: string;
}

export interface SuccessionCandidate {
  id: string;
  plan_id: string;
  employee_id: number;
  readiness: CandidateReadiness;
  development_notes: string | null;
  nine_box_position: NineBoxPosition | null;
  created_at: string;
}

export interface NineBoxEmployee {
  id: number;
  name: string;
  department: string | null;
  rating: number;
  potential: number;
}

export interface NineBoxCell {
  employees: NineBoxEmployee[];
  count: number;
}

export interface NineBoxData {
  boxes: Record<NineBoxPosition, NineBoxCell>;
  totalEmployees: number;
}

// ---------------------------------------------------------------------------
// Performance Letters
// ---------------------------------------------------------------------------

export type LetterType = "appraisal" | "increment" | "promotion" | "confirmation" | "warning";

export interface PerformanceLetterTemplate {
  id: string;
  organization_id: number;
  type: LetterType;
  name: string;
  content_template: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeneratedPerformanceLetter {
  id: string;
  organization_id: number;
  employee_id: number;
  cycle_id: string | null;
  template_id: string;
  type: LetterType;
  content: string;
  file_path: string | null;
  generated_by: number;
  sent_at: string | null;
  created_at: string;
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
  recommendations?: LearningRecommendation[];
}

export interface LearningRecommendation {
  competency: string;
  gap: number;
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Goal Alignment Tree
// ---------------------------------------------------------------------------

export interface GoalTreeNode {
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

export interface AuditLog {
  id: string;
  organization_id: number;
  user_id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_values: string | null;
  new_values: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Manager Effectiveness
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
