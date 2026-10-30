import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFindUserById } = vi.hoisted(() => ({
  mockFindUserById: vi.fn(),
}));

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

vi.mock("../../db/empcloud", () => ({
  findUserById: mockFindUserById,
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
  transitionCycle,
  reopenCycle,
  removeParticipant,
  updateCycle,
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
    mockFindUserById.mockImplementation(async (id: number) => ({
      id,
      organization_id: ORG_ID,
      status: 1,
      reporting_manager_id: null,
      first_name: "Test",
      last_name: "User",
    }));
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
      mockDB.findOne.mockResolvedValue({
        id: "fw-1",
        organization_id: ORG_ID,
        is_active: true,
        deleted_at: null,
      });
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

    it("should reject a framework that is inactive, deleted, or from another organization", async () => {
      mockDB.findOne.mockResolvedValue(null);

      await expect(createCycle(ORG_ID, {
        name: "Mid-year",
        type: "mid_year",
        start_date: "2026-06-01",
        end_date: "2026-06-30",
        framework_id: "fw-foreign",
      }, USER_ID)).rejects.toThrow("active and belong");

      expect(mockDB.create).not.toHaveBeenCalled();
    });
  });

  describe("updateCycle", () => {
    it("should validate a replacement framework and allow it on an empty draft cycle", async () => {
      mockDB.findOne
        .mockResolvedValueOnce(makeCycle({ framework_id: null }))
        .mockResolvedValueOnce({ id: "fw-2", organization_id: ORG_ID, is_active: true, deleted_at: null });
      mockDB.count.mockResolvedValue(0);
      mockDB.update.mockResolvedValue(makeCycle({ framework_id: "fw-2" }));

      const result = await updateCycle(ORG_ID, "cycle-1", { framework_id: "fw-2" });

      expect(result.framework_id).toBe("fw-2");
    });

    it("should reject framework changes after reviews exist", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ framework_id: "fw-1" }));
      mockDB.count.mockResolvedValue(1);

      await expect(updateCycle(ORG_ID, "cycle-1", { framework_id: "fw-2" }))
        .rejects.toThrow("after reviews");
      expect(mockDB.update).not.toHaveBeenCalled();
    });

    it("should reject direct status changes", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle());

      await expect(updateCycle(ORG_ID, "cycle-1", { status: "active" }))
        .rejects.toThrow("lifecycle action");
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
      mockDB.findMany
        .mockResolvedValueOnce({
          data: [{ id: "p-1", cycle_id: "cycle-1", employee_id: 100, manager_id: null }],
        })
        .mockResolvedValueOnce({ data: [] });
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
      mockDB.findMany.mockResolvedValue({ data: [] });

      await expect(launchCycle(ORG_ID, "cycle-1")).rejects.toThrow("no participants");
    });

    it("should validate the framework again before launch", async () => {
      mockDB.findOne
        .mockResolvedValueOnce(makeCycle({ status: "draft", framework_id: "fw-1" }))
        .mockResolvedValueOnce(null);

      await expect(launchCycle(ORG_ID, "cycle-1")).rejects.toThrow("active and belong");
      expect(mockDB.update).not.toHaveBeenCalled();
    });

    it("should reject a stale participant manager relationship", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "draft" }));
      mockDB.findMany.mockResolvedValue({
        data: [{ id: "p-1", cycle_id: "cycle-1", employee_id: 100, manager_id: 300 }],
      });
      mockFindUserById.mockResolvedValueOnce({
        id: 100,
        organization_id: ORG_ID,
        status: 1,
        reporting_manager_id: 200,
      });

      await expect(launchCycle(ORG_ID, "cycle-1")).rejects.toThrow("reporting manager");
      expect(mockDB.update).not.toHaveBeenCalled();
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
          data: [{ id: "p-1", employee_id: 100, manager_id: 200, cycle_id: "cycle-1" }],
          total: 1,
          page: 1,
          limit: 1000,
          totalPages: 1,
        }) // participants
        .mockResolvedValueOnce({
          data: [
            { employee_id: 100, reviewer_id: 100, type: "self", overall_rating: 4, status: "submitted" },
            { employee_id: 100, reviewer_id: 200, type: "manager", overall_rating: 5, status: "submitted" },
          ],
          total: 2,
          page: 1,
          limit: 1000,
          totalPages: 1,
        }) // all cycle reviews
        .mockResolvedValueOnce({ data: [] }) // submitted reviews for distribution
        .mockResolvedValueOnce({ data: [] }); // prior distribution rows

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

    it("should reject close while a required manager review is incomplete", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "active" }));
      mockDB.findMany
        .mockResolvedValueOnce({
          data: [{ id: "p-1", employee_id: 100, manager_id: 200, cycle_id: "cycle-1" }],
        })
        .mockResolvedValueOnce({
          data: [
            { employee_id: 100, reviewer_id: 100, type: "self", status: "submitted" },
            { employee_id: 100, reviewer_id: 200, type: "manager", status: "draft" },
          ],
        });

      await expect(closeCycle(ORG_ID, "cycle-1")).rejects.toThrow("required review");
      expect(mockDB.update).not.toHaveBeenCalled();
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

    it("should derive and validate the employee's reporting manager", async () => {
      mockDB.findOne
        .mockResolvedValueOnce(makeCycle({ status: "draft" }))
        .mockResolvedValueOnce(null);
      mockFindUserById
        .mockResolvedValueOnce({ id: 100, organization_id: ORG_ID, status: 1, reporting_manager_id: 200 })
        .mockResolvedValueOnce({ id: 200, organization_id: ORG_ID, status: 1, reporting_manager_id: null });
      mockDB.create.mockImplementation(async (_table: string, data: any) => data);

      const result = await addParticipants(ORG_ID, "cycle-1", [{ employee_id: 100 }]);

      expect(result[0].manager_id).toBe(200);
      expect(mockDB.create).toHaveBeenCalledWith(
        "review_cycle_participants",
        expect.objectContaining({ employee_id: 100, manager_id: 200 }),
      );
    });

    it("should reject a manager that does not match the reporting relationship", async () => {
      mockDB.findOne
        .mockResolvedValueOnce(makeCycle({ status: "draft" }))
        .mockResolvedValueOnce(null);
      mockFindUserById.mockResolvedValueOnce({
        id: 100,
        organization_id: ORG_ID,
        status: 1,
        reporting_manager_id: 200,
      });

      await expect(addParticipants(ORG_ID, "cycle-1", [
        { employee_id: 100, manager_id: 300 },
      ])).rejects.toThrow("reporting manager");
      expect(mockDB.create).not.toHaveBeenCalled();
    });

    it("should reject inactive or cross-organization participants", async () => {
      mockDB.findOne
        .mockResolvedValueOnce(makeCycle({ status: "draft" }))
        .mockResolvedValueOnce(null);
      mockFindUserById.mockResolvedValueOnce({
        id: 100,
        organization_id: 999,
        status: 1,
        reporting_manager_id: null,
      });

      await expect(addParticipants(ORG_ID, "cycle-1", [{ employee_id: 100 }]))
        .rejects.toThrow("active user in this organization");
    });

    it("should skip duplicate participants", async () => {
      mockDB.findOne
        .mockResolvedValueOnce(makeCycle({ status: "draft" })) // cycle
        .mockResolvedValueOnce({ id: "existing-p" }); // already exists

      const result = await addParticipants(ORG_ID, "cycle-1", [{ employee_id: 100 }]);

      expect(result).toHaveLength(0);
      expect(mockDB.create).not.toHaveBeenCalled();
    });

    it("should repair missing review assignments when retrying an active-cycle participant", async () => {
      const participant = {
        id: "existing-p",
        cycle_id: "cycle-1",
        employee_id: 100,
        manager_id: null,
        status: "pending",
      };
      mockDB.findOne
        .mockResolvedValueOnce(makeCycle({ status: "active" }))
        .mockResolvedValueOnce(participant)
        .mockResolvedValueOnce(null); // missing canonical self review
      mockDB.findMany
        .mockResolvedValueOnce({ data: [participant] })
        .mockResolvedValueOnce({ data: [] });
      mockDB.create.mockImplementation(async (_table: string, data: any) => data);

      const result = await addParticipants(ORG_ID, "cycle-1", [{ employee_id: 100 }]);

      expect(result).toHaveLength(0);
      expect(mockDB.create).toHaveBeenCalledWith(
        "reviews",
        expect.objectContaining({
          cycle_id: "cycle-1",
          employee_id: 100,
          reviewer_id: 100,
          type: "self",
        }),
      );
    });

    it("should treat a concurrent participant insert as an idempotent outcome", async () => {
      mockDB.findOne
        .mockResolvedValueOnce(makeCycle({ status: "draft" }))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "concurrent-p" });
      mockDB.create.mockRejectedValueOnce(new Error("duplicate key"));

      await expect(addParticipants(ORG_ID, "cycle-1", [{ employee_id: 100 }]))
        .resolves.toEqual([]);
    });
  });

  describe("transitionCycle", () => {
    it("should allow only the forward active to in-review transition", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "active" }));
      mockDB.update.mockResolvedValue(makeCycle({ status: "in_review" }));

      const result = await transitionCycle(ORG_ID, "cycle-1", "in_review");

      expect(result.status).toBe("in_review");
    });

    it("should reject backward transitions", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "in_review" }));

      await expect(transitionCycle(ORG_ID, "cycle-1", "active"))
        .rejects.toThrow("Cannot move");
      expect(mockDB.update).not.toHaveBeenCalled();
    });
  });

  describe("reopenCycle", () => {
    it("should keep completed cycles immutable after feedback is released", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "completed" }));

      await expect(reopenCycle(ORG_ID, "cycle-1"))
        .rejects.toThrow("Completed review cycles are final");
      expect(mockDB.update).not.toHaveBeenCalled();
    });
  });

  describe("removeParticipant", () => {
    it("should remove an unassigned participant from a draft cycle", async () => {
      mockDB.findOne
        .mockResolvedValueOnce(makeCycle({ status: "draft" }))
        .mockResolvedValueOnce({
          id: "participant-1",
          cycle_id: "cycle-1",
          employee_id: 100,
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await removeParticipant(ORG_ID, "cycle-1", "participant-1");

      expect(mockDB.delete).toHaveBeenCalledWith("review_cycle_participants", "participant-1");
    });

    it("should preserve a participant that has review workflow dependencies", async () => {
      mockDB.findOne
        .mockResolvedValueOnce(makeCycle({ status: "draft" }))
        .mockResolvedValueOnce({
          id: "participant-1",
          cycle_id: "cycle-1",
          employee_id: 100,
        })
        .mockResolvedValueOnce({ id: "review-1" })
        .mockResolvedValueOnce(null);

      await expect(removeParticipant(ORG_ID, "cycle-1", "participant-1"))
        .rejects.toThrow("review assignments or peer nominations");
      expect(mockDB.delete).not.toHaveBeenCalled();
    });
  });
});
