import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSkillsGap: vi.fn(),
  getLearningRecommendations: vi.fn(),
}));

vi.mock("../../services/analytics/analytics.service", () => ({
  getSkillsGap: mocks.getSkillsGap,
  getLearningRecommendations: mocks.getLearningRecommendations,
}));

import { skillsGapHandler } from "./analytics.routes";

function requestFor(employeeId: string, userId = 101, role = "employee") {
  return {
    params: { employeeId },
    user: {
      empcloudUserId: userId,
      empcloudOrgId: 7,
      performanceProfileId: null,
      role,
      email: "user@example.com",
      firstName: "Example",
      lastName: "User",
      orgName: "Example",
    },
  } as unknown as Request;
}

function responseDouble() {
  const res = {} as Response;
  res.status = vi.fn(() => res) as any;
  res.json = vi.fn(() => res) as any;
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSkillsGap.mockResolvedValue({
    employee_id: 101,
    competencies: [{ competency_id: "competency-1", gap: 1 }],
    overallReadiness: 80,
  });
  mocks.getLearningRecommendations.mockReturnValue([{ competency_id: "competency-1" }]);
});

describe("shared skills-gap authorization", () => {
  it("rejects an employee reading a peer's skills gap before querying data", async () => {
    const next = vi.fn() as unknown as NextFunction;

    await skillsGapHandler(requestFor("202"), responseDouble(), next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, code: "FORBIDDEN" }),
    );
    expect(mocks.getSkillsGap).not.toHaveBeenCalled();
  });

  it("allows an employee to read their own skills gap", async () => {
    const res = responseDouble();
    const next = vi.fn() as unknown as NextFunction;

    await skillsGapHandler(requestFor("101"), res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mocks.getSkillsGap).toHaveBeenCalledWith(7, 101);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        employee_id: 101,
        recommendations: [{ competency_id: "competency-1" }],
      }),
    });
  });

  it("allows an HR administrator to read another employee's skills gap", async () => {
    const next = vi.fn() as unknown as NextFunction;

    await skillsGapHandler(requestFor("202", 101, "hr_admin"), responseDouble(), next);

    expect(next).not.toHaveBeenCalled();
    expect(mocks.getSkillsGap).toHaveBeenCalledWith(7, 202);
  });

  it("rejects partially numeric and non-positive employee identifiers", async () => {
    const next = vi.fn() as unknown as NextFunction;

    await skillsGapHandler(requestFor("101-not-an-id"), responseDouble(), next);
    await skillsGapHandler(requestFor("0"), responseDouble(), next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ statusCode: 400, code: "VALIDATION_ERROR" }),
    );
    expect(next).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ statusCode: 400, code: "VALIDATION_ERROR" }),
    );
    expect(mocks.getSkillsGap).not.toHaveBeenCalled();
  });
});
