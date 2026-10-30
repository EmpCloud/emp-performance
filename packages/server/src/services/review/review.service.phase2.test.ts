import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    findOne: vi.fn(),
    findMany: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    raw: vi.fn(),
  },
  findUserById: vi.fn(),
}));

vi.mock("../../db/adapters", () => ({
  getDB: () => mocks.db,
}));

vi.mock("../../db/empcloud", () => ({
  findUserById: mocks.findUserById,
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import type { ActorContext } from "../../security/actor-context";
import {
  getReview,
  listReviews,
  rateCompetency,
  saveDraft,
  submitReview,
} from "./review.service";

const ORG_ID = 1;
const SUBJECT_ID = 10;
const REVIEWER_ID = 20;

const subjectActor: ActorContext = {
  userId: SUBJECT_ID,
  employeeId: SUBJECT_ID,
  organizationId: ORG_ID,
  role: "employee",
  roles: ["employee"],
  authenticationMethod: "jwt",
};

const reviewerActor: ActorContext = {
  ...subjectActor,
  userId: REVIEWER_ID,
  employeeId: REVIEWER_ID,
};

const baseReview = {
  id: "review-1",
  organization_id: ORG_ID,
  cycle_id: "cycle-1",
  employee_id: SUBJECT_ID,
  reviewer_id: REVIEWER_ID,
  type: "manager",
  status: "draft",
  overall_rating: null,
  summary: "Manager draft",
  strengths: null,
  improvements: null,
  submitted_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const baseCycle = {
  id: "cycle-1",
  organization_id: ORG_ID,
  name: "Annual review",
  type: "annual",
  status: "active",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  review_deadline: null,
  framework_id: null,
  description: null,
  created_by: 99,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

function reviewAndCycle(
  review: Record<string, unknown> = {},
  cycle: Record<string, unknown> = {},
): void {
  mocks.db.findOne
    .mockResolvedValueOnce({ ...baseReview, ...review })
    .mockResolvedValueOnce({ ...baseCycle, ...cycle });
}

describe("review.service Phase 2 confidentiality and integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.findOne.mockReset();
    mocks.db.findMany.mockReset().mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
    mocks.db.findById.mockReset();
    mocks.db.create.mockReset();
    mocks.db.update.mockReset();
    mocks.db.delete.mockReset();
    mocks.db.count.mockReset().mockResolvedValue(0);
    mocks.db.raw.mockReset().mockResolvedValue([[]]);
    mocks.findUserById.mockReset();
  });

  describe("review visibility", () => {
    it("returns 404 for an unreleased subject before querying competency ratings", async () => {
      reviewAndCycle(
        { type: "manager", status: "draft" },
        { status: "in_review" },
      );

      await expect(getReview(ORG_ID, "review-1", subjectActor)).rejects.toMatchObject({
        statusCode: 404,
        code: "NOT_FOUND",
      });

      expect(mocks.db.findMany).not.toHaveBeenCalled();
    });

    it("returns a submitted manager review to the subject after cycle completion", async () => {
      reviewAndCycle(
        { type: "manager", status: "submitted", summary: "Released manager review" },
        { status: "completed" },
      );
      mocks.db.findMany.mockResolvedValueOnce({
        data: [{ id: "rating-1", review_id: "review-1", competency_id: "comp-1", rating: 4 }],
        total: 1,
      });

      const result = await getReview(ORG_ID, "review-1", subjectActor);

      expect(result.summary).toBe("Released manager review");
      expect(result.reviewer_id).toBe(REVIEWER_ID);
      expect(result.reviewer_anonymous).toBe(false);
      expect(result.competency_ratings).toHaveLength(1);
    });

    it("redacts the peer reviewer from a released subject response", async () => {
      reviewAndCycle(
        { type: "peer", status: "submitted" },
        { status: "completed" },
      );

      const result = await getReview(ORG_ID, "review-1", subjectActor);

      expect(result.reviewer_id).toBeNull();
      expect(result.reviewer_anonymous).toBe(true);
    });

    it("keeps the peer reviewer identity for the assigned reviewer", async () => {
      reviewAndCycle(
        { type: "peer", status: "draft" },
        { status: "active" },
      );

      const result = await getReview(ORG_ID, "review-1", reviewerActor);

      expect(result.reviewer_id).toBe(REVIEWER_ID);
      expect(result.reviewer_anonymous).toBe(false);
    });

    it("uses the release predicate for both non-admin rows and count, omits unreleased rows, and redacts peers", async () => {
      const releasedPeer = {
        ...baseReview,
        id: "released-peer",
        type: "peer",
        status: "submitted",
      };
      mocks.db.raw
        .mockResolvedValueOnce([[releasedPeer]])
        .mockResolvedValueOnce([[{ c: 1 }]]);

      const result = await listReviews(ORG_ID, { page: 1, perPage: 20 }, subjectActor);

      expect(result.total).toBe(1);
      expect(result.data).toEqual([
        expect.objectContaining({
          id: "released-peer",
          reviewer_id: null,
          reviewer_anonymous: true,
        }),
      ]);

      const rowSql = mocks.db.raw.mock.calls[0][0] as string;
      const countSql = mocks.db.raw.mock.calls[1][0] as string;
      const releasePredicate =
        "employee_id = ? AND status = 'submitted' AND EXISTS (SELECT 1 FROM review_cycles rc WHERE rc.id = reviews.cycle_id AND rc.organization_id = reviews.organization_id AND rc.status = 'completed')";
      expect(rowSql).toContain(releasePredicate);
      expect(countSql).toContain(releasePredicate);
      expect(mocks.db.raw.mock.calls[0][1].slice(0, 3)).toEqual([
        ORG_ID,
        SUBJECT_ID,
        SUBJECT_ID,
      ]);
      expect(mocks.db.raw.mock.calls[1][1]).toEqual([
        ORG_ID,
        SUBJECT_ID,
        SUBJECT_ID,
      ]);
    });

    it("does not let a subject probe an anonymous peer's reviewer id through filters", async () => {
      const result = await listReviews(
        ORG_ID,
        { employee_id: SUBJECT_ID, type: "peer", reviewer_id: REVIEWER_ID },
        subjectActor,
      );

      expect(result).toEqual({ data: [], total: 0, page: 1, perPage: 20 });
      expect(mocks.db.raw).not.toHaveBeenCalled();
      expect(mocks.db.findMany).not.toHaveBeenCalled();
    });
  });

  describe("review mutation lifecycle", () => {
    it.each([
      [
        "save draft",
        () => saveDraft(ORG_ID, "review-1", { summary: "late edit" }, reviewerActor),
      ],
      [
        "submit",
        () => submitReview(
          ORG_ID,
          "review-1",
          { overall_rating: 4, summary: "late submit" },
          reviewerActor,
        ),
      ],
      [
        "rate competency",
        () => rateCompetency(
          ORG_ID,
          "review-1",
          "competency-1",
          4,
          undefined,
          reviewerActor,
        ),
      ],
    ] as const)("denies %s after cycle completion without writing", async (_label, mutate) => {
      reviewAndCycle({ status: "draft" }, { status: "completed" });

      await expect(mutate()).rejects.toMatchObject({ statusCode: 400 });

      expect(mocks.db.update).not.toHaveBeenCalled();
      expect(mocks.db.create).not.toHaveBeenCalled();
    });
  });

  describe("competency framework integrity", () => {
    it("rejects a competency from a different framework without writing", async () => {
      reviewAndCycle({ status: "draft" }, { status: "active", framework_id: "framework-1" });
      mocks.db.findOne
        .mockResolvedValueOnce({
          id: "framework-1",
          organization_id: ORG_ID,
          is_active: true,
          deleted_at: null,
        })
        .mockResolvedValueOnce(null);

      await expect(
        rateCompetency(
          ORG_ID,
          "review-1",
          "other-framework-competency",
          4,
          undefined,
          reviewerActor,
        ),
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(mocks.db.findOne).toHaveBeenCalledWith("competencies", {
        id: "other-framework-competency",
        framework_id: "framework-1",
        deleted_at: null,
      });
      expect(mocks.db.update).not.toHaveBeenCalled();
      expect(mocks.db.create).not.toHaveBeenCalled();
    });

    it("rejects a competency behind a cross-tenant framework without writing", async () => {
      reviewAndCycle({ status: "draft" }, { status: "active", framework_id: "foreign-framework" });
      mocks.db.findOne.mockResolvedValueOnce(null);

      await expect(
        rateCompetency(
          ORG_ID,
          "review-1",
          "foreign-competency",
          4,
          undefined,
          reviewerActor,
        ),
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(mocks.db.findOne).toHaveBeenCalledWith("competency_frameworks", {
        id: "foreign-framework",
        organization_id: ORG_ID,
        is_active: true,
        deleted_at: null,
      });
      expect(mocks.db.findOne).not.toHaveBeenCalledWith(
        "competencies",
        expect.anything(),
      );
      expect(mocks.db.update).not.toHaveBeenCalled();
      expect(mocks.db.create).not.toHaveBeenCalled();
    });

    it("blocks submission when an existing rating is outside the cycle framework", async () => {
      reviewAndCycle({ status: "draft" }, { status: "active", framework_id: "framework-1" });
      mocks.db.findOne.mockResolvedValueOnce({
        id: "framework-1",
        organization_id: ORG_ID,
        is_active: true,
        deleted_at: null,
      });
      mocks.db.findMany
        .mockResolvedValueOnce({
          data: [{ id: "competency-1", name: "Leadership" }],
          total: 1,
        })
        .mockResolvedValueOnce({
          data: [{ id: "rating-rogue", review_id: "review-1", competency_id: "foreign-competency", rating: 5 }],
          total: 1,
        });

      await expect(
        submitReview(
          ORG_ID,
          "review-1",
          { overall_rating: 5, summary: "Attempted submit" },
          reviewerActor,
        ),
      ).rejects.toThrow("outside the cycle competency framework");

      expect(mocks.db.update).not.toHaveBeenCalled();
    });
  });
});
