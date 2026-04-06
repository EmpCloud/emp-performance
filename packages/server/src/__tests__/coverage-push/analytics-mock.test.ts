import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock DB adapter
// ---------------------------------------------------------------------------
const mockDB: any = {
  findOne: vi.fn(),
  findMany: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn().mockResolvedValue(0),
  raw: vi.fn().mockResolvedValue([[]]),
};

vi.mock("../../db/adapters", () => ({
  getDB: () => mockDB,
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  getOverview,
  getRatingsDistribution,
  getTrends,
  getTeamComparison,
  getGoalCompletion,
  getTopPerformers,
  getSkillsGap,
  getDepartmentSkillsGap,
  getLearningRecommendations,
  classifyNineBox,
  getNineBoxData,
  createPotentialAssessment,
  listPotentialAssessments,
  createSuccessionPlan,
  listSuccessionPlans,
  getSuccessionPlan,
  addSuccessionCandidate,
  updateSuccessionCandidate,
} from "../../services/analytics/analytics.service";

const ORG = 1;

describe("analytics.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockDB.raw.mockResolvedValue([[]]);
    mockDB.count.mockResolvedValue(0);
  });

  // =========================================================================
  // getOverview
  // =========================================================================
  describe("getOverview", () => {
    it("should return overview stats", async () => {
      mockDB.count
        .mockResolvedValueOnce(2) // active cycles
        .mockResolvedValueOnce(5) // pending reviews
        .mockResolvedValueOnce(20) // total goals
        .mockResolvedValueOnce(15) // completed goals
        .mockResolvedValueOnce(1)  // pip count
        .mockResolvedValueOnce(30); // feedback count

      const result = await getOverview(ORG);
      expect(result.activeCycles).toBe(2);
      expect(result.pendingReviews).toBe(5);
      expect(result.goalCompletionRate).toBe(75); // 15/20 * 100
      expect(result.pipCount).toBe(1);
      expect(result.feedbackCount).toBe(30);
    });

    it("should handle zero total goals", async () => {
      mockDB.count.mockResolvedValue(0);
      const result = await getOverview(ORG);
      expect(result.goalCompletionRate).toBe(0);
    });
  });

  // =========================================================================
  // getRatingsDistribution (analytics version)
  // =========================================================================
  describe("getRatingsDistribution", () => {
    it("should return cached distribution if available", async () => {
      mockDB.findMany.mockResolvedValue({
        data: [{ rating: 3, count: 10 }],
        total: 1, page: 1, limit: 10, totalPages: 1,
      });
      const result = await getRatingsDistribution(ORG, "c-1");
      expect(result).toHaveLength(1);
    });

    it("should compute from reviews when no cache", async () => {
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 });
      mockDB.raw.mockResolvedValue([[{ rating: 4, count: 5 }]]);
      const result = await getRatingsDistribution(ORG, "c-1");
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // getTrends
  // =========================================================================
  describe("getTrends", () => {
    it("should return trend data", async () => {
      mockDB.raw.mockResolvedValue([[
        { cycle_name: "Q1", cycle_id: "c1", avg_rating: 3.5, review_count: 10 },
        { cycle_name: "Q2", cycle_id: "c2", avg_rating: 4.0, review_count: 12 },
      ]]);
      const result = await getTrends(ORG);
      expect(result).toHaveLength(2);
    });

    it("should handle empty trends", async () => {
      mockDB.raw.mockResolvedValue([[]]);
      const result = await getTrends(ORG);
      expect(result).toHaveLength(0);
    });
  });

  // =========================================================================
  // getTeamComparison
  // =========================================================================
  describe("getTeamComparison", () => {
    it("should return team comparison", async () => {
      mockDB.raw.mockResolvedValue([[{ employee_id: 10, avg_rating: 4.2, review_count: 3 }]]);
      const result = await getTeamComparison(ORG, 20);
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // getGoalCompletion
  // =========================================================================
  describe("getGoalCompletion", () => {
    it("should return goal completion by category", async () => {
      mockDB.raw.mockResolvedValue([[
        { category: "individual", total: 10, completed: 7, avg_progress: 75 },
      ]]);
      const result = await getGoalCompletion(ORG);
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // getTopPerformers
  // =========================================================================
  describe("getTopPerformers", () => {
    it("should return top performers", async () => {
      mockDB.raw.mockResolvedValue([[
        { employee_id: 10, avg_rating: 4.8, review_count: 2 },
      ]]);
      const result = await getTopPerformers(ORG, "c-1");
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // getSkillsGap
  // =========================================================================
  describe("getSkillsGap", () => {
    it("should return skills gap with career track", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ employee_id: 10, career_path_id: "cp-1" }) // track
        .mockResolvedValueOnce({ id: "cp-1", organization_id: ORG }); // career path

      mockDB.raw.mockResolvedValue([[{ id: "rev-1" }]]); // latest review
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ id: "fw-1" }], total: 1, page: 1, limit: 100, totalPages: 1 }) // frameworks
        .mockResolvedValueOnce({ data: [{ id: "comp-1", name: "Leadership", category: "leadership", weight: 3 }], total: 1, page: 1, limit: 100, totalPages: 1 }) // competencies from framework
        .mockResolvedValueOnce({ data: [{ competency_id: "comp-1", rating: 4 }], total: 1, page: 1, limit: 100, totalPages: 1 }); // ratings

      const result = await getSkillsGap(ORG, 10);
      expect(result.employee_id).toBe(10);
      expect(result.competencies).toHaveLength(1);
      expect(result.competencies[0].status).toBe("exceeds");
    });

    it("should return skills gap without career track (fallback)", async () => {
      mockDB.findOne.mockResolvedValue(null); // no track
      mockDB.raw.mockResolvedValue([[]]); // no latest review
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ id: "fw-1" }], total: 1, page: 1, limit: 100, totalPages: 1 })
        .mockResolvedValueOnce({ data: [{ id: "comp-1", name: "Core", category: "core", weight: 3 }], total: 1, page: 1, limit: 100, totalPages: 1 });

      const result = await getSkillsGap(ORG, 10);
      expect(result.competencies).toHaveLength(1);
      expect(result.competencies[0].currentRating).toBe(0);
      expect(result.competencies[0].status).toBe("gap");
    });

    it("should classify meets correctly", async () => {
      mockDB.findOne.mockResolvedValue(null);
      mockDB.raw.mockResolvedValue([[{ id: "rev-1" }]]);
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ id: "fw-1" }], total: 1, page: 1, limit: 100, totalPages: 1 })
        .mockResolvedValueOnce({ data: [{ id: "comp-1", name: "Core", category: "core", weight: 3 }], total: 1, page: 1, limit: 100, totalPages: 1 })
        .mockResolvedValueOnce({ data: [{ competency_id: "comp-1", rating: 3 }], total: 1, page: 1, limit: 100, totalPages: 1 });

      const result = await getSkillsGap(ORG, 10);
      expect(result.competencies[0].status).toBe("meets");
      expect(result.overallReadiness).toBe(100);
    });

    it("should handle no competencies", async () => {
      mockDB.findOne.mockResolvedValue(null);
      mockDB.raw.mockResolvedValue([[]]);
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });

      const result = await getSkillsGap(ORG, 10);
      expect(result.competencies).toHaveLength(0);
      expect(result.overallReadiness).toBe(100);
    });
  });

  // =========================================================================
  // getDepartmentSkillsGap
  // =========================================================================
  describe("getDepartmentSkillsGap", () => {
    it("should aggregate skills gap across employees", async () => {
      // Career paths in department
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ id: "cp-1" }], total: 1, page: 1, limit: 100, totalPages: 1 }) // career paths
        .mockResolvedValueOnce({ data: [{ employee_id: 10, career_path_id: "cp-1" }], total: 1, page: 1, limit: 1000, totalPages: 1 }); // tracks

      // getSkillsGap for employee 10 - will call findOne, raw, findMany
      mockDB.findOne
        .mockResolvedValueOnce({ employee_id: 10, career_path_id: "cp-1" }) // track
        .mockResolvedValueOnce({ id: "cp-1", organization_id: ORG }); // career path
      mockDB.raw.mockResolvedValue([[]]);
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ id: "fw-1" }], total: 1, page: 1, limit: 100, totalPages: 1 })
        .mockResolvedValueOnce({ data: [{ id: "comp-1", name: "Core", category: "core", weight: 3 }], total: 1, page: 1, limit: 100, totalPages: 1 })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 }); // no ratings

      const result = await getDepartmentSkillsGap(ORG, "engineering");
      expect(result.department).toBe("engineering");
      expect(result.employees).toHaveLength(1);
      expect(result.aggregatedGaps.length).toBeGreaterThanOrEqual(0);
    });

    it("should return empty when no employees in department", async () => {
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
      const result = await getDepartmentSkillsGap(ORG, "unknown");
      expect(result.employees).toHaveLength(0);
      expect(result.averageReadiness).toBe(100);
    });
  });

  // =========================================================================
  // getLearningRecommendations
  // =========================================================================
  describe("getLearningRecommendations", () => {
    it("should recommend for each gap category", async () => {
      const gaps = [
        { competency_id: "1", name: "Lead", category: "leadership", currentRating: 2, requiredRating: 4, gap: 2, status: "gap" as const },
        { competency_id: "2", name: "Code", category: "technical", currentRating: 2, requiredRating: 4, gap: 2, status: "gap" as const },
        { competency_id: "3", name: "Talk", category: "communication", currentRating: 2, requiredRating: 4, gap: 2, status: "gap" as const },
        { competency_id: "4", name: "Base", category: "core", currentRating: 2, requiredRating: 4, gap: 2, status: "gap" as const },
        { competency_id: "5", name: "Func", category: "functional", currentRating: 2, requiredRating: 4, gap: 2, status: "gap" as const },
        { competency_id: "6", name: "Behave", category: "behavioral", currentRating: 2, requiredRating: 4, gap: 2, status: "gap" as const },
        { competency_id: "7", name: "Other", category: "unknown", currentRating: 2, requiredRating: 4, gap: 2, status: "gap" as const },
      ];

      const result = getLearningRecommendations(gaps);
      expect(result).toHaveLength(7);
      expect(result[0].recommendation).toContain("Leadership");
      expect(result[1].recommendation).toContain("Technical");
      expect(result[2].recommendation).toContain("Communication");
      expect(result[3].recommendation).toContain("Core");
      expect(result[4].recommendation).toContain("Functional");
      expect(result[5].recommendation).toContain("Behavioral");
      expect(result[6].recommendation).toContain("Training recommended");
    });

    it("should return empty for no gaps", async () => {
      const gaps = [
        { competency_id: "1", name: "Lead", category: "leadership", currentRating: 5, requiredRating: 3, gap: -2, status: "exceeds" as const },
      ];
      const result = getLearningRecommendations(gaps);
      expect(result).toHaveLength(0);
    });

    it("should sort by gap descending", async () => {
      const gaps = [
        { competency_id: "1", name: "Small", category: "core", currentRating: 2, requiredRating: 3, gap: 1, status: "gap" as const },
        { competency_id: "2", name: "Big", category: "core", currentRating: 1, requiredRating: 5, gap: 4, status: "gap" as const },
      ];
      const result = getLearningRecommendations(gaps);
      expect(result[0].competency).toBe("Big");
    });
  });

  // =========================================================================
  // Nine-Box
  // =========================================================================
  describe("classifyNineBox", () => {
    it("should classify all 9 boxes correctly", () => {
      expect(classifyNineBox(4.5, 4.5)).toBe("Star");
      expect(classifyNineBox(4.5, 3.0)).toBe("High Performer");
      expect(classifyNineBox(4.5, 1.0)).toBe("Solid Performer");
      expect(classifyNineBox(3.0, 4.5)).toBe("High Potential");
      expect(classifyNineBox(3.0, 3.0)).toBe("Core Player");
      expect(classifyNineBox(3.0, 1.0)).toBe("Average");
      expect(classifyNineBox(1.0, 4.5)).toBe("Inconsistent");
      expect(classifyNineBox(1.0, 3.0)).toBe("Improvement Needed");
      expect(classifyNineBox(1.0, 1.0)).toBe("Action Required");
    });

    it("should handle boundary values", () => {
      expect(classifyNineBox(4.0, 4.0)).toBe("Star");
      expect(classifyNineBox(2.5, 2.5)).toBe("Core Player");
      expect(classifyNineBox(2.4, 2.4)).toBe("Action Required");
    });
  });

  describe("getNineBoxData", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getNineBoxData(ORG, "x")).rejects.toThrow("ReviewCycle");
    });

    it("should return nine-box data with employees", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1" });
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ employee_id: 10, final_rating: 4.5 }, { employee_id: 11, final_rating: 2.0 }], total: 2, page: 1, limit: 10000, totalPages: 1 })
        .mockResolvedValueOnce({ data: [{ employee_id: 10, potential_rating: 4.5 }, { employee_id: 11, potential_rating: 1.0 }], total: 2, page: 1, limit: 10000, totalPages: 1 });

      const result = await getNineBoxData(ORG, "c-1");
      expect(result.totalEmployees).toBe(2);
      expect(result.boxes["Star"].count).toBe(1);
      expect(result.boxes["Action Required"].count).toBe(1);
    });

    it("should skip participants with missing performance or potential", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1" });
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ employee_id: 10, final_rating: null }], total: 1, page: 1, limit: 10000, totalPages: 1 })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 10000, totalPages: 0 });

      const result = await getNineBoxData(ORG, "c-1");
      expect(result.totalEmployees).toBe(0);
    });
  });

  describe("createPotentialAssessment", () => {
    it("should throw for invalid rating", async () => {
      await expect(createPotentialAssessment(ORG, { cycle_id: "c-1", employee_id: 10, potential_rating: 0 }, 20)).rejects.toThrow("potential_rating");
      await expect(createPotentialAssessment(ORG, { cycle_id: "c-1", employee_id: 10, potential_rating: 6 }, 20)).rejects.toThrow("potential_rating");
    });

    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(createPotentialAssessment(ORG, { cycle_id: "x", employee_id: 10, potential_rating: 3 }, 20)).rejects.toThrow("ReviewCycle");
    });

    it("should update existing assessment", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "c-1" }) // cycle
        .mockResolvedValueOnce({ id: "pa-1", cycle_id: "c-1", employee_id: 10 }); // existing
      mockDB.update.mockResolvedValue({ id: "pa-1", potential_rating: 4 });

      const result = await createPotentialAssessment(ORG, { cycle_id: "c-1", employee_id: 10, potential_rating: 4 }, 20);
      expect(result.potential_rating).toBe(4);
    });

    it("should create new assessment", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "c-1" }) // cycle
        .mockResolvedValueOnce(null); // no existing
      mockDB.create.mockResolvedValue({ id: "pa-new", potential_rating: 3 });

      const result = await createPotentialAssessment(ORG, { cycle_id: "c-1", employee_id: 10, potential_rating: 3, notes: "Good" }, 20);
      expect(result.potential_rating).toBe(3);
    });
  });

  describe("listPotentialAssessments", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(listPotentialAssessments(ORG, "x")).rejects.toThrow("ReviewCycle");
    });

    it("should list assessments", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1" });
      mockDB.findMany.mockResolvedValue({ data: [{ id: "pa-1" }], total: 1, page: 1, limit: 10000, totalPages: 1 });
      const result = await listPotentialAssessments(ORG, "c-1");
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // Succession Planning
  // =========================================================================
  describe("createSuccessionPlan", () => {
    it("should create succession plan with defaults", async () => {
      mockDB.create.mockResolvedValue({ id: "sp-1", position_title: "CTO" });
      const result = await createSuccessionPlan(ORG, { position_title: "CTO" });
      expect(result.position_title).toBe("CTO");
      expect(mockDB.create).toHaveBeenCalledWith("succession_plans", expect.objectContaining({
        criticality: "medium",
        status: "identified",
      }));
    });

    it("should create with all fields", async () => {
      mockDB.create.mockResolvedValue({ id: "sp-1" });
      await createSuccessionPlan(ORG, {
        position_title: "VP Eng",
        current_holder_id: 10,
        department: "Engineering",
        criticality: "high",
        status: "active",
      });
      expect(mockDB.create).toHaveBeenCalledWith("succession_plans", expect.objectContaining({
        current_holder_id: 10,
        department: "Engineering",
        criticality: "high",
        status: "active",
      }));
    });
  });

  describe("listSuccessionPlans", () => {
    it("should list plans with candidate counts", async () => {
      mockDB.findMany.mockResolvedValue({ data: [{ id: "sp-1" }], total: 1, page: 1, limit: 1000, totalPages: 1 });
      mockDB.count.mockResolvedValue(3);

      const result = await listSuccessionPlans(ORG);
      expect(result).toHaveLength(1);
      expect(result[0].candidate_count).toBe(3);
    });
  });

  describe("getSuccessionPlan", () => {
    it("should throw if plan not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getSuccessionPlan(ORG, "x")).rejects.toThrow("SuccessionPlan");
    });

    it("should return plan with candidates", async () => {
      mockDB.findOne.mockResolvedValue({ id: "sp-1" });
      mockDB.findMany.mockResolvedValue({ data: [{ id: "sc-1" }], total: 1, page: 1, limit: 1000, totalPages: 1 });
      const result = await getSuccessionPlan(ORG, "sp-1");
      expect(result.candidates).toHaveLength(1);
    });
  });

  describe("addSuccessionCandidate", () => {
    it("should throw if plan not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(addSuccessionCandidate(ORG, "x", { employee_id: 10 })).rejects.toThrow("SuccessionPlan");
    });

    it("should add candidate with defaults", async () => {
      mockDB.findOne.mockResolvedValue({ id: "sp-1" });
      mockDB.create.mockResolvedValue({ id: "sc-1", readiness: "3_5_years" });
      const result = await addSuccessionCandidate(ORG, "sp-1", { employee_id: 10 });
      expect(result.readiness).toBe("3_5_years");
    });

    it("should add candidate with all fields", async () => {
      mockDB.findOne.mockResolvedValue({ id: "sp-1" });
      mockDB.create.mockResolvedValue({ id: "sc-1" });
      await addSuccessionCandidate(ORG, "sp-1", {
        employee_id: 10,
        readiness: "ready_now",
        development_notes: "Ready for promotion",
        nine_box_position: "Star",
      });
      expect(mockDB.create).toHaveBeenCalledWith("succession_candidates", expect.objectContaining({
        readiness: "ready_now",
        development_notes: "Ready for promotion",
      }));
    });
  });

  describe("updateSuccessionCandidate", () => {
    it("should throw if plan not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(updateSuccessionCandidate(ORG, "x", "sc-1", { readiness: "ready_now" })).rejects.toThrow("SuccessionPlan");
    });

    it("should throw if candidate not found", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "sp-1" }).mockResolvedValueOnce(null);
      await expect(updateSuccessionCandidate(ORG, "sp-1", "sc-x", { readiness: "ready_now" })).rejects.toThrow("SuccessionCandidate");
    });

    it("should update candidate", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "sp-1" })
        .mockResolvedValueOnce({ id: "sc-1", plan_id: "sp-1" });
      mockDB.update.mockResolvedValue({ id: "sc-1", readiness: "ready_now" });
      const result = await updateSuccessionCandidate(ORG, "sp-1", "sc-1", {
        readiness: "ready_now",
        development_notes: "Updated",
        nine_box_position: "High Performer",
      });
      expect(result.readiness).toBe("ready_now");
    });
  });
});
