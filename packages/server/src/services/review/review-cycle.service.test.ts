import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockFindUserById,
  mockGetFinalizedCalibrationRatings,
  mockEnqueueIntegrationEvent,
  mockCreateReviewOutcomesForRelease,
} = vi.hoisted(() => ({
  mockFindUserById: vi.fn(),
  mockGetFinalizedCalibrationRatings: vi.fn(),
  mockEnqueueIntegrationEvent: vi.fn(),
  mockCreateReviewOutcomesForRelease: vi.fn(),
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
  updateMany: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  count: vi.fn(),
  raw: vi.fn(),
  transaction: vi.fn(),
};

vi.mock("../../db/adapters", () => ({
  getDB: () => mockDB,
}));

vi.mock("../../db/empcloud", () => ({
  findUserById: mockFindUserById,
}));

vi.mock("./calibration.service", () => ({
  getFinalizedCalibrationRatings: mockGetFinalizedCalibrationRatings,
}));

vi.mock("../integration/outbox.service", () => ({
  enqueueIntegrationEvent: mockEnqueueIntegrationEvent,
}));

vi.mock("./review-outcome.service", () => ({
  createReviewOutcomesForRelease: mockCreateReviewOutcomesForRelease,
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
  buildRatingDistribution,
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
    mockDB.transaction.mockImplementation(async (fn: (trx: typeof mockDB) => Promise<unknown>) =>
      fn(mockDB),
    );
    mockFindUserById.mockImplementation(async (id: number) => ({
      id,
      organization_id: ORG_ID,
      status: 1,
      reporting_manager_id: null,
      first_name: "Test",
      last_name: "User",
    }));
    mockCreateReviewOutcomesForRelease.mockResolvedValue([
      { id: "outcome-1", employee_id: 100 },
    ]);
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
    it("should atomically release a finalized calibration", async () => {
      mockDB.findOne.mockResolvedValue(
        makeCycle({
          status: "calibration",
          calibration_finalized_at: "2026-03-31T12:00:00.000Z",
          calibration_finalized_by: USER_ID,
        }),
      );
      mockGetFinalizedCalibrationRatings.mockResolvedValue([
        {
          participant_id: "p-1",
          employee_id: 100,
          baseline_rating: 4.5,
          calibrated_rating: 4.25,
          decision_id: "decision-1",
          decision_version: 1,
        },
      ]);
      mockDB.findMany.mockResolvedValueOnce({
        data: [{ id: "p-1", cycle_id: "cycle-1", employee_id: 100 }],
      });

      mockDB.update
        .mockResolvedValueOnce({}) // participant update
        .mockResolvedValueOnce(makeCycle({ status: "completed" })); // cycle update
      mockDB.create.mockResolvedValue({});

      const result = await closeCycle(ORG_ID, "cycle-1", USER_ID);

      expect(mockDB.update).toHaveBeenCalledWith(
        "review_cycle_participants",
        "p-1",
        expect.objectContaining({ final_rating: 4.25, status: "completed" }),
      );
      expect(mockDB.transaction).toHaveBeenCalledOnce();
      expect(mockDB.create).toHaveBeenCalledWith(
        "audit_logs",
        expect.objectContaining({
          user_id: USER_ID,
          action: "review_cycle.ratings_released",
        }),
      );
      expect(mockEnqueueIntegrationEvent).toHaveBeenCalledWith(
        mockDB,
        expect.objectContaining({
          eventType: "performance.cycle_completed",
          idempotencyKey: "performance.cycle_completed:cycle-1:v1",
        }),
      );
      expect(mockCreateReviewOutcomesForRelease).toHaveBeenCalledWith(
        mockDB,
        ORG_ID,
        "cycle-1",
        [
          {
            participant_id: "p-1",
            employee_id: 100,
            released_rating: 4.25,
          },
        ],
        expect.any(Date),
      );
      expect(mockDB.createMany).toHaveBeenCalledWith(
        "notifications",
        [
          expect.objectContaining({
            user_id: 100,
            type: "review_outcome_released",
            link: "/my/performance/reviews/outcome-1",
          }),
        ],
      );
      expect(result.status).toBe("completed");
    });

    it("rejects release when the locked participant roster differs from the finalized snapshot", async () => {
      mockDB.findOne.mockResolvedValue(
        makeCycle({
          status: "calibration",
          calibration_finalized_at: "2026-03-31T12:00:00.000Z",
        }),
      );
      mockGetFinalizedCalibrationRatings.mockResolvedValue([
        {
          participant_id: "p-1",
          employee_id: 100,
          baseline_rating: 4,
          calibrated_rating: 4.25,
          decision_id: null,
          decision_version: null,
        },
      ]);
      mockDB.findMany.mockResolvedValueOnce({
        data: [{ id: "p-2", cycle_id: "cycle-1", employee_id: 200 }],
      });

      await expect(closeCycle(ORG_ID, "cycle-1", USER_ID)).rejects.toThrow(
        "participants changed after calibration finalization",
      );
      expect(mockCreateReviewOutcomesForRelease).not.toHaveBeenCalled();
      expect(mockEnqueueIntegrationEvent).not.toHaveBeenCalled();
    });

    it("returns an already released cycle for a safe retry", async () => {
      const released = makeCycle({ status: "completed" });
      mockDB.findOne.mockResolvedValue(released);

      await expect(closeCycle(ORG_ID, "cycle-1", USER_ID)).resolves.toBe(released);

      expect(mockGetFinalizedCalibrationRatings).not.toHaveBeenCalled();
      expect(mockDB.transaction).not.toHaveBeenCalled();
      expect(mockEnqueueIntegrationEvent).not.toHaveBeenCalled();
    });

    it("should reject release until calibration is finalized", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "calibration" }));
      mockGetFinalizedCalibrationRatings.mockRejectedValue(
        new Error("Calibration must be finalized before ratings are released"),
      );

      await expect(closeCycle(ORG_ID, "cycle-1", USER_ID)).rejects.toThrow(
        "Calibration must be finalized",
      );
      expect(mockDB.update).not.toHaveBeenCalled();
    });

    it("should reject closing a draft cycle", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "draft" }));

      await expect(closeCycle(ORG_ID, "cycle-1", USER_ID)).rejects.toThrow();
    });

    it("does not publish a completed cycle twice", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "completed" }));

      await expect(closeCycle(ORG_ID, "cycle-1", USER_ID)).resolves.toMatchObject({
        status: "completed",
      });
      expect(mockEnqueueIntegrationEvent).not.toHaveBeenCalled();
    });
  });

  describe("buildRatingDistribution", () => {
    it("counts one final rating per participant and returns all five buckets", () => {
      expect(buildRatingDistribution([1.4, 3.6, 3.9])).toEqual([
        { rating: 1, count: 1, percentage: 33.33 },
        { rating: 2, count: 0, percentage: 0 },
        { rating: 3, count: 0, percentage: 0 },
        { rating: 4, count: 2, percentage: 66.67 },
        { rating: 5, count: 0, percentage: 0 },
      ]);
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

      const result = await transitionCycle(ORG_ID, "cycle-1", "in_review", USER_ID);

      expect(result.status).toBe("in_review");
    });

    it("should reject backward transitions", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "in_review" }));

      await expect(transitionCycle(ORG_ID, "cycle-1", "active", USER_ID))
        .rejects.toThrow("Cannot move");
      expect(mockDB.update).not.toHaveBeenCalled();
    });

    it("blocks calibration until required reviews have valid submitted ratings", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "in_review" }));
      mockDB.findMany
        .mockResolvedValueOnce({
          data: [{ id: "p-1", employee_id: 100, manager_id: 200 }],
        })
        .mockResolvedValueOnce({
          data: [
            {
              employee_id: 100,
              reviewer_id: 100,
              type: "self",
              status: "submitted",
              overall_rating: 4,
            },
          ],
        });

      await expect(
        transitionCycle(ORG_ID, "cycle-1", "calibration", USER_ID),
      ).rejects.toThrow("required review assignment");
      expect(mockDB.update).not.toHaveBeenCalled();
    });

    it("moves a complete review set into calibration and audits the transition", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "in_review" }));
      mockDB.findMany
        .mockResolvedValueOnce({
          data: [{ id: "p-1", employee_id: 100, manager_id: 200 }],
        })
        .mockResolvedValueOnce({
          data: [
            {
              employee_id: 100,
              reviewer_id: 100,
              type: "self",
              status: "submitted",
              overall_rating: 4,
            },
            {
              employee_id: 100,
              reviewer_id: 200,
              type: "manager",
              status: "submitted",
              overall_rating: 4.5,
            },
          ],
        });
      mockDB.update.mockResolvedValue(makeCycle({ status: "calibration" }));

      await expect(
        transitionCycle(ORG_ID, "cycle-1", "calibration", USER_ID),
      ).resolves.toMatchObject({ status: "calibration" });
      expect(mockDB.create).toHaveBeenCalledWith(
        "audit_logs",
        expect.objectContaining({ action: "review_cycle.status_transitioned" }),
      );
    });

    it("blocks calibration while an assigned peer review is incomplete", async () => {
      mockDB.findOne.mockResolvedValue(makeCycle({ status: "in_review" }));
      mockDB.findMany
        .mockResolvedValueOnce({
          data: [{ id: "p-1", employee_id: 100, manager_id: 200 }],
        })
        .mockResolvedValueOnce({
          data: [
            {
              id: "self-1",
              employee_id: 100,
              reviewer_id: 100,
              type: "self",
              status: "submitted",
              overall_rating: 4,
            },
            {
              id: "manager-1",
              employee_id: 100,
              reviewer_id: 200,
              type: "manager",
              status: "submitted",
              overall_rating: 4.5,
            },
            {
              id: "peer-1",
              employee_id: 100,
              reviewer_id: 300,
              type: "peer",
              status: "draft",
              overall_rating: 4,
            },
          ],
        });

      await expect(
        transitionCycle(ORG_ID, "cycle-1", "calibration", USER_ID),
      ).rejects.toThrow("required review assignment");
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
