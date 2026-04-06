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
  generateReviewSummary,
  generateEmployeeSummary,
  generateTeamSummary,
} from "../../services/ai-summary/ai-summary.service";

const ORG = 1;

describe("ai-summary.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockDB.raw.mockResolvedValue([[]]);
    mockDB.count.mockResolvedValue(0);
  });

  // =========================================================================
  // generateReviewSummary
  // =========================================================================
  describe("generateReviewSummary", () => {
    it("should throw NotFoundError if review not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(generateReviewSummary(ORG, "r-1")).rejects.toThrow("Review");
    });

    it("should generate summary with no ratings, goals, or feedback", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "r-1", employee_id: 10, reviewer_id: 20, cycle_id: "c-1", type: "self", overall_rating: 3 }) // review
        .mockResolvedValueOnce({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" }); // cycle
      mockDB.raw.mockResolvedValue([[]]);

      const result = await generateReviewSummary(ORG, "r-1");
      expect(result.review_id).toBe("r-1");
      expect(result.employee_id).toBe(10);
      expect(result.competency_analysis.average_rating).toBe(0);
      expect(result.goal_progress.total_goals).toBe(0);
      expect(result.feedback_themes.total_feedback_count).toBe(0);
      expect(result.recommended_actions.length).toBeGreaterThan(0);
      expect(result.narrative_summary).toBeTruthy();
      expect(result.generated_at).toBeTruthy();
    });

    it("should generate summary with strong ratings (avg >= 4)", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "r-1", employee_id: 10, reviewer_id: 20, cycle_id: "c-1", type: "manager", overall_rating: 4.5 })
        .mockResolvedValueOnce({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      // Competency ratings - strong
      mockDB.raw
        .mockResolvedValueOnce([[
          { competency_id: "comp-1", rating: 4.5, comments: "Great", competency_name: "Leadership", category: "leadership" },
          { competency_id: "comp-2", rating: 4.2, comments: "Good", competency_name: "Communication", category: "communication" },
        ]])
        // Goals
        .mockResolvedValueOnce([[
          { id: "g-1", title: "Revenue", status: "completed", progress: 100, category: "individual" },
          { id: "g-2", title: "Growth", status: "completed", progress: 100, category: "individual" },
        ]])
        // Feedback
        .mockResolvedValueOnce([[
          { type: "kudos", message: "Great job!" },
          { type: "kudos", message: "Excellent!" },
        ]]);

      const result = await generateReviewSummary(ORG, "r-1");
      expect(result.competency_analysis.average_rating).toBeGreaterThan(4);
      expect(result.competency_analysis.strengths.length).toBe(2);
      expect(result.competency_analysis.weaknesses.length).toBe(0);
      expect(result.goal_progress.completed).toBe(2);
      expect(result.goal_progress.completion_percentage).toBe(100);
      expect(result.narrative_summary).toContain("Strong overall performance");
    });

    it("should generate summary with weak ratings (avg < 3)", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "r-1", employee_id: 10, reviewer_id: 20, cycle_id: "c-1", type: "self", overall_rating: 2 })
        .mockResolvedValueOnce({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.raw
        .mockResolvedValueOnce([[
          { competency_id: "comp-1", rating: 2.0, comments: null, competency_name: "Technical", category: "technical" },
          { competency_id: "comp-2", rating: 1.5, comments: null, competency_name: "Core", category: "core" },
        ]])
        .mockResolvedValueOnce([[
          { id: "g-1", title: "Target", status: "not_started", progress: 0, category: "individual" },
          { id: "g-2", title: "Target2", status: "in_progress", progress: 30, category: "individual" },
        ]])
        .mockResolvedValueOnce([[
          { type: "constructive", message: "Needs improvement" },
          { type: "constructive", message: "Below expectations" },
          { type: "constructive", message: "Must improve" },
        ]]);

      const result = await generateReviewSummary(ORG, "r-1");
      expect(result.competency_analysis.weaknesses.length).toBe(2);
      expect(result.goal_progress.completion_percentage).toBe(0);
      expect(result.narrative_summary).toContain("Below expectations");
      // Low goal completion + constructive feedback should appear in recommended actions
      expect(result.recommended_actions.some(a => a.includes("Goal completion"))).toBe(true);
      expect(result.recommended_actions.some(a => a.includes("constructive feedback"))).toBe(true);
    });

    it("should generate summary with medium ratings and partial goals (50-80%)", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "r-1", employee_id: 10, reviewer_id: 20, cycle_id: "c-1", type: "manager", overall_rating: 3.5 })
        .mockResolvedValueOnce({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.raw
        .mockResolvedValueOnce([[
          { competency_id: "comp-1", rating: 3.5, comments: null, competency_name: "Teamwork", category: "core" },
        ]])
        .mockResolvedValueOnce([[
          { id: "g-1", title: "Revenue", status: "completed", progress: 100, category: "individual" },
          { id: "g-2", title: "Growth", status: "completed", progress: 100, category: "individual" },
          { id: "g-3", title: "Expand", status: "in_progress", progress: 50, category: "team" },
        ]])
        .mockResolvedValueOnce([[]]);

      const result = await generateReviewSummary(ORG, "r-1");
      expect(result.narrative_summary).toContain("Meets expectations");
      // 66% goal completion - between 50-80
      expect(result.recommended_actions.some(a => a.includes("Close to target"))).toBe(true);
    });

    it("should handle OpenAI enhanced narrative when OPENAI_API_KEY is set", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "AI generated summary" } }] }),
      }) as any;

      mockDB.findOne
        .mockResolvedValueOnce({ id: "r-1", employee_id: 10, reviewer_id: 20, cycle_id: "c-1", type: "self", overall_rating: 4 })
        .mockResolvedValueOnce({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.raw.mockResolvedValue([[]]);

      const result = await generateReviewSummary(ORG, "r-1");
      expect(result.narrative_summary).toBe("AI generated summary");

      globalThis.fetch = originalFetch;
      delete process.env.OPENAI_API_KEY;
    });

    it("should fall back to template when OpenAI returns non-OK", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as any;

      mockDB.findOne
        .mockResolvedValueOnce({ id: "r-1", employee_id: 10, reviewer_id: 20, cycle_id: "c-1", type: "self", overall_rating: 4 })
        .mockResolvedValueOnce({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.raw.mockResolvedValue([[]]);

      const result = await generateReviewSummary(ORG, "r-1");
      expect(result.narrative_summary).not.toBe("AI generated summary");

      globalThis.fetch = originalFetch;
      delete process.env.OPENAI_API_KEY;
    });

    it("should fall back to template when OpenAI fetch throws", async () => {
      process.env.OPENAI_API_KEY = "test-key";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error")) as any;

      mockDB.findOne
        .mockResolvedValueOnce({ id: "r-1", employee_id: 10, reviewer_id: 20, cycle_id: "c-1", type: "self", overall_rating: 4 })
        .mockResolvedValueOnce({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.raw.mockResolvedValue([[]]);

      const result = await generateReviewSummary(ORG, "r-1");
      expect(result.narrative_summary).toBeTruthy();

      globalThis.fetch = originalFetch;
      delete process.env.OPENAI_API_KEY;
    });

    it("should handle cycle being null", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "r-1", employee_id: 10, reviewer_id: 20, cycle_id: "c-1", type: "self", overall_rating: 3 })
        .mockResolvedValueOnce(null); // cycle not found
      mockDB.raw.mockResolvedValue([[]]);

      const result = await generateReviewSummary(ORG, "r-1");
      expect(result).toBeTruthy();
    });
  });

  // =========================================================================
  // generateEmployeeSummary
  // =========================================================================
  describe("generateEmployeeSummary", () => {
    it("should throw NotFoundError if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(generateEmployeeSummary(ORG, 10, "c-1")).rejects.toThrow("ReviewCycle");
    });

    it("should generate employee summary with no reviews", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
      mockDB.raw.mockResolvedValue([[]]);

      const result = await generateEmployeeSummary(ORG, 10, "c-1");
      expect(result.employee_id).toBe(10);
      expect(result.cycle_id).toBe("c-1");
      expect(result.reviews.self_review).toBeNull();
      expect(result.reviews.manager_review).toBeNull();
      expect(result.reviews.peer_reviews).toHaveLength(0);
      expect(result.consolidated_rating).toBeNull();
      expect(result.feedback_summary.themes).toContain("No peer feedback received");
    });

    it("should generate full employee summary with submitted reviews", async () => {
      // cycle findOne
      mockDB.findOne
        .mockResolvedValueOnce({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" })
        // Reviews' findOne calls for generateReviewSummary
        .mockResolvedValueOnce({ id: "rev-self", employee_id: 10, reviewer_id: 10, cycle_id: "c-1", type: "self", overall_rating: 4, status: "submitted" })
        .mockResolvedValueOnce({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" })
        .mockResolvedValueOnce({ id: "rev-mgr", employee_id: 10, reviewer_id: 20, cycle_id: "c-1", type: "manager", overall_rating: 3.5, status: "submitted" })
        .mockResolvedValueOnce({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });

      // findMany for reviews in cycle
      mockDB.findMany
        .mockResolvedValueOnce({
          data: [
            { id: "rev-self", type: "self", status: "submitted", overall_rating: 4 },
            { id: "rev-mgr", type: "manager", status: "submitted", overall_rating: 3.5 },
            { id: "rev-draft", type: "peer", status: "draft", overall_rating: null },
          ],
          total: 3, page: 1, limit: 100, totalPages: 1,
        })
        .mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });

      mockDB.raw.mockResolvedValue([[]]);

      const result = await generateEmployeeSummary(ORG, 10, "c-1");
      expect(result.reviews.self_review).toBeTruthy();
      expect(result.reviews.manager_review).toBeTruthy();
      expect(result.consolidated_rating).toBeTruthy();
    });

    it("should generate summary with constructive feedback themes", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
      // Raw: comp ratings empty, goals empty, feedback with constructive items
      mockDB.raw
        .mockResolvedValueOnce([[]]) // comp ratings
        .mockResolvedValueOnce([[]]) // goals
        .mockResolvedValueOnce([[
          { type: "constructive", message: "Improve" },
          { type: "constructive", message: "Better" },
          { type: "constructive", message: "Focus" },
          { type: "kudos", message: "Good" },
        ]]);

      const result = await generateEmployeeSummary(ORG, 10, "c-1");
      expect(result.feedback_summary.constructive_count).toBe(3);
      expect(result.recommended_actions.some(a => a.includes("constructive feedback"))).toBe(true);
    });

    it("should generate summary with dev areas from competency ratings", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
      mockDB.raw
        .mockResolvedValueOnce([[
          { name: "Leadership", avg_rating: 4.5 },
          { name: "Technical", avg_rating: 2.0 },
          { name: "Communication", avg_rating: 1.5 },
        ]])
        .mockResolvedValueOnce([[]]) // goals
        .mockResolvedValueOnce([[]]); // feedback

      const result = await generateEmployeeSummary(ORG, 10, "c-1");
      expect(result.competency_analysis.strengths).toContain("Leadership");
      expect(result.competency_analysis.development_areas).toContain("Technical");
      expect(result.competency_analysis.development_areas).toContain("Communication");
    });

    it("should recommend performing well when no issues", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
      // Comp ratings - all strong, goals - 100% complete
      mockDB.raw
        .mockResolvedValueOnce([[{ name: "Leadership", avg_rating: 4.5 }]])
        .mockResolvedValueOnce([[{ status: "completed", progress: 100 }]])
        .mockResolvedValueOnce([[{ type: "kudos", message: "Great!" }]]);

      const result = await generateEmployeeSummary(ORG, 10, "c-1");
      expect(result.recommended_actions.some(a => a.includes("Performing well"))).toBe(true);
    });

    it("should include low goal completion recommendation", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
      mockDB.raw
        .mockResolvedValueOnce([[]]) // comp ratings
        .mockResolvedValueOnce([[
          { status: "not_started", progress: 0 },
          { status: "not_started", progress: 0 },
          { status: "not_started", progress: 0 },
        ]])
        .mockResolvedValueOnce([[]]); // feedback

      const result = await generateEmployeeSummary(ORG, 10, "c-1");
      expect(result.recommended_actions.some(a => a.includes("Goal completion at 0%"))).toBe(true);
    });
  });

  // =========================================================================
  // generateTeamSummary
  // =========================================================================
  describe("generateTeamSummary", () => {
    it("should throw NotFoundError if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(generateTeamSummary(ORG, 20, "c-1")).rejects.toThrow("ReviewCycle");
    });

    it("should generate team summary with no direct reports", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 1000, totalPages: 0 });

      const result = await generateTeamSummary(ORG, 20, "c-1");
      expect(result.manager_id).toBe(20);
      expect(result.team_size).toBe(0);
      expect(result.average_rating).toBeNull();
      expect(result.team_members).toHaveLength(0);
    });

    it("should generate team summary with direct reports", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      // participants
      mockDB.findMany.mockResolvedValueOnce({
        data: [
          { employee_id: 100, manager_id: 20 },
          { employee_id: 101, manager_id: 20 },
        ],
        total: 2, page: 1, limit: 1000, totalPages: 1,
      });
      // ratings for emp 100
      mockDB.raw
        .mockResolvedValueOnce([[{ avg_rating: 4.5 }]])
        .mockResolvedValueOnce([[{ status: "completed" }, { status: "completed" }]])
        // ratings for emp 101
        .mockResolvedValueOnce([[{ avg_rating: 2.0 }]])
        .mockResolvedValueOnce([[{ status: "not_started" }]]);
      // feedback counts
      mockDB.count
        .mockResolvedValueOnce(5) // emp 100
        .mockResolvedValueOnce(1); // emp 101

      const result = await generateTeamSummary(ORG, 20, "c-1");
      expect(result.team_size).toBe(2);
      expect(result.top_performers.length).toBe(1);
      expect(result.needs_attention.length).toBe(1);
      expect(result.average_rating).toBeTruthy();
      expect(result.rating_distribution).toBeTruthy();
      expect(result.recommended_actions.length).toBeGreaterThan(0);
    });

    it("should generate team summary with no-data members", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.findMany.mockResolvedValueOnce({
        data: [{ employee_id: 100, manager_id: 20 }],
        total: 1, page: 1, limit: 1000, totalPages: 1,
      });
      mockDB.raw
        .mockResolvedValueOnce([[{ avg_rating: null }]])
        .mockResolvedValueOnce([[]]);
      mockDB.count.mockResolvedValue(0);

      const result = await generateTeamSummary(ORG, 20, "c-1");
      expect(result.team_members[0].status).toBe("no_data");
      expect(result.recommended_actions.some(a => a.includes("no review data"))).toBe(true);
    });

    it("should include low goal completion recommendation for team", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.findMany.mockResolvedValueOnce({
        data: [{ employee_id: 100, manager_id: 20 }],
        total: 1, page: 1, limit: 1000, totalPages: 1,
      });
      mockDB.raw
        .mockResolvedValueOnce([[{ avg_rating: 3.0 }]])
        .mockResolvedValueOnce([[{ status: "not_started" }, { status: "not_started" }, { status: "not_started" }]]);
      mockDB.count.mockResolvedValue(2);

      const result = await generateTeamSummary(ORG, 20, "c-1");
      expect(result.goal_completion_rate).toBe(0);
      expect(result.recommended_actions.some(a => a.includes("goal completion at 0%"))).toBe(true);
    });

    it("should generate team with all performing well", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.findMany.mockResolvedValueOnce({
        data: [{ employee_id: 100, manager_id: 20 }],
        total: 1, page: 1, limit: 1000, totalPages: 1,
      });
      mockDB.raw
        .mockResolvedValueOnce([[{ avg_rating: 4.5 }]])
        .mockResolvedValueOnce([[{ status: "completed" }]]);
      mockDB.count.mockResolvedValue(10);

      const result = await generateTeamSummary(ORG, 20, "c-1");
      expect(result.recommended_actions.some(a => a.includes("performing well"))).toBe(true);
    });

    it("should handle on_track status (rating between 3 and 4)", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", start_date: "2025-01-01", end_date: "2025-12-31" });
      mockDB.findMany.mockResolvedValueOnce({
        data: [{ employee_id: 100, manager_id: 20 }],
        total: 1, page: 1, limit: 1000, totalPages: 1,
      });
      mockDB.raw
        .mockResolvedValueOnce([[{ avg_rating: 3.5 }]])
        .mockResolvedValueOnce([[{ status: "in_progress" }]]);
      mockDB.count.mockResolvedValue(3);

      const result = await generateTeamSummary(ORG, 20, "c-1");
      expect(result.team_members[0].status).toBe("on_track");
    });
  });
});
