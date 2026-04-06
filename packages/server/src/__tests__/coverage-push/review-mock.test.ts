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
  createCycle,
  listCycles,
  getCycle,
  updateCycle,
  launchCycle,
  closeCycle,
  addParticipants,
  listParticipants,
  removeParticipant,
  getRatingsDistribution,
} from "../../services/review/review-cycle.service";

import {
  createReview,
  getReview,
  listReviews,
  saveDraft,
  submitReview,
  rateCompetency,
  getReviewsForParticipant,
} from "../../services/review/review.service";

const ORG = 1;

describe("review-cycle.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockDB.count.mockResolvedValue(0);
  });

  // =========================================================================
  // createCycle
  // =========================================================================
  describe("createCycle", () => {
    it("should create a review cycle with all fields", async () => {
      const expected = { id: "cycle-1", name: "Q1 2026", status: "draft" };
      mockDB.create.mockResolvedValue(expected);

      const result = await createCycle(ORG, {
        name: "Q1 2026",
        type: "quarterly",
        start_date: "2026-01-01",
        end_date: "2026-03-31",
        review_deadline: "2026-04-15",
        framework_id: "fw-1",
        description: "Q1 review",
      }, 10);

      expect(mockDB.create).toHaveBeenCalledWith("review_cycles", expect.objectContaining({
        organization_id: ORG,
        name: "Q1 2026",
        status: "draft",
      }));
      expect(result).toEqual(expected);
    });

    it("should create cycle with defaults for optional fields", async () => {
      mockDB.create.mockResolvedValue({ id: "c-1" });
      await createCycle(ORG, { name: "Test", type: "annual", start_date: "2026-01-01", end_date: "2026-12-31" }, 10);
      expect(mockDB.create).toHaveBeenCalledWith("review_cycles", expect.objectContaining({
        review_deadline: null,
        framework_id: null,
        description: null,
      }));
    });
  });

  // =========================================================================
  // listCycles
  // =========================================================================
  describe("listCycles", () => {
    it("should list cycles with pagination and filters", async () => {
      mockDB.findMany.mockResolvedValue({ data: [{ id: "c-1" }], total: 1, page: 1, limit: 10, totalPages: 1 });
      mockDB.count.mockResolvedValue(5);

      const result = await listCycles(ORG, { page: 1, perPage: 10, status: "active", type: "quarterly" });
      expect(result.data.length).toBe(1);
      expect(result.data[0]).toHaveProperty("participant_count");
    });

    it("should use defaults and custom sort", async () => {
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      await listCycles(ORG, { sort: "name", order: "asc" });
      expect(mockDB.findMany).toHaveBeenCalledWith("review_cycles", expect.objectContaining({
        sort: { field: "name", order: "asc" },
      }));
    });
  });

  // =========================================================================
  // getCycle
  // =========================================================================
  describe("getCycle", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getCycle(ORG, "x")).rejects.toThrow("ReviewCycle");
    });

    it("should return cycle with participant count and stats", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", name: "Q1" });
      mockDB.count
        .mockResolvedValueOnce(10) // participants
        .mockResolvedValueOnce(3)  // pending
        .mockResolvedValueOnce(2)  // draft
        .mockResolvedValueOnce(5); // submitted

      const result = await getCycle(ORG, "c-1");
      expect(result.participant_count).toBe(10);
      expect(result.stats.pending).toBe(3);
      expect(result.stats.draft).toBe(2);
      expect(result.stats.submitted).toBe(5);
    });
  });

  // =========================================================================
  // updateCycle
  // =========================================================================
  describe("updateCycle", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(updateCycle(ORG, "x", { name: "New" })).rejects.toThrow("ReviewCycle");
    });

    it("should throw if cycle is completed", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", status: "completed" });
      await expect(updateCycle(ORG, "c-1", { name: "New" })).rejects.toThrow("completed or cancelled");
    });

    it("should throw if cycle is cancelled", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", status: "cancelled" });
      await expect(updateCycle(ORG, "c-1", { name: "New" })).rejects.toThrow("completed or cancelled");
    });

    it("should update a draft cycle", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", status: "draft" });
      mockDB.update.mockResolvedValue({ id: "c-1", name: "Updated" });
      const result = await updateCycle(ORG, "c-1", { name: "Updated" });
      expect(result.name).toBe("Updated");
    });
  });

  // =========================================================================
  // launchCycle
  // =========================================================================
  describe("launchCycle", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(launchCycle(ORG, "x")).rejects.toThrow("ReviewCycle");
    });

    it("should throw if cycle is not draft", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", status: "active" });
      await expect(launchCycle(ORG, "c-1")).rejects.toThrow("Only draft cycles");
    });

    it("should throw if cycle has no participants", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", status: "draft" });
      mockDB.count.mockResolvedValue(0);
      await expect(launchCycle(ORG, "c-1")).rejects.toThrow("no participants");
    });

    it("should launch a draft cycle with participants", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", status: "draft" });
      mockDB.count.mockResolvedValue(5);
      mockDB.update.mockResolvedValue({ id: "c-1", status: "active" });
      const result = await launchCycle(ORG, "c-1");
      expect(result.status).toBe("active");
    });
  });

  // =========================================================================
  // closeCycle
  // =========================================================================
  describe("closeCycle", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(closeCycle(ORG, "x")).rejects.toThrow("ReviewCycle");
    });

    it("should throw if cycle is draft", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", status: "draft" });
      await expect(closeCycle(ORG, "c-1")).rejects.toThrow();
    });

    it("should close an active cycle with participants and reviews", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", status: "active", name: "Q1" });
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ id: "p-1", employee_id: 100 }], total: 1, page: 1, limit: 20, totalPages: 1 })
        .mockResolvedValueOnce({ data: [{ id: "rev-1", overall_rating: 4, status: "submitted" }], total: 1, page: 1, limit: 20, totalPages: 1 });
      mockDB.update.mockResolvedValue({ id: "c-1", status: "completed" });

      const result = await closeCycle(ORG, "c-1");
      expect(result.status).toBe("completed");
    });

    it("should close an in_review cycle", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", status: "in_review", name: "Test" });
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      mockDB.update.mockResolvedValue({ id: "c-1", status: "completed" });
      const result = await closeCycle(ORG, "c-1");
      expect(result.status).toBe("completed");
    });

    it("should close a calibration cycle", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", status: "calibration", name: "Test" });
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
      mockDB.update.mockResolvedValue({ id: "c-1", status: "completed" });
      const result = await closeCycle(ORG, "c-1");
      expect(result.status).toBe("completed");
    });
  });

  // =========================================================================
  // Participants
  // =========================================================================
  describe("addParticipants", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(addParticipants(ORG, "x", [{ employee_id: 10 }])).rejects.toThrow("ReviewCycle");
    });

    it("should throw if cycle is completed", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", status: "completed" });
      await expect(addParticipants(ORG, "c-1", [{ employee_id: 10 }])).rejects.toThrow();
    });

    it("should add participants to draft cycle, skip duplicates", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "c-1", status: "draft" }) // cycle
        .mockResolvedValueOnce(null) // no existing for emp 10
        .mockResolvedValueOnce({ id: "p-existing" }); // existing for emp 20
      mockDB.create.mockResolvedValue({ id: "p-new", employee_id: 10 });

      const result = await addParticipants(ORG, "c-1", [
        { employee_id: 10, manager_id: 5 },
        { employee_id: 20 },
      ]);
      expect(result).toHaveLength(1);
      expect(mockDB.create).toHaveBeenCalledTimes(1);
    });
  });

  describe("listParticipants", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(listParticipants(ORG, "x")).rejects.toThrow("ReviewCycle");
    });

    it("should return participants", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1" });
      mockDB.findMany.mockResolvedValue({ data: [{ id: "p-1" }], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await listParticipants(ORG, "c-1");
      expect(result).toHaveLength(1);
    });
  });

  describe("removeParticipant", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(removeParticipant(ORG, "x", "p-1")).rejects.toThrow("ReviewCycle");
    });

    it("should throw if cycle is not draft", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1", status: "active" });
      await expect(removeParticipant(ORG, "c-1", "p-1")).rejects.toThrow("draft");
    });

    it("should throw if participant not found", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "c-1", status: "draft" })
        .mockResolvedValueOnce(null);
      await expect(removeParticipant(ORG, "c-1", "p-1")).rejects.toThrow("Participant");
    });

    it("should remove participant from draft cycle", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "c-1", status: "draft" })
        .mockResolvedValueOnce({ id: "p-1", cycle_id: "c-1" });
      mockDB.delete.mockResolvedValue(true);
      await removeParticipant(ORG, "c-1", "p-1");
      expect(mockDB.delete).toHaveBeenCalledWith("review_cycle_participants", "p-1");
    });
  });

  // =========================================================================
  // Ratings Distribution
  // =========================================================================
  describe("getRatingsDistribution", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getRatingsDistribution(ORG, "x")).rejects.toThrow("ReviewCycle");
    });

    it("should compute distribution from submitted reviews", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1" });
      mockDB.findMany.mockResolvedValue({
        data: [
          { overall_rating: 4.6, status: "submitted" },
          { overall_rating: 3.2, status: "submitted" },
          { overall_rating: 2.1, status: "submitted" },
          { overall_rating: null, status: "submitted" },
        ],
        total: 4, page: 1, limit: 10000, totalPages: 1,
      });

      const result = await getRatingsDistribution(ORG, "c-1");
      expect(result).toHaveLength(5);
      expect(result.find((r: any) => r.rating === 5)?.count).toBe(1); // 4.6 rounds to 5
      expect(result.find((r: any) => r.rating === 3)?.count).toBe(1);
      expect(result.find((r: any) => r.rating === 2)?.count).toBe(1);
    });
  });
});

// ===========================================================================
// review.service
// ===========================================================================
describe("review.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  describe("createReview", () => {
    it("should throw if cycle not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(createReview(ORG, { cycle_id: "x", employee_id: 10, reviewer_id: 20, type: "manager" })).rejects.toThrow("ReviewCycle");
    });

    it("should create a review", async () => {
      mockDB.findOne.mockResolvedValue({ id: "c-1" });
      mockDB.create.mockResolvedValue({ id: "rev-1", status: "pending" });
      const result = await createReview(ORG, { cycle_id: "c-1", employee_id: 10, reviewer_id: 20, type: "manager" });
      expect(result.status).toBe("pending");
    });
  });

  describe("getReview", () => {
    it("should throw if review not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(getReview(ORG, "x")).rejects.toThrow("Review");
    });

    it("should return review with competency ratings", async () => {
      mockDB.findOne.mockResolvedValue({ id: "rev-1" });
      mockDB.findMany.mockResolvedValue({ data: [{ id: "r-1", rating: 4 }], total: 1, page: 1, limit: 20, totalPages: 1 });
      const result = await getReview(ORG, "rev-1");
      expect(result.competency_ratings).toHaveLength(1);
    });
  });

  describe("listReviews", () => {
    it("should list reviews with all filters", async () => {
      mockDB.findMany.mockResolvedValue({ data: [{ id: "rev-1" }], total: 1, page: 1, limit: 10, totalPages: 1 });
      const result = await listReviews(ORG, {
        page: 1, perPage: 10, cycle_id: "c-1", reviewer_id: 20, employee_id: 10, type: "self", status: "submitted",
      });
      expect(result.data).toHaveLength(1);
    });
  });

  describe("saveDraft", () => {
    it("should throw if review not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(saveDraft(ORG, "x", {})).rejects.toThrow("Review");
    });

    it("should throw if review is submitted", async () => {
      mockDB.findOne.mockResolvedValue({ id: "rev-1", status: "submitted" });
      await expect(saveDraft(ORG, "rev-1", {})).rejects.toThrow("submitted");
    });

    it("should save draft with all fields", async () => {
      mockDB.findOne.mockResolvedValue({ id: "rev-1", status: "pending" });
      mockDB.update.mockResolvedValue({ id: "rev-1", status: "draft" });
      const result = await saveDraft(ORG, "rev-1", {
        overall_rating: 4, summary: "Good", strengths: "Strong", improvements: "Improve",
      });
      expect(result.status).toBe("draft");
    });
  });

  describe("submitReview", () => {
    it("should throw if review not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(submitReview(ORG, "x", { overall_rating: 4, summary: "Good" })).rejects.toThrow("Review");
    });

    it("should throw if already submitted", async () => {
      mockDB.findOne.mockResolvedValue({ id: "rev-1", status: "submitted" });
      await expect(submitReview(ORG, "rev-1", { overall_rating: 4, summary: "Good" })).rejects.toThrow("already been submitted");
    });

    it("should submit review without framework", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "rev-1", status: "draft", cycle_id: "c-1" }) // review
        .mockResolvedValueOnce({ id: "c-1", framework_id: null }); // cycle
      mockDB.update.mockResolvedValue({ id: "rev-1", status: "submitted" });

      const result = await submitReview(ORG, "rev-1", { overall_rating: 4, summary: "Good", strengths: "Yes", improvements: "No" });
      expect(result.status).toBe("submitted");
    });

    it("should throw if competencies are unrated when framework exists", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "rev-1", status: "draft", cycle_id: "c-1" })
        .mockResolvedValueOnce({ id: "c-1", framework_id: "fw-1" });
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ id: "comp-1", name: "Leadership" }, { id: "comp-2", name: "Technical" }], total: 2, page: 1, limit: 20, totalPages: 1 })
        .mockResolvedValueOnce({ data: [{ id: "r-1", competency_id: "comp-1" }], total: 1, page: 1, limit: 20, totalPages: 1 });

      await expect(submitReview(ORG, "rev-1", { overall_rating: 4, summary: "Good" })).rejects.toThrow("Technical");
    });

    it("should submit when all competencies rated", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "rev-1", status: "draft", cycle_id: "c-1" })
        .mockResolvedValueOnce({ id: "c-1", framework_id: "fw-1" });
      mockDB.findMany
        .mockResolvedValueOnce({ data: [{ id: "comp-1", name: "Leadership" }], total: 1, page: 1, limit: 20, totalPages: 1 })
        .mockResolvedValueOnce({ data: [{ id: "r-1", competency_id: "comp-1" }], total: 1, page: 1, limit: 20, totalPages: 1 });
      mockDB.update.mockResolvedValue({ id: "rev-1", status: "submitted" });

      const result = await submitReview(ORG, "rev-1", { overall_rating: 4, summary: "Good" });
      expect(result.status).toBe("submitted");
    });

    it("should handle update error during submit", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "rev-1", status: "draft", cycle_id: "c-1" })
        .mockResolvedValueOnce({ id: "c-1", framework_id: null });
      mockDB.update.mockRejectedValue(new Error("DB error"));

      await expect(submitReview(ORG, "rev-1", { overall_rating: 4, summary: "Good" })).rejects.toThrow("DB error");
    });
  });

  describe("rateCompetency", () => {
    it("should throw if review not found", async () => {
      mockDB.findOne.mockResolvedValue(null);
      await expect(rateCompetency(ORG, "x", "comp-1", 4)).rejects.toThrow("Review");
    });

    it("should throw if review is submitted", async () => {
      mockDB.findOne.mockResolvedValue({ id: "rev-1", status: "submitted" });
      await expect(rateCompetency(ORG, "rev-1", "comp-1", 4)).rejects.toThrow("submitted");
    });

    it("should update existing rating", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "rev-1", status: "draft" }) // review
        .mockResolvedValueOnce({ id: "rating-1", review_id: "rev-1", competency_id: "comp-1" }); // existing
      mockDB.update.mockResolvedValue({ id: "rating-1", rating: 5 });

      const result = await rateCompetency(ORG, "rev-1", "comp-1", 5, "Excellent");
      expect(result.rating).toBe(5);
    });

    it("should create new rating and change pending to draft", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "rev-1", status: "pending" }) // review
        .mockResolvedValueOnce(null); // no existing
      mockDB.create.mockResolvedValue({ id: "rating-new", rating: 4 });
      mockDB.update.mockResolvedValue({ id: "rev-1", status: "draft" });

      const result = await rateCompetency(ORG, "rev-1", "comp-1", 4);
      expect(mockDB.update).toHaveBeenCalledWith("reviews", "rev-1", { status: "draft" });
      expect(result.rating).toBe(4);
    });

    it("should create new rating without changing draft status", async () => {
      mockDB.findOne
        .mockResolvedValueOnce({ id: "rev-1", status: "draft" })
        .mockResolvedValueOnce(null);
      mockDB.create.mockResolvedValue({ id: "rating-new", rating: 3 });

      await rateCompetency(ORG, "rev-1", "comp-1", 3);
      // Should NOT call update to change status (already draft)
      expect(mockDB.update).not.toHaveBeenCalledWith("reviews", expect.anything(), expect.objectContaining({ status: "draft" }));
    });
  });

  describe("getReviewsForParticipant", () => {
    it("should return reviews for participant", async () => {
      mockDB.findMany.mockResolvedValue({ data: [{ id: "rev-1" }], total: 1, page: 1, limit: 100, totalPages: 1 });
      const result = await getReviewsForParticipant(ORG, "c-1", 10);
      expect(result).toHaveLength(1);
    });
  });
});
