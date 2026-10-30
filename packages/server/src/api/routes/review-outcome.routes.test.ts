import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listMyReviewOutcomes: vi.fn(),
  listReviewOutcomeAppeals: vi.fn(),
  getReviewOutcome: vi.fn(),
  acknowledgeReviewOutcome: vi.fn(),
  submitReviewOutcomeAppeal: vi.fn(),
  withdrawReviewOutcomeAppeal: vi.fn(),
  startReviewOutcomeAppeal: vi.fn(),
  resolveReviewOutcomeAppeal: vi.fn(),
}));

vi.mock("../../services/review/review-outcome.service", () => mocks);

vi.mock("../middleware/auth.middleware", () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
  authorize: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import {
  acknowledgeReviewOutcome,
  getReviewOutcome,
  listMyReviewOutcomes,
  listReviewOutcomeAppeals,
  resolveReviewOutcomeAppeal,
  submitReviewOutcomeAppeal,
} from "./review-outcome.routes";

const ORG_ID = 7;
const USER_ID = 101;
const OUTCOME_ID = "11111111-1111-4111-8111-111111111111";
const CYCLE_ID = "22222222-2222-4222-8222-222222222222";

function request(options: {
  role?: "employee" | "hr_admin";
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
} = {}): Request {
  const role = options.role ?? "employee";
  return {
    actor: {
      userId: USER_ID,
      employeeId: USER_ID,
      organizationId: ORG_ID,
      role,
      roles: [role],
      authenticationMethod: "jwt",
    },
    user: {
      empcloudUserId: USER_ID,
      empcloudOrgId: ORG_ID,
      performanceProfileId: null,
      role,
      email: "employee@example.com",
      firstName: "Test",
      lastName: "Employee",
      orgName: "Test Org",
    },
    params: options.params ?? { id: OUTCOME_ID },
    query: options.query ?? {},
    body: options.body,
  } as unknown as Request;
}

function response(): Response {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

describe("review outcome routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listMyReviewOutcomes.mockResolvedValue({ data: [], total: 0, page: 1, perPage: 20 });
    mocks.listReviewOutcomeAppeals.mockResolvedValue({ data: [], total: 0, page: 1, perPage: 20 });
    mocks.getReviewOutcome.mockResolvedValue({ id: OUTCOME_ID, reviews: [] });
    mocks.acknowledgeReviewOutcome.mockResolvedValue({ id: OUTCOME_ID, acknowledged_at: "now" });
    mocks.submitReviewOutcomeAppeal.mockResolvedValue({ id: OUTCOME_ID, appeal_status: "submitted" });
    mocks.resolveReviewOutcomeAppeal.mockResolvedValue({ id: OUTCOME_ID, appeal_status: "upheld" });
  });

  it("derives the mine scope from the authenticated actor", async () => {
    const req = request({ query: { page: "2", perPage: "10" } });
    const res = response();

    await listMyReviewOutcomes(req, res, vi.fn());

    expect(mocks.listMyReviewOutcomes).toHaveBeenCalledWith(ORG_ID, req.actor, {
      page: 2,
      perPage: 10,
    });
    expect(vi.mocked(res.json)).toHaveBeenCalledWith({
      success: true,
      data: { data: [], total: 0, page: 1, perPage: 20, totalPages: 0 },
    });
  });

  it("returns the policy-safe detail DTO from the service", async () => {
    const req = request();
    const res = response();

    await getReviewOutcome(req, res, vi.fn());

    expect(mocks.getReviewOutcome).toHaveBeenCalledWith(ORG_ID, OUTCOME_ID, req.actor);
    expect(vi.mocked(res.json)).toHaveBeenCalledWith({
      success: true,
      data: { id: OUTCOME_ID, reviews: [] },
    });
  });

  it("rejects an employee-id override in an acknowledgement body", async () => {
    const next = vi.fn();
    await acknowledgeReviewOutcome(
      request({ body: { note: "Received", employee_id: 999 } }),
      response(),
      next,
    );

    expect(mocks.acknowledgeReviewOutcome).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: "ZodError" }));
  });

  it("validates and trims an appeal reason before calling the service", async () => {
    const req = request({
      body: { reason: "   The supporting evidence is incomplete for this rating.   " },
    });

    await submitReviewOutcomeAppeal(req, response(), vi.fn());

    expect(mocks.submitReviewOutcomeAppeal).toHaveBeenCalledWith(
      ORG_ID,
      OUTCOME_ID,
      req.actor,
      "The supporting evidence is incomplete for this rating.",
    );
  });

  it("passes only validated queue filters to the HR appeal list", async () => {
    const req = request({
      role: "hr_admin",
      query: { page: "3", perPage: "5", cycleId: CYCLE_ID, status: "under_review" },
    });

    await listReviewOutcomeAppeals(req, response(), vi.fn());

    expect(mocks.listReviewOutcomeAppeals).toHaveBeenCalledWith(ORG_ID, req.actor, {
      page: 3,
      perPage: 5,
      cycleId: CYCLE_ID,
      status: "under_review",
    });
  });

  it("validates a mandatory resolution note and forwards the fixed outcome enum", async () => {
    const req = request({
      role: "hr_admin",
      body: {
        outcome: "not_upheld",
        resolution_note: "The submitted evidence does not support a rating correction.",
      },
    });

    await resolveReviewOutcomeAppeal(req, response(), vi.fn());

    expect(mocks.resolveReviewOutcomeAppeal).toHaveBeenCalledWith(
      ORG_ID,
      OUTCOME_ID,
      req.actor,
      {
        outcome: "not_upheld",
        resolution_note: "The submitted evidence does not support a rating correction.",
      },
    );
  });
});
