import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDB = vi.hoisted(() => ({
  findOne: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  raw: vi.fn(),
  count: vi.fn(),
}));

vi.mock("../../db/adapters", () => ({
  getDB: () => mockDB,
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { generateEmployeeSummary, generateReviewSummary } from "./ai-summary.service";

const ORG_ID = 7;
const REVIEW = {
  id: "review-1",
  organization_id: ORG_ID,
  employee_id: 10,
  reviewer_id: 20,
  cycle_id: "cycle-1",
  type: "peer",
  status: "submitted",
  overall_rating: 4,
};
const CYCLE = {
  id: "cycle-1",
  organization_id: ORG_ID,
  framework_id: "framework-1",
  status: "completed",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
};
const FRAMEWORK = {
  id: "framework-1",
  organization_id: ORG_ID,
  is_active: true,
  deleted_at: null,
};

function arrangeOwnedReview(framework: typeof FRAMEWORK | null = FRAMEWORK) {
  mockDB.findOne.mockImplementation((table: string) => {
    if (table === "reviews") return Promise.resolve(REVIEW);
    if (table === "review_cycles") return Promise.resolve(CYCLE);
    if (table === "competency_frameworks") return Promise.resolve(framework);
    if (table === "ai_summary_cache") return Promise.resolve(null);
    return Promise.resolve(null);
  });
}

describe("AI review summary Phase 2 privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    mockDB.findMany.mockResolvedValue({ data: [], total: 0 });
    mockDB.count.mockResolvedValue(0);
    mockDB.create.mockResolvedValue({});
    mockDB.update.mockResolvedValue({});
  });

  it("builds an assigned peer reviewer summary without employee-wide goals or feedback", async () => {
    arrangeOwnedReview();
    mockDB.raw.mockResolvedValueOnce([[
      {
        competency_id: "competency-1",
        competency_name: "Communication",
        category: "core",
        rating: 4,
        comments: "Clear updates",
      },
    ]]);

    const result = await generateReviewSummary(
      ORG_ID,
      REVIEW.id,
      false,
      { includeEmployeeContext: false },
    );

    expect(result.competency_analysis.all_ratings).toHaveLength(1);
    expect(result.goal_progress).toEqual({
      total_goals: 0,
      completed: 0,
      in_progress: 0,
      completion_percentage: 0,
      average_progress: 0,
      highlights: [],
    });
    expect(result.feedback_themes.total_feedback_count).toBe(0);
    expect(result.feedback_themes.positive.sample_messages).toEqual([]);
    expect(result.narrative_summary).not.toContain("Goal completion");
    expect(result.recommended_actions.join(" ")).not.toMatch(/goal|feedback/i);
    expect(mockDB.raw).toHaveBeenCalledTimes(1);
    expect(mockDB.create).not.toHaveBeenCalled();
  });

  it("resolves rating metadata only through the active tenant-owned cycle framework", async () => {
    arrangeOwnedReview();
    mockDB.raw.mockResolvedValueOnce([[]]);

    await generateReviewSummary(
      ORG_ID,
      REVIEW.id,
      false,
      { includeEmployeeContext: false },
    );

    const [sql, params] = mockDB.raw.mock.calls[0];
    expect(sql).toContain("c.framework_id = ?");
    expect(sql).toContain("c.deleted_at IS NULL");
    expect(params).toEqual([FRAMEWORK.id, REVIEW.id]);
    expect(mockDB.findOne).toHaveBeenCalledWith("competency_frameworks", {
      id: FRAMEWORK.id,
      organization_id: ORG_ID,
      is_active: true,
      deleted_at: null,
    });
  });

  it("returns no competency metadata when the cycle framework is not tenant-owned and active", async () => {
    arrangeOwnedReview(null);

    const result = await generateReviewSummary(
      ORG_ID,
      REVIEW.id,
      false,
      { includeEmployeeContext: false },
    );

    expect(result.competency_analysis.all_ratings).toEqual([]);
    expect(mockDB.raw).not.toHaveBeenCalled();
  });

  it("preserves full employee context for authorized admin and subject callers", async () => {
    arrangeOwnedReview();
    mockDB.raw.mockImplementation((sql: string) => {
      if (sql.includes("review_competency_ratings")) return Promise.resolve([[]]);
      if (sql.includes("FROM goals")) {
        return Promise.resolve([[
          { id: "goal-1", title: "Launch", status: "completed", progress: 100, category: "team" },
        ]]);
      }
      if (sql.includes("continuous_feedback")) {
        return Promise.resolve([[
          { type: "kudos", message: "Excellent delivery" },
        ]]);
      }
      return Promise.resolve([[]]);
    });

    const result = await generateReviewSummary(ORG_ID, REVIEW.id);

    expect(result.goal_progress.highlights).toEqual([
      expect.objectContaining({ id: "goal-1", title: "Launch" }),
    ]);
    expect(result.feedback_themes.positive.sample_messages).toEqual(["Excellent delivery"]);
    expect(mockDB.create).toHaveBeenCalledWith(
      "ai_summary_cache",
      expect.objectContaining({ scope_key: "v2:review-1:submitted:completed" }),
    );
  });

  it("partitions completed-release cache entries from pre-release draft summaries", async () => {
    let reviewStatus = "draft";
    let cycleStatus = "active";
    mockDB.findOne.mockImplementation((table: string) => {
      if (table === "reviews") return Promise.resolve({ ...REVIEW, status: reviewStatus });
      if (table === "review_cycles") return Promise.resolve({ ...CYCLE, status: cycleStatus });
      if (table === "competency_frameworks") return Promise.resolve(FRAMEWORK);
      if (table === "ai_summary_cache") return Promise.resolve(null);
      return Promise.resolve(null);
    });
    mockDB.raw.mockResolvedValue([[]]);

    await generateReviewSummary(ORG_ID, REVIEW.id);
    reviewStatus = "submitted";
    cycleStatus = "completed";
    await generateReviewSummary(ORG_ID, REVIEW.id);

    const cacheKeys = mockDB.create.mock.calls
      .filter(([table]) => table === "ai_summary_cache")
      .map(([, row]) => row.scope_key);
    expect(cacheKeys).toContain("v2:review-1:draft:active");
    expect(cacheKeys).toContain("v2:review-1:submitted:completed");
  });

  it("scopes aggregate employee competency metadata through the validated cycle framework", async () => {
    arrangeOwnedReview();
    mockDB.findMany.mockResolvedValue({ data: [], total: 0 });
    mockDB.raw.mockResolvedValue([[]]);

    await generateEmployeeSummary(ORG_ID, REVIEW.employee_id, CYCLE.id);

    const aggregateCall = mockDB.raw.mock.calls.find(([sql]) =>
      sql.includes("AVG(rcr.rating)"),
    );
    expect(aggregateCall).toBeDefined();
    expect(aggregateCall?.[0]).toContain("c.framework_id = ?");
    expect(aggregateCall?.[0]).toContain("c.deleted_at IS NULL");
    expect(aggregateCall?.[1]).toEqual([
      FRAMEWORK.id,
      ORG_ID,
      REVIEW.employee_id,
      CYCLE.id,
    ]);
  });
});
