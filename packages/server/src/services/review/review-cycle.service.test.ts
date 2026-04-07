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
  createCycle,
  listCycles,
  getCycle,
  launchCycle,
  closeCycle,
  addParticipants,
} from "./review-cycle.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG_ID = 1;
const USER_ID = 10;

function makeCycle(overrides: Record<string, any> = {}) {
  return {
    id: "cycle-1",
    organization_id: ORG_ID,
    name: "Q1 2026",
    type: "annual",
    status: "draft",
    start_date: "2026-01-01",
    end_date: "2026-03-31",
    review_deadline: null,
    framework_id: null,
    description: null,
    created_by: USER_ID,
    created_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("review-cycle.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // createCycle
  // -------------------------------------------------------------------------
  describe("createCycle", () => {
    it("should create a draft cycle with correct defaults", async () => {
      const input = {
        name: "Q1 2026",
        type: "annual",
        start_date: "2026-01-01",
        end_date: "2026-03-31",
      };
      const expected = makeCycle();
      mockDB.create.mockResolvedValue(expected);

      const result = await createCycle(ORG_ID, input, USER_ID);

      expect(mockDB.create).toHaveBeenCalledWith(
        "review_cycles",
        expect.objectContaining({
          organization_id: ORG_ID,
          name: "Q1 2026",
          status: "draft",
          created_by: USER_ID,
        }),
      );
      expect(result).toEqual(expected);
    });

    it("should pass optional fields when provided", async () => {
      const input = {
        name: "Mid-year",
        type: "mid_year",
        start_date: "2026-06-01",
        end_date: "2026-06-30",
        description: "Mid-year check",
        framework_id: "fw-1",
        review_deadline: "2026-06-25",
      };
      mockDB.create.mockResolvedValue(makeCycle(input));

      await createCycle(ORG_ID, input, USER_ID);

      expect(mockDB.create).toHaveBeenCalledWith(
        "review_cycles",
        expect.objectContaining({
          description: "Mid-year check",
          framework_id: "fw-1",
          review_deadline: "2026-06-25",
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // listCycles
  // -------------------------------------------------------------------------
  describe("listCycles", () => {
    it("should return paginated cycles with participant counts", async () => {
      const cycles = [makeCycle(), makeCycle({ id: "cycle-2", name: "Q2" })];
      mockDB.findMany.mockResolvedValue({
        data: cycles,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      mockDB.count.mockResolvedValue(5);

      const result = await listCycles(ORG_ID, { page: 1 });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].participant_count).toBe(5);
      expect(result.total).toBe(2);
    });

    it("should filter by status when provided", async () => {
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      await listCycles(ORG_ID, { status: "active" });

      expect(mockDB.findMany).toHaveBeenCalledWith(
        "review_cycles",
        expect.objectContaining({
          filters: expect.objectContaining({ status: "active" }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getCycle
  // -------------------------------------------------------------------------
  describe("getCycle", () => {
    it("should return cycle with stats", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle());
      mockDB.count
        .mockResolvedValueOnce(10) // participant count
        .mockResolvedValueOnce(3)  // pending
        .mockResolvedValueOnce(2)  // draft
        .mockResolvedValueOnce(5); // submitted

      const result = await getCycle(ORG_ID, "cycle-1");

      expect(result.participant_count).toBe(10);
      expect(result.stats).toEqual({ pending: 3, submitted: 5, draft: 2 });
    });

    it("should throw NotFoundError for missing cycle", async () => {
      mockDB.findOne.mockResolvedValue(null);

      await expect(getCycle(ORG_ID, "nonexistent")).rejects.toThrow("not found");
    });
  });

  // -------------------------------------------------------------------------
  // launchCycle (publish)
  // -------------------------------------------------------------------------
  describe("launchCycle", () => {
    it("should launch a draft cycle that has participants", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "draft" }));
      mockDB.count.mockResolvedValue(5);
      mockDB.update.mockResolvedValue(makeCycle({ status: "active" }));

      const result = await launchCycle(ORG_ID, "cycle-1");

      expect(result.status).toBe("active");
      expect(mockDB.update).toHaveBeenCalledWith("review_cycles", "cycle-1", { status: "active" });
    });

    it("should throw if cycle is not in draft status", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "active" }));

      await expect(launchCycle(ORG_ID, "cycle-1")).rejects.toThrow("draft");
    });

    it("should throw if cycle has no participants", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "draft" }));
      mockDB.count.mockResolvedValue(0);

      await expect(launchCycle(ORG_ID, "cycle-1")).rejects.toThrow("no participants");
    });
  });

  // -------------------------------------------------------------------------
  // closeCycle
  // -------------------------------------------------------------------------
  describe("closeCycle", () => {
    it("should close an active cycle and compute final ratings", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "active" }));
      mockDB.findMany
        .mockResolvedValueOnce({
          data: [{ id: "p-1", employee_id: 100, cycle_id: "cycle-1" }],
          total: 1,
          page: 1,
          limit: 1000,
          totalPages: 1,
        }) // participants
        .mockResolvedValueOnce({
          data: [{ overall_rating: 4, status: "submitted" }],
          total: 1,
          page: 1,
          limit: 1000,
          totalPages: 1,
        }); // reviews for participant

      mockDB.update
        .mockResolvedValueOnce({}) // participant update
        .mockResolvedValueOnce(makeCycle({ status: "completed" })); // cycle update

      const result = await closeCycle(ORG_ID, "cycle-1");

      expect(mockDB.update).toHaveBeenCalledWith(
        "review_cycle_participants",
        "p-1",
        expect.objectContaining({ status: "completed" }),
      );
      expect(result.status).toBe("completed");
    });

    it("should reject closing a draft cycle", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "draft" }));

      await expect(closeCycle(ORG_ID, "cycle-1")).rejects.toThrow();
    });

    it("should reject closing a completed cycle", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "completed" }));

      await expect(closeCycle(ORG_ID, "cycle-1")).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // addParticipants
  // -------------------------------------------------------------------------
  describe("addParticipants", () => {
    it("should add participants to a draft cycle", async () => {
      mockDB.findOne
        .mockResolvedValueOnce(makeCycle({ status: "draft" })) // cycle
        .mockResolvedValueOnce(null); // no existing participant
      mockDB.create.mockResolvedValue({
        id: "p-1",
        cycle_id: "cycle-1",
        employee_id: 100,
        manager_id: null,
        status: "pending",
      });

      const result = await addParticipants(ORG_ID, "cycle-1", [{ employee_id: 100 }]);

      expect(result).toHaveLength(1);
      expect(result[0].employee_id).toBe(100);
    });

    it("should skip duplicate participants", async () => {
      mockDB.findOne
        .mockResolvedValueOnce(makeCycle({ status: "draft" })) // cycle
        .mockResolvedValueOnce({ id: "existing-p" }); // already exists

      const result = await addParticipants(ORG_ID, "cycle-1", [{ employee_id: 100 }]);

      expect(result).toHaveLength(0);
      expect(mockDB.create).not.toHaveBeenCalled();
    });
  });
});
