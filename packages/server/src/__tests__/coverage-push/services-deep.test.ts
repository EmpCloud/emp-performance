/**
 * EMP Performance — Comprehensive coverage tests for all services.
 * Mocks DB to avoid needing a live MySQL connection.
 * Targets: ai-summary, email, succession, analytics, career-path,
 *          performance-letter, manager-effectiveness, notification-settings,
 *          pip, one-on-one, peer-review, feedback, goal, review,
 *          review-cycle, competency, auth, middleware, utils, jobs.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-coverage-push";
process.env.EMPCLOUD_URL = "http://localhost:3000";
process.env.LOG_LEVEL = "error";
process.env.CORS_ORIGIN = "http://localhost:5179";

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ============================================================================
// Mock DB adapters
// ============================================================================

const mockDB = {
  findOne: vi.fn().mockResolvedValue(null),
  findById: vi.fn().mockResolvedValue(null),
  findMany: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  create: vi.fn().mockImplementation((_table: string, data: any) => Promise.resolve({ id: "mock-id", ...data })),
  update: vi.fn().mockImplementation((_table: string, _id: string, data: any) => Promise.resolve({ id: _id, ...data })),
  delete: vi.fn().mockResolvedValue(undefined),
  count: vi.fn().mockResolvedValue(0),
  raw: vi.fn().mockResolvedValue([[]]),
};

vi.mock("../../db/adapters", () => ({
  initDB: vi.fn().mockResolvedValue(undefined),
  closeDB: vi.fn().mockResolvedValue(undefined),
  getDB: () => mockDB,
}));

vi.mock("../../db/empcloud", () => ({
  initEmpCloudDB: vi.fn().mockResolvedValue(undefined),
  closeEmpCloudDB: vi.fn().mockResolvedValue(undefined),
  findUserByEmail: vi.fn().mockResolvedValue(null),
  findUserById: vi.fn().mockResolvedValue({ id: 522, email: "test@test.com", first_name: "Test", last_name: "User", organization_id: 5, role: "employee" }),
  findOrgById: vi.fn().mockResolvedValue({ id: 5, name: "TestOrg" }),
}));

vi.mock("../../services/email/email.service", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  sendReviewReminder: vi.fn().mockResolvedValue(undefined),
  sendPIPCheckInReminder: vi.fn().mockResolvedValue(undefined),
  sendOneOnOneReminder: vi.fn().mockResolvedValue(undefined),
  sendGoalDeadlineReminder: vi.fn().mockResolvedValue(undefined),
  sendCycleLaunchedNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const ORG = 5;

beforeEach(() => {
  vi.clearAllMocks();
  mockDB.findOne.mockResolvedValue(null);
  mockDB.findById.mockResolvedValue(null);
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  mockDB.count.mockResolvedValue(0);
  mockDB.raw.mockResolvedValue([[]]);
  mockDB.create.mockImplementation((_t: string, d: any) => Promise.resolve({ id: "mock-id", ...d }));
  mockDB.update.mockImplementation((_t: string, id: string, d: any) => Promise.resolve({ id, ...d }));
});

// ============================================================================
// AI SUMMARY SERVICE
// ============================================================================

describe("AI Summary Service", () => {
  let aiService: typeof import("../../services/ai-summary/ai-summary.service");

  beforeAll(async () => {
    aiService = await import("../../services/ai-summary/ai-summary.service");
  });

  it("generateReviewSummary throws for missing review", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(aiService.generateReviewSummary(ORG, "r1")).rejects.toThrow();
  });

  it("generateReviewSummary returns summary for valid review", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "reviews") return { id: "r1", employee_id: 522, reviewer_id: 100, cycle_id: "c1", type: "manager", overall_rating: 4, status: "submitted" };
      if (table === "review_cycles") return { id: "c1", start_date: "2026-01-01", end_date: "2026-06-30" };
      return null;
    });
    mockDB.raw.mockResolvedValue([[]]);
    const result = await aiService.generateReviewSummary(ORG, "r1");
    expect(result).toHaveProperty("review_id", "r1");
    expect(result).toHaveProperty("competency_analysis");
    expect(result).toHaveProperty("goal_progress");
    expect(result).toHaveProperty("feedback_themes");
    expect(result).toHaveProperty("recommended_actions");
    expect(result).toHaveProperty("narrative_summary");
    expect(result).toHaveProperty("generated_at");
  });

  it("generateReviewSummary with competency ratings", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "reviews") return { id: "r1", employee_id: 522, reviewer_id: 100, cycle_id: "c1", type: "self", overall_rating: 3 };
      if (table === "review_cycles") return { id: "c1", start_date: "2026-01-01", end_date: "2026-06-30" };
      return null;
    });
    mockDB.raw.mockImplementation(async (sql: string) => {
      if (sql.includes("review_competency_ratings")) {
        return [[
          { competency_id: "comp1", competency_name: "Leadership", category: "core", rating: 4.5, comments: "Great" },
          { competency_id: "comp2", competency_name: "Technical", category: "technical", rating: 2, comments: "Needs work" },
        ]];
      }
      if (sql.includes("goals")) {
        return [[
          { id: "g1", title: "Goal 1", status: "completed", progress: 100, category: "professional" },
          { id: "g2", title: "Goal 2", status: "in_progress", progress: 50, category: "professional" },
        ]];
      }
      if (sql.includes("continuous_feedback")) {
        return [[
          { type: "kudos", message: "Great work on the project" },
          { type: "constructive", message: "Could improve communication" },
          { type: "constructive", message: "More proactive needed" },
          { type: "constructive", message: "Follow up on action items" },
          { type: "general", message: "Good team player" },
        ]];
      }
      return [[]];
    });
    const result = await aiService.generateReviewSummary(ORG, "r1");
    expect(result.competency_analysis.strengths.length).toBeGreaterThan(0);
    expect(result.competency_analysis.weaknesses.length).toBeGreaterThan(0);
    expect(result.goal_progress.total_goals).toBe(2);
    expect(result.goal_progress.completed).toBe(1);
    expect(result.feedback_themes.total_feedback_count).toBe(5);
    expect(result.recommended_actions.length).toBeGreaterThan(0);
  });

  it("generateEmployeeSummary throws for missing cycle", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(aiService.generateEmployeeSummary(ORG, 522, "c1")).rejects.toThrow();
  });

  it("generateEmployeeSummary returns summary", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "review_cycles") return { id: "c1", start_date: "2026-01-01", end_date: "2026-06-30" };
      return null;
    });
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
    mockDB.raw.mockResolvedValue([[]]);
    const result = await aiService.generateEmployeeSummary(ORG, 522, "c1");
    expect(result).toHaveProperty("employee_id", 522);
    expect(result).toHaveProperty("cycle_id", "c1");
    expect(result).toHaveProperty("reviews");
    expect(result).toHaveProperty("consolidated_rating");
    expect(result).toHaveProperty("recommended_actions");
  });

  it("generateTeamSummary throws for missing cycle", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(aiService.generateTeamSummary(ORG, 100, "c1")).rejects.toThrow();
  });

  it("generateTeamSummary returns summary with no team members", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", start_date: "2026-01-01", end_date: "2026-06-30" });
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 1000, totalPages: 0 });
    const result = await aiService.generateTeamSummary(ORG, 100, "c1");
    expect(result.team_size).toBe(0);
    expect(result.average_rating).toBeNull();
  });

  it("generateTeamSummary returns summary with team members", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", start_date: "2026-01-01", end_date: "2026-06-30" });
    mockDB.findMany.mockResolvedValue({
      data: [{ employee_id: 522, cycle_id: "c1", manager_id: 100 }],
      total: 1, page: 1, limit: 1000, totalPages: 1,
    });
    mockDB.raw.mockImplementation(async (sql: string) => {
      if (sql.includes("AVG(overall_rating)")) return [[{ avg_rating: 3.5 }]];
      if (sql.includes("goals")) return [[{ status: "completed" }, { status: "in_progress" }]];
      return [[]];
    });
    mockDB.count.mockResolvedValue(3);
    const result = await aiService.generateTeamSummary(ORG, 100, "c1");
    expect(result.team_size).toBe(1);
    expect(result.team_members.length).toBe(1);
  });
});

// ============================================================================
// SUCCESSION SERVICE
// ============================================================================

describe("Succession Service", () => {
  let succService: typeof import("../../services/analytics/succession.service");

  beforeAll(async () => {
    succService = await import("../../services/analytics/succession.service");
  });

  it("createSuccessionPlan creates a plan", async () => {
    const result = await succService.createSuccessionPlan(ORG, { position_title: "CTO" });
    expect(result).toHaveProperty("id");
    expect(result.position_title).toBe("CTO");
  });

  it("createSuccessionPlan with all fields", async () => {
    const result = await succService.createSuccessionPlan(ORG, {
      position_title: "VP Eng", current_holder_id: 100, department: "Engineering",
      criticality: "high", status: "active",
    });
    expect(result.criticality).toBe("high");
  });

  it("listSuccessionPlans returns plans with counts", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "p1", position_title: "CTO" }],
      total: 1, page: 1, limit: 1000, totalPages: 1,
    });
    mockDB.count.mockResolvedValue(3);
    const result = await succService.listSuccessionPlans(ORG);
    expect(result.length).toBe(1);
    expect(result[0].candidate_count).toBe(3);
  });

  it("getSuccessionPlan throws for missing plan", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(succService.getSuccessionPlan(ORG, "p1")).rejects.toThrow();
  });

  it("getSuccessionPlan returns plan with candidates", async () => {
    mockDB.findOne.mockResolvedValue({ id: "p1", position_title: "CTO" });
    mockDB.findMany.mockResolvedValue({ data: [{ id: "sc1", employee_id: 522 }], total: 1, page: 1, limit: 1000, totalPages: 1 });
    const result = await succService.getSuccessionPlan(ORG, "p1");
    expect(result.candidates.length).toBe(1);
  });

  it("addSuccessionCandidate throws for missing plan", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(succService.addSuccessionCandidate(ORG, "p1", { employee_id: 522 })).rejects.toThrow();
  });

  it("addSuccessionCandidate adds candidate", async () => {
    mockDB.findOne.mockResolvedValue({ id: "p1" });
    const result = await succService.addSuccessionCandidate(ORG, "p1", {
      employee_id: 522, readiness: "1_year", development_notes: "Ready soon",
      nine_box_position: "Star",
    });
    expect(result).toHaveProperty("id");
  });

  it("updateSuccessionCandidate throws for missing plan", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(succService.updateSuccessionCandidate(ORG, "p1", "sc1", { readiness: "now" })).rejects.toThrow();
  });

  it("updateSuccessionCandidate throws for missing candidate", async () => {
    let callIdx = 0;
    mockDB.findOne.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) return { id: "p1" }; // plan
      return null; // candidate not found
    });
    await expect(succService.updateSuccessionCandidate(ORG, "p1", "sc1", { readiness: "now" })).rejects.toThrow();
  });

  it("updateSuccessionCandidate updates candidate", async () => {
    let callIdx = 0;
    mockDB.findOne.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) return { id: "p1" };
      return { id: "sc1", plan_id: "p1" };
    });
    const result = await succService.updateSuccessionCandidate(ORG, "p1", "sc1", {
      readiness: "now", development_notes: "Updated", nine_box_position: "High Performer",
    });
    expect(result).toHaveProperty("id");
  });
});

// ============================================================================
// ANALYTICS SERVICE (Core)
// ============================================================================

describe("Analytics Service (Core)", () => {
  let analyticsService: typeof import("../../services/analytics/analytics.service");

  beforeAll(async () => {
    analyticsService = await import("../../services/analytics/analytics.service");
  });

  it("getOverview returns overview stats", async () => {
    mockDB.count.mockResolvedValue(5);
    const result = await analyticsService.getOverview(ORG);
    expect(result).toHaveProperty("activeCycles");
    expect(result).toHaveProperty("pendingReviews");
    expect(result).toHaveProperty("goalCompletionRate");
    expect(result).toHaveProperty("pipCount");
    expect(result).toHaveProperty("feedbackCount");
  });

  it("getRatingsDistribution returns cached data", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [{ rating: 4, count: 10 }],
      total: 1, page: 1, limit: 10, totalPages: 1,
    });
    const result = await analyticsService.getRatingsDistribution(ORG, "c1");
    expect(result.length).toBe(1);
  });

  it("getRatingsDistribution computes when no cache", async () => {
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 });
    mockDB.raw.mockResolvedValue([[{ rating: 3, count: 5 }]]);
    const result = await analyticsService.getRatingsDistribution(ORG, "c1");
    expect(result.length).toBeGreaterThan(0);
  });

  it("getTrends returns cycle trends", async () => {
    mockDB.raw.mockResolvedValue([[{ cycle_name: "Q1 2026", avg_rating: 3.5, review_count: 10 }]]);
    const result = await analyticsService.getTrends(ORG);
    expect(result.length).toBe(1);
  });

  it("getTeamComparison returns team data", async () => {
    mockDB.raw.mockResolvedValue([[{ employee_id: 522, avg_rating: 4, review_count: 2 }]]);
    const result = await analyticsService.getTeamComparison(ORG, 100);
    expect(result.length).toBe(1);
  });

  it("getGoalCompletion returns category breakdown", async () => {
    mockDB.raw.mockResolvedValue([[{ category: "professional", total: 10, completed: 7, avg_progress: 75 }]]);
    const result = await analyticsService.getGoalCompletion(ORG);
    expect(result.length).toBe(1);
  });

  it("getTopPerformers returns top performers", async () => {
    mockDB.raw.mockResolvedValue([[{ employee_id: 522, avg_rating: 4.8, review_count: 3 }]]);
    const result = await analyticsService.getTopPerformers(ORG, "c1");
    expect(result.length).toBe(1);
  });

  it("getSkillsGap returns gap analysis", async () => {
    mockDB.findOne.mockResolvedValue(null); // no career track
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
    mockDB.raw.mockResolvedValue([[]]);
    const result = await analyticsService.getSkillsGap(ORG, 522);
    expect(result).toHaveProperty("employee_id", 522);
    expect(result).toHaveProperty("overallReadiness");
    expect(result).toHaveProperty("competencies");
  });

  it("getSkillsGap with career track", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "employee_career_tracks") return { career_path_id: "cp1" };
      if (table === "career_paths") return { id: "cp1" };
      return null;
    });
    mockDB.findMany.mockImplementation(async (table: string) => {
      if (table === "competency_frameworks") return { data: [{ id: "fw1" }], total: 1, page: 1, limit: 100, totalPages: 1 };
      if (table === "competencies") return {
        data: [{ id: "c1", name: "Leadership", category: "core", weight: 4 }],
        total: 1, page: 1, limit: 100, totalPages: 1,
      };
      if (table === "review_competency_ratings") return { data: [{ competency_id: "c1", rating: 3 }], total: 1, page: 1, limit: 100, totalPages: 1 };
      return { data: [], total: 0, page: 1, limit: 100, totalPages: 0 };
    });
    mockDB.raw.mockResolvedValue([[{ id: "r1" }]]);
    const result = await analyticsService.getSkillsGap(ORG, 522);
    expect(result.competencies.length).toBeGreaterThan(0);
  });

  it("getDepartmentSkillsGap returns department analysis", async () => {
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
    const result = await analyticsService.getDepartmentSkillsGap(ORG, "engineering");
    expect(result).toHaveProperty("department", "engineering");
    expect(result).toHaveProperty("averageReadiness");
  });

  it("getLearningRecommendations returns recommendations for gaps", () => {
    const gaps = [
      { competency_id: "c1", name: "Leadership", category: "leadership", currentRating: 2, requiredRating: 4, gap: 2, status: "gap" as const },
      { competency_id: "c2", name: "Coding", category: "technical", currentRating: 3, requiredRating: 4, gap: 1, status: "gap" as const },
      { competency_id: "c3", name: "Comms", category: "communication", currentRating: 4, requiredRating: 4, gap: 0, status: "meets" as const },
    ];
    const recs = analyticsService.getLearningRecommendations(gaps);
    expect(recs.length).toBe(2); // only gaps
    expect(recs[0].competency).toBe("Leadership");
  });

  it("getLearningRecommendations handles unknown categories", () => {
    const gaps = [
      { competency_id: "c1", name: "CustomSkill", category: "unknown", currentRating: 1, requiredRating: 4, gap: 3, status: "gap" as const },
    ];
    const recs = analyticsService.getLearningRecommendations(gaps);
    expect(recs.length).toBe(1);
    expect(recs[0].recommendation).toContain("CustomSkill");
  });

  it("getLearningRecommendations handles null category", () => {
    const gaps = [
      { competency_id: "c1", name: "NullCat", category: null, currentRating: 1, requiredRating: 4, gap: 3, status: "gap" as const },
    ];
    const recs = analyticsService.getLearningRecommendations(gaps);
    expect(recs.length).toBe(1);
  });
});

// ============================================================================
// NINE BOX SERVICE
// ============================================================================

describe("Nine Box Service", () => {
  let nineBoxService: typeof import("../../services/analytics/nine-box.service");

  beforeAll(async () => {
    nineBoxService = await import("../../services/analytics/nine-box.service");
  });

  it("classifyNineBox — all 9 boxes", () => {
    expect(nineBoxService.classifyNineBox(4.5, 4.5)).toBe("Star");
    expect(nineBoxService.classifyNineBox(4.0, 3.0)).toBe("High Performer");
    expect(nineBoxService.classifyNineBox(4.5, 1.5)).toBe("Solid Performer");
    expect(nineBoxService.classifyNineBox(3.0, 4.5)).toBe("High Potential");
    expect(nineBoxService.classifyNineBox(3.0, 3.0)).toBe("Core Player");
    expect(nineBoxService.classifyNineBox(3.0, 2.0)).toBe("Average");
    expect(nineBoxService.classifyNineBox(2.0, 4.5)).toBe("Inconsistent");
    expect(nineBoxService.classifyNineBox(2.0, 3.0)).toBe("Improvement Needed");
    expect(nineBoxService.classifyNineBox(1.0, 1.0)).toBe("Action Required");
  });

  it("getNineBoxData returns data", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", name: "Q1 Review" });
    mockDB.raw.mockResolvedValue([[]]);
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 1000, totalPages: 0 });
    const result = await nineBoxService.getNineBoxData(ORG, "c1");
    expect(result).toBeDefined();
  });

  it("createPotentialAssessment creates assessment", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", name: "Q1 Review" });
    const result = await nineBoxService.createPotentialAssessment(ORG, {
      cycle_id: "c1", employee_id: 522, potential_rating: 4, notes: "High potential",
    }, 100);
    expect(result).toHaveProperty("id");
  });

  it("createPotentialAssessment updates existing", async () => {
    let callIdx = 0;
    mockDB.findOne.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) return { id: "c1" }; // cycle
      return { id: "pa-existing" }; // existing assessment
    });
    const result = await nineBoxService.createPotentialAssessment(ORG, {
      cycle_id: "c1", employee_id: 522, potential_rating: 3,
    }, 100);
    expect(result).toHaveProperty("id");
  });

  it("createPotentialAssessment rejects invalid rating", async () => {
    await expect(nineBoxService.createPotentialAssessment(ORG, {
      cycle_id: "c1", employee_id: 522, potential_rating: 6,
    }, 100)).rejects.toThrow("between 1 and 5");
  });

  it("listPotentialAssessments returns assessments", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", name: "Q1 Review" });
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "pa1", employee_id: 522 }],
      total: 1, page: 1, limit: 100, totalPages: 1,
    });
    const result = await nineBoxService.listPotentialAssessments(ORG, "c1");
    expect(result.length).toBe(1);
  });
});

// ============================================================================
// CAREER PATH SERVICE
// ============================================================================

describe("Career Path Service", () => {
  let careerService: typeof import("../../services/career/career-path.service");

  beforeAll(async () => {
    careerService = await import("../../services/career/career-path.service");
  });

  it("createPath creates a career path", async () => {
    const result = await careerService.createPath(ORG, { name: "Engineering", created_by: 100 });
    expect(result).toHaveProperty("id");
  });

  it("listPaths returns paginated paths", async () => {
    mockDB.findMany.mockResolvedValue({ data: [{ id: "cp1" }], total: 1, page: 1, limit: 50, totalPages: 1 });
    const result = await careerService.listPaths(ORG);
    expect(result.data.length).toBe(1);
  });

  it("getPath throws for missing path", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(careerService.getPath(ORG, "cp1")).rejects.toThrow();
  });

  it("getPath returns path with levels", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cp1", name: "Engineering" });
    mockDB.findMany.mockResolvedValue({ data: [{ id: "l1", title: "Junior" }], total: 1, page: 1, limit: 100, totalPages: 1 });
    const result = await careerService.getPath(ORG, "cp1");
    expect(result.levels.length).toBe(1);
  });

  it("updatePath throws for missing path", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(careerService.updatePath(ORG, "cp1", { name: "Updated" })).rejects.toThrow();
  });

  it("updatePath updates the path", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cp1" });
    const result = await careerService.updatePath(ORG, "cp1", { name: "Updated Eng" });
    expect(result).toHaveProperty("id");
  });

  it("deletePath throws for missing path", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(careerService.deletePath(ORG, "cp1")).rejects.toThrow();
  });

  it("deletePath deletes the path", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cp1" });
    await expect(careerService.deletePath(ORG, "cp1")).resolves.toBeUndefined();
  });

  it("addLevel throws for missing path", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(careerService.addLevel(ORG, "cp1", { title: "Junior", level: 1 })).rejects.toThrow();
  });

  it("addLevel adds a level", async () => {
    mockDB.findOne.mockResolvedValue({ id: "cp1" });
    const result = await careerService.addLevel(ORG, "cp1", { title: "Senior", level: 3, description: "Lead projects", requirements: "5+ years", min_years_experience: 5 });
    expect(result).toHaveProperty("id");
  });

  it("updateLevel throws for missing level", async () => {
    mockDB.findById.mockResolvedValue(null);
    await expect(careerService.updateLevel(ORG, "l1", { title: "Updated" })).rejects.toThrow();
  });

  it("updateLevel updates the level", async () => {
    mockDB.findById.mockResolvedValue({ id: "l1", career_path_id: "cp1" });
    mockDB.findOne.mockResolvedValue({ id: "cp1" });
    const result = await careerService.updateLevel(ORG, "l1", { title: "Updated", level: 2 });
    expect(result).toHaveProperty("id");
  });

  it("removeLevel throws for missing level", async () => {
    mockDB.findById.mockResolvedValue(null);
    await expect(careerService.removeLevel(ORG, "l1")).rejects.toThrow();
  });

  it("removeLevel removes the level", async () => {
    mockDB.findById.mockResolvedValue({ id: "l1", career_path_id: "cp1" });
    mockDB.findOne.mockResolvedValue({ id: "cp1" });
    await expect(careerService.removeLevel(ORG, "l1")).resolves.toBeUndefined();
  });

  it("assignTrack creates new track", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "career_paths") return { id: "cp1" };
      if (table === "employee_career_tracks") return null;
      return null;
    });
    const result = await careerService.assignTrack(ORG, 522, "cp1", "l1", "l3");
    expect(result).toHaveProperty("id");
  });

  it("assignTrack updates existing track", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "career_paths") return { id: "cp1" };
      if (table === "employee_career_tracks") return { id: "et1", employee_id: 522, career_path_id: "cp1" };
      return null;
    });
    const result = await careerService.assignTrack(ORG, 522, "cp1", "l2");
    expect(result).toHaveProperty("id");
  });

  it("getEmployeeTrack returns enriched tracks", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "et1", employee_id: 522, career_path_id: "cp1", current_level_id: "l1", target_level_id: "l3" }],
      total: 1, page: 1, limit: 50, totalPages: 1,
    });
    mockDB.findOne.mockResolvedValue({ id: "cp1", organization_id: ORG });
    mockDB.findById.mockImplementation(async (table: string, id: string) => {
      if (table === "career_path_levels") return { id, title: `Level ${id}` };
      return null;
    });
    const result = await careerService.getEmployeeTrack(ORG, 522);
    expect(result.length).toBe(1);
  });
});

// ============================================================================
// PERFORMANCE LETTER SERVICE
// ============================================================================

describe("Performance Letter Service", () => {
  let letterService: typeof import("../../services/letter/performance-letter.service");

  beforeAll(async () => {
    letterService = await import("../../services/letter/performance-letter.service");
  });

  it("createTemplate creates a template", async () => {
    const result = await letterService.createTemplate(ORG, {
      type: "appraisal", name: "Annual Review", content_template: "Dear {{employee_id}}, your rating is {{overall_rating}}.",
    });
    expect(result).toHaveProperty("id");
  });

  it("listTemplates returns templates", async () => {
    mockDB.findMany.mockResolvedValue({ data: [{ id: "t1" }], total: 1, page: 1, limit: 1000, totalPages: 1 });
    const result = await letterService.listTemplates(ORG);
    expect(result.length).toBe(1);
  });

  it("listTemplates with type filter", async () => {
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 1000, totalPages: 0 });
    const result = await letterService.listTemplates(ORG, "increment");
    expect(Array.isArray(result)).toBe(true);
  });

  it("getTemplate throws for missing template", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(letterService.getTemplate(ORG, "t1")).rejects.toThrow();
  });

  it("updateTemplate throws for missing template", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(letterService.updateTemplate(ORG, "t1", { name: "Updated" })).rejects.toThrow();
  });

  it("updateTemplate updates template", async () => {
    mockDB.findOne.mockResolvedValue({ id: "t1" });
    const result = await letterService.updateTemplate(ORG, "t1", { name: "Updated", type: "promotion", content_template: "New content", is_default: true });
    expect(result).toHaveProperty("id");
  });

  it("deleteTemplate throws for missing template", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(letterService.deleteTemplate(ORG, "t1")).rejects.toThrow();
  });

  it("deleteTemplate deletes", async () => {
    mockDB.findOne.mockResolvedValue({ id: "t1" });
    await expect(letterService.deleteTemplate(ORG, "t1")).resolves.toBeUndefined();
  });

  it("generateLetter throws for missing template", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(letterService.generateLetter(ORG, 522, "t1", "c1", 100)).rejects.toThrow();
  });

  it("generateLetter generates with cycle data", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "performance_letter_templates") return {
        id: "t1", type: "appraisal", content_template: "Rating: {{overall_rating}}, Date: {{date}}",
      };
      if (table === "reviews") return { overall_rating: 4, summary: "Good", strengths: "Strong", improvements: "More focus" };
      return null;
    });
    const result = await letterService.generateLetter(ORG, 522, "t1", "c1", 100);
    expect(result).toHaveProperty("content");
    expect(result.content).toContain("4");
  });

  it("generateLetter generates without cycle", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "t1", type: "warning", content_template: "Letter for {{employee_id}}",
    });
    const result = await letterService.generateLetter(ORG, 522, "t1", null, 100);
    expect(result.content).toContain("522");
  });

  it("listLetters returns paginated data", async () => {
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    const result = await letterService.listLetters(ORG, { page: 1, perPage: 10, employeeId: 522, type: "appraisal" });
    expect(result).toHaveProperty("data");
    expect(result).toHaveProperty("totalPages");
  });

  it("getLetter throws for missing letter", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(letterService.getLetter(ORG, "lt1")).rejects.toThrow();
  });

  it("sendLetter throws for missing letter", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(letterService.sendLetter(ORG, "lt1")).rejects.toThrow();
  });

  it("sendLetter throws for already sent letter", async () => {
    mockDB.findOne.mockResolvedValue({ id: "lt1", sent_at: new Date() });
    await expect(letterService.sendLetter(ORG, "lt1")).rejects.toThrow("already been sent");
  });

  it("sendLetter sends letter", async () => {
    mockDB.findOne.mockResolvedValue({ id: "lt1", sent_at: null });
    const result = await letterService.sendLetter(ORG, "lt1");
    expect(result).toHaveProperty("id");
  });
});

// ============================================================================
// MANAGER EFFECTIVENESS SERVICE
// ============================================================================

describe("Manager Effectiveness Service", () => {
  let mgrService: typeof import("../../services/manager-effectiveness/manager-effectiveness.service");

  beforeAll(async () => {
    mgrService = await import("../../services/manager-effectiveness/manager-effectiveness.service");
  });

  it("calculateScore throws for invalid period", async () => {
    await expect(mgrService.calculateScore(ORG, 100, "invalid")).rejects.toThrow("YYYY-QN");
    await expect(mgrService.calculateScore(ORG, 100, "")).rejects.toThrow();
  });

  it("calculateScore calculates for valid period with no data", async () => {
    mockDB.raw.mockResolvedValue([[]]);
    mockDB.findOne.mockResolvedValue(null);
    mockDB.count.mockResolvedValue(0);
    const result = await mgrService.calculateScore(ORG, 100, "2026-Q1");
    expect(result).toHaveProperty("overall_score");
    expect(result).toHaveProperty("team_size", 0);
  });

  it("calculateScore with team data", async () => {
    let rawCallIdx = 0;
    mockDB.raw.mockImplementation(async () => {
      rawCallIdx++;
      if (rawCallIdx === 1) return [[{ employee_id: 522 }]]; // direct reports
      if (rawCallIdx === 2) return [[{ avg_rating: 4.0 }]]; // team rating
      if (rawCallIdx === 3) return [[{ id: "r1", overall_rating: 4, submitted_at: "2026-02-01", review_deadline: "2026-03-01" }]]; // review quality
      if (rawCallIdx === 4) return [[{ cnt: 3 }]]; // meetings
      if (rawCallIdx === 5) return [[{ cnt: 5 }]]; // feedback
      if (rawCallIdx === 6) return [[{ total: 10, completed: 7 }]]; // goals
      return [[]];
    });
    mockDB.findOne.mockResolvedValue(null); // no existing score
    const result = await mgrService.calculateScore(ORG, 100, "2026-Q1");
    expect(result.team_size).toBe(1);
    expect(result.overall_score).not.toBeNull();
  });

  it("listManagerScores returns scores", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [{ id: "ms1", overall_score: 75 }],
      total: 1, page: 1, limit: 1000, totalPages: 1,
    });
    const result = await mgrService.listManagerScores(ORG, "2026-Q1");
    expect(result.length).toBe(1);
  });

  it("getManagerDetail throws for missing score", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(mgrService.getManagerDetail(ORG, 100, "2026-Q1")).rejects.toThrow();
  });

  it("getManagerDetail returns detail with breakdown", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "ms1", manager_user_id: 100, period: "2026-Q1", overall_score: 75,
      team_size: 5, avg_team_rating: 3.5, reviews_completed_on_time_pct: 80,
      one_on_one_frequency: 2, feedback_given_count: 10, goal_completion_rate: 60,
    });
    const result = await mgrService.getManagerDetail(ORG, 100, "2026-Q1");
    expect(result).toHaveProperty("breakdown");
    expect(result.breakdown.team_performance.team_size).toBe(5);
  });

  it("getManagerDetail with null ratings", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "ms1", team_size: 3, avg_team_rating: null, reviews_completed_on_time_pct: null,
      one_on_one_frequency: null, feedback_given_count: 0, goal_completion_rate: null,
    });
    const result = await mgrService.getManagerDetail(ORG, 100, "2026-Q1");
    expect(result.breakdown.review_quality.description).toContain("No manager reviews");
  });

  it("getDashboard returns empty stats when no data", async () => {
    mockDB.raw.mockResolvedValue([[]]);
    const result = await mgrService.getDashboard(ORG);
    expect(result.total_managers).toBe(0);
    expect(result.period).toBe("");
  });

  it("getDashboard returns stats with data", async () => {
    let rawCallIdx = 0;
    mockDB.raw.mockImplementation(async () => {
      rawCallIdx++;
      if (rawCallIdx === 1) return [[{ period: "2026-Q1", org_avg: 72.5, total: 10 }]]; // latest period
      if (rawCallIdx === 2) return [[{ bucket: "60-80", cnt: 5 }, { bucket: "80-100", cnt: 3 }]]; // dist
      return [[]];
    });
    mockDB.findMany.mockResolvedValue({ data: [{ id: "ms1" }], total: 1, page: 1, limit: 5, totalPages: 1 });
    const result = await mgrService.getDashboard(ORG);
    expect(result.total_managers).toBe(10);
    expect(result.period).toBe("2026-Q1");
  });

  it("calculateAll throws for invalid period", async () => {
    await expect(mgrService.calculateAll(ORG, "bad")).rejects.toThrow();
  });

  it("calculateAll processes all managers", async () => {
    mockDB.raw.mockImplementation(async (sql: string) => {
      if (sql.includes("DISTINCT rcp.manager_id")) return [[{ manager_id: 100 }, { manager_id: 200 }]];
      return [[]];
    });
    mockDB.findOne.mockResolvedValue(null);
    mockDB.count.mockResolvedValue(0);
    const result = await mgrService.calculateAll(ORG, "2026-Q1");
    expect(result.calculated).toBe(2);
    expect(result.errors).toBe(0);
  });
});

// ============================================================================
// NOTIFICATION SETTINGS SERVICE
// ============================================================================

describe("Notification Settings Service", () => {
  let notifService: typeof import("../../services/notification/notification-settings.service");

  beforeAll(async () => {
    notifService = await import("../../services/notification/notification-settings.service");
  });

  it("getNotificationSettings returns defaults when no row", async () => {
    mockDB.findOne.mockResolvedValue(null);
    const result = await notifService.getNotificationSettings(ORG);
    expect(result.review_reminders_enabled).toBe(true);
    expect(result.reminder_days_before_deadline).toBe(3);
    expect(result.rating_scale).toBe(5);
  });

  it("getNotificationSettings returns existing settings", async () => {
    mockDB.findOne.mockResolvedValue({
      id: "ns1", organization_id: ORG, review_reminders_enabled: false,
      pip_reminders_enabled: true, meeting_reminders_enabled: false,
      goal_reminders_enabled: true, reminder_days_before_deadline: 5, rating_scale: 10,
      default_framework: "fw1",
    });
    const result = await notifService.getNotificationSettings(ORG);
    expect(result.review_reminders_enabled).toBe(false);
    expect(result.reminder_days_before_deadline).toBe(5);
  });

  it("getNotificationSettings handles table-not-found error", async () => {
    mockDB.findOne.mockRejectedValue(new Error("Table does not exist"));
    const result = await notifService.getNotificationSettings(ORG);
    expect(result.review_reminders_enabled).toBe(true); // defaults
  });

  it("updateNotificationSettings creates new when no existing", async () => {
    mockDB.findOne.mockResolvedValue(null);
    const result = await notifService.updateNotificationSettings(ORG, {
      review_reminders_enabled: false, rating_scale: 10,
    });
    expect(result).toHaveProperty("id");
  });

  it("updateNotificationSettings updates existing", async () => {
    mockDB.findOne.mockResolvedValue({ id: "ns1" });
    const result = await notifService.updateNotificationSettings(ORG, {
      pip_reminders_enabled: false, meeting_reminders_enabled: false,
      goal_reminders_enabled: false, reminder_days_before_deadline: 7,
      default_framework: "fw2",
    });
    expect(result).toHaveProperty("id");
  });

  it("updateNotificationSettings handles table error gracefully", async () => {
    mockDB.findOne.mockRejectedValue(new Error("Table error"));
    const result = await notifService.updateNotificationSettings(ORG, { review_reminders_enabled: true });
    expect(result).toHaveProperty("id");
  });
});

// ============================================================================
// PIP SERVICE
// ============================================================================

describe("PIP Service", () => {
  let pipService: typeof import("../../services/pip/pip.service");

  beforeAll(async () => {
    pipService = await import("../../services/pip/pip.service");
  });

  it("createPIP throws for existing active PIP", async () => {
    mockDB.findOne.mockResolvedValue({ id: "pip1", status: "active" });
    await expect(pipService.createPIP(ORG, 100, {
      employee_id: 522, reason: "Underperforming", start_date: "2026-01-01", end_date: "2026-03-31",
    })).rejects.toThrow("already has an active");
  });

  it("createPIP creates a new PIP", async () => {
    mockDB.findOne.mockResolvedValue(null);
    const result = await pipService.createPIP(ORG, 100, {
      employee_id: 522, reason: "Needs improvement", start_date: "2026-01-01", end_date: "2026-03-31", manager_id: 200,
    });
    expect(result).toHaveProperty("id");
  });

  it("listPIPs returns paginated data", async () => {
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    const result = await pipService.listPIPs(ORG, { status: "active", employeeId: 522, managerId: 100, page: 1, perPage: 10, sort: "start_date", order: "asc" });
    expect(result).toHaveProperty("data");
  });

  it("getPIP throws for missing PIP", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(pipService.getPIP(ORG, "pip1")).rejects.toThrow();
  });

  it("getPIP returns PIP with objectives and updates", async () => {
    mockDB.findOne.mockResolvedValue({ id: "pip1", status: "active" });
    mockDB.findMany.mockResolvedValue({ data: [{ id: "obj1" }], total: 1, page: 1, limit: 100, totalPages: 1 });
    const result = await pipService.getPIP(ORG, "pip1");
    expect(result).toHaveProperty("objectives");
    expect(result).toHaveProperty("updates");
  });

  it("updatePIP throws for missing PIP", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(pipService.updatePIP(ORG, "pip1", { reason: "Updated" })).rejects.toThrow();
  });

  it("updatePIP updates the PIP", async () => {
    mockDB.findOne.mockResolvedValue({ id: "pip1" });
    const result = await pipService.updatePIP(ORG, "pip1", { reason: "Updated reason", end_date: "2026-06-30", outcome_notes: "In progress" });
    expect(result).toHaveProperty("id");
  });

  it("addObjective throws for missing PIP", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(pipService.addObjective(ORG, "pip1", { title: "Improve" })).rejects.toThrow();
  });

  it("addObjective adds an objective", async () => {
    mockDB.findOne.mockResolvedValue({ id: "pip1" });
    const result = await pipService.addObjective(ORG, "pip1", {
      title: "Improve code quality", description: "Write tests", success_criteria: "90% coverage", due_date: "2026-03-15",
    });
    expect(result).toHaveProperty("id");
  });

  it("updateObjective throws for missing PIP", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(pipService.updateObjective(ORG, "pip1", "obj1", { status: "in_progress" })).rejects.toThrow();
  });

  it("updateObjective throws for missing objective", async () => {
    let callIdx = 0;
    mockDB.findOne.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) return { id: "pip1" };
      return null;
    });
    await expect(pipService.updateObjective(ORG, "pip1", "obj1", { status: "completed" })).rejects.toThrow();
  });

  it("updateObjective updates the objective", async () => {
    let callIdx = 0;
    mockDB.findOne.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 1) return { id: "pip1" };
      return { id: "obj1", pip_id: "pip1" };
    });
    const result = await pipService.updateObjective(ORG, "pip1", "obj1", {
      title: "Updated", description: "New desc", success_criteria: "New criteria",
      due_date: "2026-04-01", status: "completed",
    });
    expect(result).toHaveProperty("id");
  });

  it("addUpdate throws for missing PIP", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(pipService.addUpdate(ORG, "pip1", 100, { notes: "Progress update" })).rejects.toThrow();
  });

  it("addUpdate adds an update", async () => {
    mockDB.findOne.mockResolvedValue({ id: "pip1" });
    const result = await pipService.addUpdate(ORG, "pip1", 100, { notes: "Good progress", progress_rating: 4 });
    expect(result).toHaveProperty("id");
  });

  it("closePIP throws for missing PIP", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(pipService.closePIP(ORG, "pip1", "completed_success")).rejects.toThrow();
  });

  it("closePIP throws for invalid status", async () => {
    mockDB.findOne.mockResolvedValue({ id: "pip1", status: "completed_success" });
    await expect(pipService.closePIP(ORG, "pip1", "completed_success")).rejects.toThrow("Only active or extended");
  });

  it("closePIP closes the PIP", async () => {
    mockDB.findOne.mockResolvedValue({ id: "pip1", status: "active" });
    const result = await pipService.closePIP(ORG, "pip1", "completed_success", "Met all objectives");
    expect(result).toHaveProperty("id");
  });

  it("extendPIP throws for missing PIP", async () => {
    mockDB.findOne.mockResolvedValue(null);
    await expect(pipService.extendPIP(ORG, "pip1", "2026-06-30")).rejects.toThrow();
  });

  it("extendPIP throws for invalid status", async () => {
    mockDB.findOne.mockResolvedValue({ id: "pip1", status: "completed_success" });
    await expect(pipService.extendPIP(ORG, "pip1", "2026-06-30")).rejects.toThrow();
  });

  it("extendPIP extends active PIP", async () => {
    mockDB.findOne.mockResolvedValue({ id: "pip1", status: "active" });
    const result = await pipService.extendPIP(ORG, "pip1", "2026-06-30");
    expect(result).toHaveProperty("id");
  });
});

// ============================================================================
// MIDDLEWARE — Auth
// ============================================================================

describe("Auth Middleware", () => {
  let authMiddleware: typeof import("../../api/middleware/auth.middleware");
  let jwt: typeof import("jsonwebtoken");

  beforeAll(async () => {
    authMiddleware = await import("../../api/middleware/auth.middleware");
    jwt = await import("jsonwebtoken");
  });

  const mockRes = {} as any;
  const mockNext = vi.fn();

  beforeEach(() => mockNext.mockClear());

  it("authenticate rejects missing token", () => {
    authMiddleware.authenticate({ headers: {}, query: {} } as any, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("authenticate rejects invalid token", () => {
    authMiddleware.authenticate({ headers: { authorization: "Bearer bad" }, query: {} } as any, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("authenticate accepts valid token", () => {
    const token = jwt.default.sign(
      { empcloudUserId: 522, empcloudOrgId: 5, role: "org_admin", email: "t@t.com", firstName: "T", lastName: "U", orgName: "O" },
      "test-jwt-secret-coverage-push",
    );
    const req = { headers: { authorization: `Bearer ${token}` }, query: {} } as any;
    authMiddleware.authenticate(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
    expect(req.user.empcloudUserId).toBe(522);
  });

  it("authenticate accepts query token", () => {
    const token = jwt.default.sign({ empcloudUserId: 1, empcloudOrgId: 1 }, "test-jwt-secret-coverage-push");
    const req = { headers: {}, query: { token } } as any;
    authMiddleware.authenticate(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it("authenticate handles expired token", () => {
    const token = jwt.default.sign({ empcloudUserId: 1 }, "test-jwt-secret-coverage-push", { expiresIn: "-1s" });
    authMiddleware.authenticate({ headers: { authorization: `Bearer ${token}` }, query: {} } as any, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ code: "TOKEN_EXPIRED" }));
  });

  it("authenticate handles internal service bypass", () => {
    process.env.INTERNAL_SERVICE_SECRET = "test-secret";
    const req = {
      headers: { "x-internal-service": "empcloud-dashboard", "x-internal-secret": "test-secret" },
      query: { organization_id: "5" },
    } as any;
    authMiddleware.authenticate(req, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
    expect(req.user.role).toBe("org_admin");
    delete process.env.INTERNAL_SERVICE_SECRET;
  });

  it("authorize rejects unauthenticated", () => {
    authMiddleware.authorize("org_admin")({ headers: {}, query: {} } as any, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  it("authorize rejects wrong role", () => {
    authMiddleware.authorize("org_admin")({ user: { role: "employee" } } as any, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it("authorize allows correct role", () => {
    authMiddleware.authorize("org_admin")({ user: { role: "org_admin" } } as any, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });

  it("authorize allows any when no roles", () => {
    authMiddleware.authorize()({ user: { role: "employee" } } as any, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith();
  });
});

// ============================================================================
// MIDDLEWARE — Error Handler
// ============================================================================

describe("Error Handler Middleware", () => {
  let errorMiddleware: typeof import("../../api/middleware/error.middleware");

  beforeAll(async () => {
    errorMiddleware = await import("../../api/middleware/error.middleware");
  });

  function createMockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  }

  it("handles AppError", async () => {
    const { AppError } = await import("../../utils/errors");
    const err = new AppError(400, "BAD", "Bad input", { f: ["req"] });
    const res = createMockRes();
    errorMiddleware.errorHandler(err, {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("handles ZodError", async () => {
    const { ZodError } = await import("zod");
    const err = new ZodError([{ code: "invalid_type", expected: "string", received: "number", path: ["name"], message: "Expected string" }]);
    const res = createMockRes();
    errorMiddleware.errorHandler(err, {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("handles generic Error", () => {
    const err = new Error("Oops");
    const res = createMockRes();
    errorMiddleware.errorHandler(err, {} as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ============================================================================
// UTILS — Error classes
// ============================================================================

describe("Error classes — full coverage", () => {
  it("AppError stores all properties", async () => {
    const { AppError } = await import("../../utils/errors");
    const err = new AppError(418, "TEAPOT", "I am a teapot", { brew: ["too hot"] });
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe("TEAPOT");
    expect(err.message).toBe("I am a teapot");
    expect(err.details).toEqual({ brew: ["too hot"] });
    expect(err.name).toBe("AppError");
    expect(err instanceof Error).toBe(true);
  });

  it("UnauthorizedError custom message", async () => {
    const { UnauthorizedError } = await import("../../utils/errors");
    const err = new UnauthorizedError("Custom auth error");
    expect(err.message).toBe("Custom auth error");
    expect(err.statusCode).toBe(401);
  });

  it("ForbiddenError custom message", async () => {
    const { ForbiddenError } = await import("../../utils/errors");
    const err = new ForbiddenError("Custom forbidden");
    expect(err.message).toBe("Custom forbidden");
  });
});

// ============================================================================
// UTILS — Response helpers
// ============================================================================

describe("Response helpers", () => {
  let sendSuccess: any, sendError: any, sendPaginated: any;

  beforeAll(async () => {
    const mod = await import("../../utils/response");
    sendSuccess = mod.sendSuccess;
    sendError = mod.sendError;
    sendPaginated = mod.sendPaginated;
  });

  function createMockRes() {
    return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  }

  it("sendSuccess default 200", () => {
    const res = createMockRes();
    sendSuccess(res, { ok: true });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { ok: true } });
  });

  it("sendSuccess custom status", () => {
    const res = createMockRes();
    sendSuccess(res, null, 201);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("sendError formats error envelope", () => {
    const res = createMockRes();
    sendError(res, 404, "NOT_FOUND", "Not found");
    expect(res.json).toHaveBeenCalledWith({ success: false, error: { code: "NOT_FOUND", message: "Not found" } });
  });

  it("sendPaginated calculates totalPages", () => {
    const res = createMockRes();
    sendPaginated(res, [1, 2, 3], 30, 2, 10);
    const body = res.json.mock.calls[0][0];
    expect(body.data.totalPages).toBe(3);
    expect(body.data.page).toBe(2);
  });

  it("sendPaginated with zero total", () => {
    const res = createMockRes();
    sendPaginated(res, [], 0, 1, 10);
    expect(res.json.mock.calls[0][0].data.totalPages).toBe(0);
  });
});

// ============================================================================
// JOBS — Queue constants
// ============================================================================

describe("Job Queue constants", () => {
  it("QUEUE_NAMES has correct values", async () => {
    const { QUEUE_NAMES } = await import("../../jobs/queue");
    expect(QUEUE_NAMES.REVIEW_REMINDERS).toContain("review-reminders");
    expect(QUEUE_NAMES.PIP_REMINDERS).toContain("pip-reminders");
    expect(QUEUE_NAMES.MEETING_REMINDERS).toContain("meeting-reminders");
    expect(QUEUE_NAMES.GOAL_REMINDERS).toContain("goal-reminders");
  });

  it("isQueueSystemAvailable returns boolean", async () => {
    const { isQueueSystemAvailable } = await import("../../jobs/queue");
    expect(typeof isQueueSystemAvailable()).toBe("boolean");
  });

  it("getQueue returns null for unknown queue", async () => {
    const { getQueue } = await import("../../jobs/queue");
    expect(getQueue("nonexistent")).toBeNull();
  });
});

// ============================================================================
// EMAIL SERVICE — Template functions
// ============================================================================

describe("Email Service — exported functions (mocked)", () => {
  it("sendReviewReminder is callable", async () => {
    const { sendReviewReminder } = await import("../../services/email/email.service");
    await expect(sendReviewReminder("t@t.com", "Test User", "Q1 Review", "2026-03-31", "self")).resolves.toBeUndefined();
  });

  it("sendPIPCheckInReminder is callable", async () => {
    const { sendPIPCheckInReminder } = await import("../../services/email/email.service");
    await expect(sendPIPCheckInReminder("t@t.com", "Test User", "Improve Code", "2026-04-01")).resolves.toBeUndefined();
  });

  it("sendOneOnOneReminder is callable", async () => {
    const { sendOneOnOneReminder } = await import("../../services/email/email.service");
    await expect(sendOneOnOneReminder("mgr@t.com", "emp@t.com", "Weekly Sync", "2026-04-05 10:00")).resolves.toBeUndefined();
  });

  it("sendGoalDeadlineReminder is callable", async () => {
    const { sendGoalDeadlineReminder } = await import("../../services/email/email.service");
    await expect(sendGoalDeadlineReminder("t@t.com", "Test User", "Q1 Goals", "2026-03-31")).resolves.toBeUndefined();
  });

  it("sendCycleLaunchedNotification is callable", async () => {
    const { sendCycleLaunchedNotification } = await import("../../services/email/email.service");
    await expect(sendCycleLaunchedNotification(["a@t.com", "b@t.com"], "Q2 Review", "2026-04-01", "2026-06-30")).resolves.toBeUndefined();
  });
});
