import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock DB adapter
// ---------------------------------------------------------------------------

const mockDB = {
  create: vi.fn(),
  findOne: vi.fn(),
  findMany: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  count: vi.fn(),
  raw: vi.fn(),
};

vi.mock("../../db/adapters", () => ({
  getDB: () => mockDB,
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import {
  createGoal,
  listGoals,
  getGoal,
  updateGoal,
  deleteGoal,
  checkIn,
  computeGoalProgress,
} from "./goal.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG_ID = 1;
const USER_ID = 10;

function makeGoal(overrides: Record<string, any> = {}) {
  return {
    id: "goal-1",
    organization_id: ORG_ID,
    employee_id: USER_ID,
    title: "Increase revenue",
    description: null,
    category: "individual",
    priority: "medium",
    status: "not_started",
    progress: 0,
    start_date: null,
    due_date: null,
    completed_at: null,
    cycle_id: null,
    parent_goal_id: null,
    created_by: USER_ID,
    created_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("goal.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // createGoal
  // -------------------------------------------------------------------------
  describe("createGoal", () => {
    it("should create a goal with default values", async () => {
      const expected = makeGoal();
      mockDB.create.mockResolvedValue(expected);

      const result = await createGoal(ORG_ID, USER_ID, { title: "Increase revenue" });

      expect(mockDB.create).toHaveBeenCalledWith(
        "goals",
        expect.objectContaining({
          organization_id: ORG_ID,
          title: "Increase revenue",
          status: "not_started",
          progress: 0,
          employee_id: USER_ID,
        }),
      );
      expect(result.title).toBe("Increase revenue");
    });

    it("should validate parent goal exists in same org", async () => {
      mockDB.findOne.mockResolvedValue(null);

      await expect(
        createGoal(ORG_ID, USER_ID, { title: "Child", parent_goal_id: "nonexistent" }),
      ).rejects.toThrow("not found");
    });

    it("should create goal with parent when parent exists", async () => {
      const parent = makeGoal({ id: "parent-1", title: "Parent" });
      mockDB.findOne.mockResolvedValue(parent);
      mockDB.create.mockResolvedValue(makeGoal({ parent_goal_id: "parent-1" }));

      const result = await createGoal(ORG_ID, USER_ID, {
        title: "Child",
        parent_goal_id: "parent-1",
      });

      expect(result.parent_goal_id).toBe("parent-1");
    });

    it("should assign employee_id from data if provided", async () => {
      mockDB.create.mockResolvedValue(makeGoal({ employee_id: 99 }));

      await createGoal(ORG_ID, USER_ID, { title: "Other's goal", employee_id: 99 });

      expect(mockDB.create).toHaveBeenCalledWith(
        "goals",
        expect.objectContaining({ employee_id: 99 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // listGoals
  // -------------------------------------------------------------------------
  describe("listGoals", () => {
    it("should return paginated goals", async () => {
      mockDB.findMany.mockResolvedValue({
        data: [makeGoal()],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const result = await listGoals(ORG_ID, {});

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it("should filter by status and category", async () => {
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      await listGoals(ORG_ID, { status: "in_progress", category: "team" });

      expect(mockDB.findMany).toHaveBeenCalledWith(
        "goals",
        expect.objectContaining({
          filters: expect.objectContaining({
            status: "in_progress",
            category: "team",
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // updateGoal — update progress
  // -------------------------------------------------------------------------
  describe("updateGoal", () => {
    it("should update goal fields", async () => {
      mockDB.findOne.mockResolvedValue(makeGoal());
      mockDB.update.mockResolvedValue(makeGoal({ title: "Updated title" }));

      const result = await updateGoal(ORG_ID, "goal-1", { title: "Updated title" });

      expect(result.title).toBe("Updated title");
    });

    it("should set completed_at and progress=100 when status is completed", async () => {
      mockDB.findOne.mockResolvedValue(makeGoal());
      mockDB.update.mockResolvedValue(makeGoal({ status: "completed", progress: 100 }));

      await updateGoal(ORG_ID, "goal-1", { status: "completed" });

      expect(mockDB.update).toHaveBeenCalledWith(
        "goals",
        "goal-1",
        expect.objectContaining({
          status: "completed",
          progress: 100,
          completed_at: expect.any(String),
        }),
      );
    });

    it("should throw NotFoundError for missing goal", async () => {
      mockDB.findOne.mockResolvedValue(null);

      await expect(updateGoal(ORG_ID, "nope", {})).rejects.toThrow("not found");
    });
  });

  // -------------------------------------------------------------------------
  // deleteGoal (soft delete)
  // -------------------------------------------------------------------------
  describe("deleteGoal", () => {
    it("should soft-delete by setting status to cancelled", async () => {
      mockDB.findOne.mockResolvedValue(makeGoal());
      mockDB.update.mockResolvedValue(makeGoal({ status: "cancelled" }));

      await deleteGoal(ORG_ID, "goal-1");

      expect(mockDB.update).toHaveBeenCalledWith(
        "goals",
        "goal-1",
        expect.objectContaining({ status: "cancelled" }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // checkIn
  // -------------------------------------------------------------------------
  describe("checkIn", () => {
    it("should create a check-in and recompute progress", async () => {
      const goal = makeGoal({ status: "not_started" });
      mockDB.findOne.mockResolvedValue(goal);
      mockDB.create.mockResolvedValue({
        id: "ci-1",
        goal_id: "goal-1",
        author_id: USER_ID,
        progress: 30,
        notes: "Making progress",
      });
      // computeGoalProgress mocks
      mockDB.findMany
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 }) // key_results
        .mockResolvedValueOnce({ data: [{ progress: 30 }], total: 1, page: 1, limit: 1, totalPages: 1 }); // check_ins
      mockDB.update.mockResolvedValue(goal);

      const result = await checkIn(ORG_ID, "goal-1", USER_ID, {
        progress: 30,
        notes: "Making progress",
      });

      expect(result.progress).toBe(30);
      expect(mockDB.create).toHaveBeenCalledWith(
        "goal_check_ins",
        expect.objectContaining({ progress: 30 }),
      );
    });

    it("should auto-transition from not_started to in_progress", async () => {
      const goal = makeGoal({ status: "not_started" });
      mockDB.findOne.mockResolvedValue(goal);
      mockDB.create.mockResolvedValue({
        id: "ci-1",
        goal_id: "goal-1",
        author_id: USER_ID,
        progress: 10,
      });
      mockDB.findMany
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 })
        .mockResolvedValueOnce({ data: [{ progress: 10 }], total: 1, page: 1, limit: 1, totalPages: 1 });
      mockDB.update.mockResolvedValue(goal);

      await checkIn(ORG_ID, "goal-1", USER_ID, { progress: 10 });

      // Last update call should transition status
      const updateCalls = mockDB.update.mock.calls;
      const statusUpdate = updateCalls.find(
        (c: any[]) => c[0] === "goals" && c[2]?.status === "in_progress",
      );
      expect(statusUpdate).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // computeGoalProgress
  // -------------------------------------------------------------------------
  describe("computeGoalProgress", () => {
    it("should compute weighted average from key results", async () => {
      mockDB.findOne.mockResolvedValue(makeGoal());
      mockDB.findMany.mockResolvedValueOnce({
        data: [
          { id: "kr-1", target_value: 100, current_value: 50, weight: 1 },
          { id: "kr-2", target_value: 200, current_value: 100, weight: 2 },
        ],
        total: 2,
        page: 1,
        limit: 100,
        totalPages: 1,
      });
      mockDB.update.mockResolvedValue(makeGoal({ progress: 50 }));

      const progress = await computeGoalProgress(ORG_ID, "goal-1");

      // kr-1: 50/100 * 100 = 50, weight 1
      // kr-2: 100/200 * 100 = 50, weight 2
      // weighted: (50*1 + 50*2) / 3 = 50
      expect(progress).toBe(50);
    });

    it("should use latest check-in when no key results exist", async () => {
      mockDB.findOne.mockResolvedValue(makeGoal());
      mockDB.findMany
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 }) // no key results
        .mockResolvedValueOnce({ data: [{ progress: 75 }], total: 1, page: 1, limit: 1, totalPages: 1 }); // latest check-in
      mockDB.update.mockResolvedValue(makeGoal({ progress: 75 }));

      const progress = await computeGoalProgress(ORG_ID, "goal-1");

      expect(progress).toBe(75);
    });
  });
});
