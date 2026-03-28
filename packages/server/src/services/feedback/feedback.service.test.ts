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
  giveFeedback,
  listReceived,
  listGiven,
  getPublicWall,
  deleteFeedback,
} from "./feedback.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORG_ID = 1;
const FROM_USER = 10;
const TO_USER = 20;

function makeFeedback(overrides: Record<string, any> = {}) {
  return {
    id: "fb-1",
    organization_id: ORG_ID,
    from_user_id: FROM_USER,
    to_user_id: TO_USER,
    type: "kudos",
    visibility: "manager_visible",
    message: "Great work on the project!",
    tags: null,
    is_anonymous: false,
    created_at: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("feedback.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // giveFeedback
  // -------------------------------------------------------------------------
  describe("giveFeedback", () => {
    it("should create feedback with default visibility", async () => {
      const expected = makeFeedback();
      mockDB.create.mockResolvedValue(expected);

      const result = await giveFeedback(ORG_ID, FROM_USER, {
        to_user_id: TO_USER,
        type: "kudos",
        message: "Great work on the project!",
      });

      expect(mockDB.create).toHaveBeenCalledWith(
        "continuous_feedback",
        expect.objectContaining({
          organization_id: ORG_ID,
          from_user_id: FROM_USER,
          to_user_id: TO_USER,
          type: "kudos",
          visibility: "manager_visible",
          is_anonymous: false,
        }),
      );
      expect(result).toEqual(expected);
    });

    it("should allow setting custom visibility", async () => {
      mockDB.create.mockResolvedValue(makeFeedback({ visibility: "public" }));

      await giveFeedback(ORG_ID, FROM_USER, {
        to_user_id: TO_USER,
        type: "kudos",
        message: "Excellent job",
        visibility: "public",
      });

      expect(mockDB.create).toHaveBeenCalledWith(
        "continuous_feedback",
        expect.objectContaining({ visibility: "public" }),
      );
    });

    it("should support anonymous feedback", async () => {
      mockDB.create.mockResolvedValue(makeFeedback({ is_anonymous: true }));

      await giveFeedback(ORG_ID, FROM_USER, {
        to_user_id: TO_USER,
        type: "constructive",
        message: "Consider improving communication",
        is_anonymous: true,
      });

      expect(mockDB.create).toHaveBeenCalledWith(
        "continuous_feedback",
        expect.objectContaining({ is_anonymous: true }),
      );
    });

    it("should store tags as JSON string", async () => {
      mockDB.create.mockResolvedValue(makeFeedback({ tags: '["leadership","teamwork"]' }));

      await giveFeedback(ORG_ID, FROM_USER, {
        to_user_id: TO_USER,
        type: "kudos",
        message: "Great leader",
        tags: ["leadership", "teamwork"],
      });

      expect(mockDB.create).toHaveBeenCalledWith(
        "continuous_feedback",
        expect.objectContaining({
          tags: JSON.stringify(["leadership", "teamwork"]),
        }),
      );
    });

    it("should create constructive feedback type", async () => {
      mockDB.create.mockResolvedValue(makeFeedback({ type: "constructive" }));

      const result = await giveFeedback(ORG_ID, FROM_USER, {
        to_user_id: TO_USER,
        type: "constructive",
        message: "Could improve time management",
      });

      expect(result.type).toBe("constructive");
    });
  });

  // -------------------------------------------------------------------------
  // listReceived
  // -------------------------------------------------------------------------
  describe("listReceived", () => {
    it("should list feedback received by a user", async () => {
      const feedbacks = [makeFeedback(), makeFeedback({ id: "fb-2" })];
      mockDB.findMany.mockResolvedValue({
        data: feedbacks,
        total: 2,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const result = await listReceived(ORG_ID, TO_USER);

      expect(mockDB.findMany).toHaveBeenCalledWith(
        "continuous_feedback",
        expect.objectContaining({
          filters: expect.objectContaining({
            organization_id: ORG_ID,
            to_user_id: TO_USER,
          }),
        }),
      );
      expect(result.data).toHaveLength(2);
    });

    it("should filter by type when provided", async () => {
      mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });

      await listReceived(ORG_ID, TO_USER, { type: "kudos" });

      expect(mockDB.findMany).toHaveBeenCalledWith(
        "continuous_feedback",
        expect.objectContaining({
          filters: expect.objectContaining({ type: "kudos" }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // listGiven
  // -------------------------------------------------------------------------
  describe("listGiven", () => {
    it("should list feedback given by a user", async () => {
      mockDB.findMany.mockResolvedValue({
        data: [makeFeedback()],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const result = await listGiven(ORG_ID, FROM_USER);

      expect(mockDB.findMany).toHaveBeenCalledWith(
        "continuous_feedback",
        expect.objectContaining({
          filters: expect.objectContaining({ from_user_id: FROM_USER }),
        }),
      );
      expect(result.data).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // deleteFeedback
  // -------------------------------------------------------------------------
  describe("deleteFeedback", () => {
    it("should delete existing feedback", async () => {
      mockDB.findOne.mockResolvedValue(makeFeedback());
      mockDB.delete.mockResolvedValue(true);

      await deleteFeedback(ORG_ID, "fb-1");

      expect(mockDB.delete).toHaveBeenCalledWith("continuous_feedback", "fb-1");
    });

    it("should throw NotFoundError for missing feedback", async () => {
      mockDB.findOne.mockResolvedValue(null);

      await expect(deleteFeedback(ORG_ID, "nonexistent")).rejects.toThrow("not found");
    });
  });

  // -------------------------------------------------------------------------
  // getPublicWall
  // -------------------------------------------------------------------------
  describe("getPublicWall", () => {
    it("should return only public feedback", async () => {
      mockDB.findMany.mockResolvedValue({
        data: [makeFeedback({ visibility: "public" })],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const result = await getPublicWall(ORG_ID);

      expect(mockDB.findMany).toHaveBeenCalledWith(
        "continuous_feedback",
        expect.objectContaining({
          filters: expect.objectContaining({ visibility: "public" }),
        }),
      );
      expect(result.data).toHaveLength(1);
    });
  });
});
