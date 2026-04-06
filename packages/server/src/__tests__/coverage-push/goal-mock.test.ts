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
  createGoal,
  listGoals,
  getGoal,
  updateGoal,
  deleteGoal,
  addKeyResult,
  updateKeyResult,
  deleteKeyResult,
  checkIn,
  getCheckIns,
  getGoalTree,
  getGoalAlignment,
  computeGoalProgress,
} from "../../services/goal/goal.service";

const ORG = 1;
const USER = 10;

describe("goal.service (extended)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  // =========================================================================
  // createGoal
  // =========================================================================
  describe("createGoal", () => {
    it("should create goal with all optional fields", async () => {
      mockDB.findOne.mockResolvedValue({ id: "parent-1", organization_id: ORG }); // parent
      mockDB.create.mockResolvedValue({ id: "g-1", title: "Test" });

      const result = await createGoal(ORG, USER, {
        title: "Test",
        description: "Desc",
        category: "team",
        priority: "high",
        start_date: "2026-01-01",
        due_date: "2026-12-31",
        cycle_id: "c-1",
        parent_goal_id: "parent-1",
        employee_id: 20,
      });
      expect(result.id).toBe("g-1");
    });

    it("should throw if parent goal not in same org", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(createGoal(ORG, USER, { title: "Test", parent_goal_id: "bad-parent" })).rejects.toThrow("Parent goal");
    });

    it("should create goal with defaults", async () => {
      mockDB.create.mockResolvedValue({ id: "g-1" });
      await createGoal(ORG, USER, { title: "Simple" });
      expect(mockDB.create).toHaveBeenCalledWith("goals", expect.objectContaining({
        category: "individual",
        priority: "medium",
        status: "not_started",
        progress: 0,
        employee_id: USER,
      }));
    });
  });

  // =========================================================================
  // listGoals
  // =========================================================================
  describe("listGoals", () => {
    it("should list goals with all filters", async () => {
      mockDB.findMany.mockResolvedValue({ data: [{ id: "g-1" }], total: 1, page: 1, limit: 10, totalPages: 1 });
      const result = await listGoals(ORG, {
        employeeId: 10, cycleId: "c-1", category: "team", status: "in_progress",
        page: 2, perPage: 10, sort: "title", order: "asc",
      });
      expect(result.data).toHaveLength(1);
      expect(result.perPage).toBe(10);
    });
  });

  // =========================================================================
  // getGoal
  // =========================================================================
  describe("getGoal", () => {
    it("should throw if goal not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getGoal(ORG, "x")).rejects.toThrow("Goal");
    });

    it("should return goal with key results and check-ins", async () => {
      mockDB.findOne.mockResolvedValue({ id: "g-1" });
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ id: "kr-1" }], total: 1, page: 1, limit: 100, totalPages: 1 })
        .mockResolvedValueOnce({ data: [{ id: "ci-1" }], total: 1, page: 1, limit: 50, totalPages: 1 });

      const result = await getGoal(ORG, "g-1");
      expect(result.key_results).toHaveLength(1);
      expect(result.check_ins).toHaveLength(1);
    });
  });

  // =========================================================================
  // updateGoal
  // =========================================================================
  describe("updateGoal", () => {
    it("should throw if goal not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(updateGoal(ORG, "x", { title: "New" })).rejects.toThrow("Goal");
    });

    it("should update goal fields", async () => {
      mockDB.findOne.mockResolvedValue({ id: "g-1" });
      mockDB.update.mockResolvedValue({ id: "g-1", title: "Updated" });
      const result = await updateGoal(ORG, "g-1", {
        title: "Updated", description: "New desc", category: "department",
        priority: "low", start_date: "2026-02-01", due_date: "2026-06-01", cycle_id: "c-2",
      });
      expect(result.title).toBe("Updated");
    });

    it("should auto-set completed_at and progress=100 when status=completed", async () => {
      mockDB.findOne.mockResolvedValue({ id: "g-1" });
      mockDB.update.mockResolvedValue({ id: "g-1", status: "completed", progress: 100 });
      await updateGoal(ORG, "g-1", { status: "completed" });
      expect(mockDB.update).toHaveBeenCalledWith("goals", "g-1", expect.objectContaining({
        progress: 100,
        status: "completed",
      }));
    });
  });

  // =========================================================================
  // deleteGoal
  // =========================================================================
  describe("deleteGoal", () => {
    it("should throw if goal not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(deleteGoal(ORG, "x")).rejects.toThrow("Goal");
    });

    it("should soft-delete goal", async () => {
      mockDB.findOne.mockResolvedValue({ id: "g-1" });
      mockDB.update.mockResolvedValue({ id: "g-1", status: "cancelled" });
      await deleteGoal(ORG, "g-1");
      expect(mockDB.update).toHaveBeenCalledWith("goals", "g-1", expect.objectContaining({ status: "cancelled" }));
    });
  });

  // =========================================================================
  // Key Results
  // =========================================================================
  describe("addKeyResult", () => {
    it("should throw if goal not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(addKeyResult(ORG, "x", { title: "KR", target_value: 100 })).rejects.toThrow("Goal");
    });

    it("should add key result and recompute progress", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "g-1" }) // addKeyResult
        .mockResolvedValueOnce({ id: "g-1" }); // computeGoalProgress
      mockDB.create.mockResolvedValue({ id: "kr-1", title: "KR" });
      mockDB.findMany.mockResolvedValue({ data: [{ id: "kr-1", weight: 1, target_value: 100, current_value: 50 }], total: 1, page: 1, limit: 100, totalPages: 1 });
      mockDB.update.mockResolvedValue({ id: "g-1", progress: 50 });

      const result = await addKeyResult(ORG, "g-1", { title: "KR", target_value: 100, current_value: 50, metric_type: "percentage", unit: "%", weight: 2 });
      expect(result.id).toBe("kr-1");
    });
  });

  describe("updateKeyResult", () => {
    it("should throw if goal not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(updateKeyResult(ORG, "x", "kr-1", { title: "New" })).rejects.toThrow("Goal");
    });

    it("should throw if key result not found", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "g-1" }) // goal
        .mockResolvedValueOnce(null); // kr
      await expect(updateKeyResult(ORG, "g-1", "kr-x", { title: "New" })).rejects.toThrow("Key Result");
    });

    it("should update key result fields", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "g-1" })
        .mockResolvedValueOnce({ id: "kr-1", goal_id: "g-1" })
        .mockResolvedValueOnce({ id: "g-1" }); // computeGoalProgress
      mockDB.update.mockResolvedValue({ id: "kr-1", title: "Updated" });
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });

      await updateKeyResult(ORG, "g-1", "kr-1", {
        title: "Updated", metric_type: "number", target_value: 200,
        current_value: 100, unit: "items", weight: 3,
      });
      expect(mockDB.update).toHaveBeenCalled();
    });
  });

  describe("deleteKeyResult", () => {
    it("should throw if goal not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(deleteKeyResult(ORG, "x", "kr-1")).rejects.toThrow("Goal");
    });

    it("should throw if key result not found", async () => {
      mockDB.findOne.mockResolvedValueOnce({ id: "g-1" }).mockResolvedValueOnce(null);
      await expect(deleteKeyResult(ORG, "g-1", "kr-x")).rejects.toThrow("Key Result");
    });

    it("should delete key result and recompute", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "g-1" })
        .mockResolvedValueOnce({ id: "kr-1", goal_id: "g-1" })
        .mockResolvedValueOnce({ id: "g-1" }); // computeGoalProgress
      mockDB.delete.mockResolvedValue(true);
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
      mockDB.update.mockResolvedValue({});

      await deleteKeyResult(ORG, "g-1", "kr-1");
      expect(mockDB.delete).toHaveBeenCalledWith("key_results", "kr-1");
    });
  });

  // =========================================================================
  // Check-ins
  // =========================================================================
  describe("checkIn", () => {
    it("should throw if goal not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(checkIn(ORG, "x", USER, { progress: 50 })).rejects.toThrow("Goal");
    });

    it("should create check-in and auto-transition from not_started", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "g-1", status: "not_started" }) // checkIn
        .mockResolvedValueOnce({ id: "g-1" }); // computeGoalProgress
      mockDB.create.mockResolvedValue({ id: "ci-1", progress: 30 });
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
      mockDB.update.mockResolvedValue({});

      await checkIn(ORG, "g-1", USER, { progress: 30, notes: "Started" });
      // Should auto-transition status
      expect(mockDB.update).toHaveBeenCalledWith("goals", "g-1", expect.objectContaining({ status: "in_progress" }));
    });

    it("should update key result current_value if referenced", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "g-1", status: "in_progress" })
        .mockResolvedValueOnce({ id: "kr-1", goal_id: "g-1" }) // key result lookup
        .mockResolvedValueOnce({ id: "g-1" }); // computeGoalProgress
      mockDB.create.mockResolvedValue({ id: "ci-1" });
      mockDB.update.mockResolvedValue({});
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });

      await checkIn(ORG, "g-1", USER, { progress: 60, key_result_id: "kr-1", current_value: 75 });
      expect(mockDB.update).toHaveBeenCalledWith("key_results", "kr-1", { current_value: 75 });
    });

    it("should throw if referenced key result not found", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "g-1", status: "in_progress" })
        .mockResolvedValueOnce(null);
      await expect(checkIn(ORG, "g-1", USER, { progress: 50, key_result_id: "bad", current_value: 10 })).rejects.toThrow("Key Result");
    });
  });

  describe("getCheckIns", () => {
    it("should throw if goal not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getCheckIns(ORG, "x")).rejects.toThrow("Goal");
    });

    it("should return check-ins", async () => {
      mockDB.findOne.mockResolvedValue({ id: "g-1" });
      mockDB.findMany.mockResolvedValue({ data: [{ id: "ci-1" }], total: 1, page: 1, limit: 100, totalPages: 1 });
      const result = await getCheckIns(ORG, "g-1");
      expect(result).toHaveLength(1);
    });
  });

  // =========================================================================
  // Goal Tree
  // =========================================================================
  describe("getGoalTree", () => {
    it("should build tree with parent-child relationships", async () => {
      mockDB.findMany.mockResolvedValue({
        data: [
          { id: "g-company", title: "Company Goal", category: "company", status: "in_progress", progress: 50, employee_id: 1, parent_goal_id: null, due_date: null },
          { id: "g-dept", title: "Dept Goal", category: "department", status: "in_progress", progress: 60, employee_id: 2, parent_goal_id: "g-company", due_date: null },
          { id: "g-ind", title: "Individual Goal", category: "individual", status: "completed", progress: 100, employee_id: 3, parent_goal_id: "g-dept", due_date: null },
        ],
        total: 3, page: 1, limit: 10000, totalPages: 1,
      });

      const result = await getGoalTree(ORG, "c-1");
      expect(result).toHaveLength(1); // only root
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].children).toHaveLength(1);
      expect(result[0].rollup_progress).toBeGreaterThan(0);
    });

    it("should sort roots by category order", async () => {
      mockDB.findMany.mockResolvedValue({
        data: [
          { id: "g-1", title: "Ind", category: "individual", status: "in_progress", progress: 50, employee_id: 1, parent_goal_id: null, due_date: null },
          { id: "g-2", title: "Company", category: "company", status: "in_progress", progress: 50, employee_id: 1, parent_goal_id: null, due_date: null },
        ],
        total: 2, page: 1, limit: 10000, totalPages: 1,
      });

      const result = await getGoalTree(ORG);
      expect(result[0].category).toBe("company");
      expect(result[1].category).toBe("individual");
    });
  });

  // =========================================================================
  // Goal Alignment
  // =========================================================================
  describe("getGoalAlignment", () => {
    it("should throw if goal not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getGoalAlignment(ORG, "x")).rejects.toThrow("Goal");
    });

    it("should return ancestors and descendants", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "g-3", parent_goal_id: "g-2" }) // target goal
        .mockResolvedValueOnce({ id: "g-2", parent_goal_id: "g-1" }) // parent
        .mockResolvedValueOnce({ id: "g-1", parent_goal_id: null }); // grandparent

      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ id: "g-4", parent_goal_id: "g-3" }], total: 1, page: 1, limit: 1000, totalPages: 1 }) // children of g-3
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 1000, totalPages: 0 }); // children of g-4

      const result = await getGoalAlignment(ORG, "g-3");
      expect(result.ancestors).toHaveLength(2);
      expect(result.descendants).toHaveLength(1);
    });
  });

  // =========================================================================
  // computeGoalProgress
  // =========================================================================
  describe("computeGoalProgress", () => {
    it("should throw if goal not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(computeGoalProgress(ORG, "x")).rejects.toThrow("Goal");
    });

    it("should use latest check-in if no key results", async () => {
      mockDB.findOne.mockResolvedValue({ id: "g-1" });
      mockDB.findMany
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 }) // no KRs
        .mockResolvedValueOnce({ data: [{ progress: 75 }], total: 1, page: 1, limit: 1, totalPages: 1 }); // check-in
      mockDB.update.mockResolvedValue({});

      const result = await computeGoalProgress(ORG, "g-1");
      expect(result).toBe(75);
    });

    it("should return 0 if no key results and no check-ins", async () => {
      mockDB.findOne.mockResolvedValue({ id: "g-1" });
      mockDB.findMany
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 1, totalPages: 0 });
      mockDB.update.mockResolvedValue({});

      const result = await computeGoalProgress(ORG, "g-1");
      expect(result).toBe(0);
    });

    it("should compute weighted average from key results", async () => {
      mockDB.findOne.mockResolvedValue({ id: "g-1" });
      mockDB.findMany.mockResolvedValue({
        data: [
          { id: "kr-1", weight: 2, target_value: 100, current_value: 50 },
          { id: "kr-2", weight: 1, target_value: 100, current_value: 100 },
        ],
        total: 2, page: 1, limit: 100, totalPages: 1,
      });
      mockDB.update.mockResolvedValue({});

      const result = await computeGoalProgress(ORG, "g-1");
      // (50*2 + 100*1) / (2+1) = 200/3 = 67
      expect(result).toBe(67);
    });

    it("should cap KR progress at 100", async () => {
      mockDB.findOne.mockResolvedValue({ id: "g-1" });
      mockDB.findMany.mockResolvedValue({
        data: [{ id: "kr-1", weight: 1, target_value: 50, current_value: 200 }],
        total: 1, page: 1, limit: 100, totalPages: 1,
      });
      mockDB.update.mockResolvedValue({});

      const result = await computeGoalProgress(ORG, "g-1");
      expect(result).toBe(100);
    });

    it("should handle target_value of 0", async () => {
      mockDB.findOne.mockResolvedValue({ id: "g-1" });
      mockDB.findMany.mockResolvedValue({
        data: [{ id: "kr-1", weight: 1, target_value: 0, current_value: 50 }],
        total: 1, page: 1, limit: 100, totalPages: 1,
      });
      mockDB.update.mockResolvedValue({});

      const result = await computeGoalProgress(ORG, "g-1");
      expect(result).toBe(0);
    });
  });
});
