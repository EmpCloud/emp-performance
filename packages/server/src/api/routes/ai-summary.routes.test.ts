import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getReview: vi.fn(),
  getCycle: vi.fn(),
  generateReviewSummary: vi.fn(),
  generateEmployeeSummary: vi.fn(),
  generateTeamSummary: vi.fn(),
}));

vi.mock("../../services/review/review.service", () => ({
  getReview: mocks.getReview,
}));

vi.mock("../../services/review/review-cycle.service", () => ({
  getCycle: mocks.getCycle,
}));

vi.mock("../../services/ai-summary/ai-summary.service", () => ({
  generateReviewSummary: mocks.generateReviewSummary,
  generateEmployeeSummary: mocks.generateEmployeeSummary,
  generateTeamSummary: mocks.generateTeamSummary,
}));

vi.mock("../middleware/auth.middleware", () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
  authorize: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { ForbiddenError } from "../../utils/errors";
import { getEmployeeSummary, getReviewSummary } from "./ai-summary.routes";

const ORG_ID = 7;

function request(
  userId: number,
  role: "employee" | "manager" | "hr_manager" | "hr_admin" | "org_admin" | "super_admin",
  params: Record<string, string>,
  query: Record<string, string> = {},
): Request {
  return {
    actor: {
      userId,
      employeeId: userId,
      organizationId: ORG_ID,
      role,
      roles: [role],
      authenticationMethod: "jwt",
    },
    user: {
      empcloudUserId: userId,
      empcloudOrgId: ORG_ID,
      performanceProfileId: null,
      role,
      email: "person@example.com",
      firstName: "Test",
      lastName: "Person",
      orgName: "Test Org",
    },
    params,
    query,
  } as unknown as Request;
}

function response(): Response {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

const reviewSummary = {
  review_id: "review-1",
  employee_id: 10,
  reviewer_id: 20,
  cycle_id: "cycle-1",
  review_type: "peer",
  overall_rating: 4,
};

const employeeSummary = {
  employee_id: 10,
  cycle_id: "cycle-1",
  reviews: {
    self_review: { ...reviewSummary, reviewer_id: 10, review_type: "self" },
    manager_review: { ...reviewSummary, reviewer_id: 30, review_type: "manager" },
    peer_reviews: [
      { ...reviewSummary, reviewer_id: 20 },
      { ...reviewSummary, review_id: "review-2", reviewer_id: 21 },
    ],
  },
};

describe("AI summary route privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getReview.mockResolvedValue({
      id: "review-1",
      organization_id: ORG_ID,
      cycle_id: "cycle-1",
      employee_id: 10,
      reviewer_id: 20,
      type: "peer",
      status: "submitted",
      competency_ratings: [],
    });
    mocks.getCycle.mockResolvedValue({ id: "cycle-1", organization_id: ORG_ID, status: "completed" });
    mocks.generateReviewSummary.mockResolvedValue(reviewSummary);
    mocks.generateEmployeeSummary.mockResolvedValue(employeeSummary);
  });

  it("authorizes review metadata before invoking the summary generator", async () => {
    const denial = new ForbiddenError("Review is not released");
    mocks.getReview.mockRejectedValueOnce(denial);
    const req = request(10, "employee", { reviewId: "review-1" });
    const res = response();
    const next = vi.fn();

    await getReviewSummary(req, res, next);

    expect(mocks.getReview).toHaveBeenCalledWith(ORG_ID, "review-1", req.actor);
    expect(mocks.generateReviewSummary).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(denial);
  });

  it("redacts a peer reviewer from the released subject response without mutating the generated summary", async () => {
    const req = request(10, "employee", { reviewId: "review-1" });
    const res = response();

    await getReviewSummary(req, res, vi.fn());

    expect(mocks.getReview.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.generateReviewSummary.mock.invocationCallOrder[0],
    );
    expect(vi.mocked(res.json)).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ reviewer_id: null }),
    });
    expect(reviewSummary.reviewer_id).toBe(20);
  });

  it("preserves peer reviewer identity for the assigned reviewer", async () => {
    const req = request(20, "employee", { reviewId: "review-1" });
    const res = response();

    await getReviewSummary(req, res, vi.fn());

    expect(vi.mocked(res.json)).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ reviewer_id: 20 }),
    });
    expect(mocks.generateReviewSummary).toHaveBeenCalledWith(
      ORG_ID,
      "review-1",
      false,
      { includeEmployeeContext: false },
    );
  });

  it("does not let an assigned peer reviewer force summary regeneration", async () => {
    const req = request(20, "employee", { reviewId: "review-1" }, { regenerate: "true" });
    const next = vi.fn();

    await getReviewSummary(req, response(), next);

    expect(mocks.getReview).toHaveBeenCalled();
    expect(mocks.generateReviewSummary).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it("allows an administrator to regenerate a full-context review summary", async () => {
    const req = request(99, "hr_admin", { reviewId: "review-1" }, { regenerate: "1" });

    await getReviewSummary(req, response(), vi.fn());

    expect(mocks.generateReviewSummary).toHaveBeenCalledWith(
      ORG_ID,
      "review-1",
      true,
      { includeEmployeeContext: true },
    );
  });

  it("blocks a subject employee summary before cycle completion without invoking the generator", async () => {
    mocks.getCycle.mockResolvedValueOnce({ id: "cycle-1", organization_id: ORG_ID, status: "in_review" });
    const req = request(10, "employee", { userId: "10" }, { cycleId: "cycle-1" });
    const res = response();
    const next = vi.fn();

    await getEmployeeSummary(req, res, next);

    expect(mocks.getCycle).toHaveBeenCalledWith(ORG_ID, "cycle-1");
    expect(mocks.generateEmployeeSummary).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it("redacts every peer reviewer in a completed employee self-summary", async () => {
    const req = request(10, "employee", { userId: "10" }, { cycleId: "cycle-1" });
    const res = response();

    await getEmployeeSummary(req, res, vi.fn());

    const body = vi.mocked(res.json).mock.calls[0][0] as any;
    expect(body.data.reviews.peer_reviews.map((summary: any) => summary.reviewer_id)).toEqual([null, null]);
    expect(body.data.reviews.manager_review.reviewer_id).toBe(30);
    expect(employeeSummary.reviews.peer_reviews.map((summary) => summary.reviewer_id)).toEqual([20, 21]);
  });

  it("allows an administrator to inspect an active cycle without redacting peer identities", async () => {
    const req = request(99, "hr_admin", { userId: "10" }, { cycleId: "cycle-1" });
    const res = response();

    await getEmployeeSummary(req, res, vi.fn());

    expect(mocks.getCycle).not.toHaveBeenCalled();
    expect(mocks.generateEmployeeSummary).toHaveBeenCalledWith(ORG_ID, 10, "cycle-1", false);
    const body = vi.mocked(res.json).mock.calls[0][0] as any;
    expect(body.data.reviews.peer_reviews.map((summary: any) => summary.reviewer_id)).toEqual([20, 21]);
  });

  it("rejects another employee before cycle lookup or summary generation", async () => {
    const req = request(11, "employee", { userId: "10" }, { cycleId: "cycle-1" });
    const next = vi.fn();

    await getEmployeeSummary(req, response(), next);

    expect(mocks.getCycle).not.toHaveBeenCalled();
    expect(mocks.generateEmployeeSummary).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it("does not let an employee regenerate their own released aggregate summary", async () => {
    const req = request(
      10,
      "employee",
      { userId: "10" },
      { cycleId: "cycle-1", regenerate: "1" },
    );
    const next = vi.fn();

    await getEmployeeSummary(req, response(), next);

    expect(mocks.generateEmployeeSummary).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
});
