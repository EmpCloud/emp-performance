import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "../../security/actor-context";

const mockDB = {
  findOne: vi.fn(),
  findMany: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
  raw: vi.fn(),
};

vi.mock("../../db/adapters", () => ({
  getDB: () => mockDB,
}));

const findUserById = vi.fn();
vi.mock("../../db/empcloud", () => ({
  findUserById: (id: number) => findUserById(id),
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  approveNomination,
  getResponse,
  listNominations,
  listResponses,
  nominate,
  submitPeerReview,
} from "./peer-review.service";

const ORG_ID = 7;
const EMPLOYEE_ID = 101;
const REVIEWER_ID = 202;

function actor(
  userId: number,
  role: ActorContext["role"] = "employee",
  organizationId = ORG_ID,
): ActorContext {
  return {
    userId,
    employeeId: userId,
    organizationId,
    role,
    roles: [role],
    authenticationMethod: "jwt",
  };
}

function cycle(overrides: Record<string, any> = {}) {
  return {
    id: "cycle-1",
    organization_id: ORG_ID,
    status: "active",
    framework_id: "framework-1",
    ...overrides,
  };
}

function nomination(overrides: Record<string, any> = {}) {
  return {
    id: "nomination-1",
    cycle_id: "cycle-1",
    employee_id: EMPLOYEE_ID,
    nominee_id: REVIEWER_ID,
    nominated_by: EMPLOYEE_ID,
    status: "approved",
    approved_by: 1,
    declined_by: null,
    declined_at: null,
    ...overrides,
  };
}

function response(overrides: Record<string, any> = {}) {
  return {
    id: "response-1",
    organization_id: ORG_ID,
    nomination_id: "nomination-1",
    cycle_id: "cycle-1",
    reviewer_employee_id: REVIEWER_ID,
    reviewee_employee_id: EMPLOYEE_ID,
    overall_rating: 4,
    ratings: JSON.stringify([{ competency_id: "competency-1", rating: 4 }]),
    strengths: "Clear feedback",
    improvements: "More examples",
    comments: "Strong collaboration",
    status: "submitted",
    submitted_at: new Date("2026-10-29T10:00:00Z"),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe("peer-review.service integrity and privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUserById.mockImplementation(async (id: number) => ({
      id,
      organization_id: ORG_ID,
      status: 1,
    }));
    mockDB.findMany.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
    });
    mockDB.raw.mockResolvedValue([[]]);
    mockDB.createMany.mockResolvedValue([]);
    mockDB.deleteMany.mockResolvedValue(0);
  });

  it("limits a non-admin nomination to the actor as subject", async () => {
    mockDB.findOne.mockResolvedValue(cycle());

    await expect(
      nominate(ORG_ID, "cycle-1", EMPLOYEE_ID, REVIEWER_ID, actor(999)),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(findUserById).not.toHaveBeenCalled();
  });

  it("blocks nomination changes after the editable cycle states", async () => {
    mockDB.findOne.mockResolvedValue(cycle({ status: "completed" }));

    await expect(
      nominate(ORG_ID, "cycle-1", EMPLOYEE_ID, REVIEWER_ID, actor(EMPLOYEE_ID)),
    ).rejects.toThrow("completed");
    expect(mockDB.create).not.toHaveBeenCalled();
  });

  it("creates a self-subject nomination without trusting nominated_by input", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "review_cycles") return cycle();
      if (table === "review_cycle_participants") return { id: "participant-1" };
      return null;
    });
    mockDB.create.mockImplementation(async (_table: string, data: any) => ({
      id: "nomination-1",
      ...data,
    }));

    await nominate(
      ORG_ID,
      "cycle-1",
      EMPLOYEE_ID,
      REVIEWER_ID,
      actor(EMPLOYEE_ID),
    );

    expect(mockDB.create).toHaveBeenCalledWith(
      "peer_review_nominations",
      expect.objectContaining({ nominated_by: EMPLOYEE_ID, employee_id: EMPLOYEE_ID }),
    );
  });

  it("rejects a peer nomination when the employee is outside the cycle population", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "review_cycles") return cycle();
      return null;
    });

    await expect(
      nominate(ORG_ID, "cycle-1", EMPLOYEE_ID, REVIEWER_ID, actor(EMPLOYEE_ID)),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockDB.create).not.toHaveBeenCalled();
  });

  it("returns a domain conflict when a concurrent nomination wins the insert race", async () => {
    mockDB.findOne
      .mockResolvedValueOnce(cycle())
      .mockResolvedValueOnce({ id: "participant-1" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(nomination({ status: "pending" }));
    mockDB.create.mockRejectedValueOnce(new Error("duplicate key"));

    await expect(
      nominate(ORG_ID, "cycle-1", EMPLOYEE_ID, REVIEWER_ID, actor(EMPLOYEE_ID)),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("scopes non-admin nomination reads to their own relationships", async () => {
    mockDB.findOne.mockResolvedValue(cycle());
    mockDB.raw
      .mockResolvedValueOnce([[nomination()]])
      .mockResolvedValueOnce([[{ c: 1 }]]);

    const result = await listNominations(
      ORG_ID,
      "cycle-1",
      actor(REVIEWER_ID),
      { status: "approved" },
    );

    expect(result.data).toHaveLength(1);
    expect(mockDB.raw).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("employee_id = ? OR nominee_id = ? OR nominated_by = ?"),
      expect.arrayContaining([REVIEWER_ID, REVIEWER_ID, REVIEWER_ID]),
    );
    expect(mockDB.findMany).not.toHaveBeenCalled();
  });

  it("creates a canonical pending review when an admin approves a nomination", async () => {
    const pending = nomination({ status: "pending", approved_by: null });
    const approved = nomination();
    mockDB.findById.mockResolvedValue(pending);
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "review_cycles") return cycle();
      if (table === "review_cycle_participants") return { id: "participant-1" };
      if (table === "reviews") return null;
      return null;
    });
    mockDB.update.mockResolvedValue(approved);
    mockDB.create.mockImplementation(async (_table: string, data: any) => ({
      id: "review-1",
      ...data,
    }));

    await approveNomination(ORG_ID, pending.id, actor(1, "hr_admin"));

    expect(mockDB.create).toHaveBeenCalledWith(
      "reviews",
      expect.objectContaining({
        organization_id: ORG_ID,
        cycle_id: "cycle-1",
        employee_id: EMPLOYEE_ID,
        reviewer_id: REVIEWER_ID,
        type: "peer",
        status: "pending",
      }),
    );
  });

  it("conceals raw response detail from the reviewee", async () => {
    mockDB.findById.mockResolvedValue(nomination());
    mockDB.findOne.mockResolvedValue(cycle());

    await expect(
      getResponse(ORG_ID, "nomination-1", actor(EMPLOYEE_ID)),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockDB.findOne).not.toHaveBeenCalledWith(
      "peer_review_responses",
      expect.anything(),
    );
  });

  it("allows an admin to read response detail", async () => {
    mockDB.findById.mockResolvedValue(nomination());
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "review_cycles") return cycle();
      if (table === "peer_review_responses") return response();
      return null;
    });

    const result = await getResponse(
      ORG_ID,
      "nomination-1",
      actor(1, "org_admin"),
    );

    expect(result?.ratings).toEqual([{ competency_id: "competency-1", rating: 4 }]);
  });

  it("forces non-admin response lists to the actor as reviewer", async () => {
    mockDB.findMany.mockResolvedValue({
      data: [response()],
      total: 1,
      page: 1,
      limit: 50,
      totalPages: 1,
    });

    await listResponses(ORG_ID, actor(REVIEWER_ID), { reviewerEmployeeId: 999 });

    expect(mockDB.findMany).toHaveBeenCalledWith(
      "peer_review_responses",
      expect.objectContaining({
        filters: expect.objectContaining({ reviewer_employee_id: REVIEWER_ID }),
      }),
    );
  });

  it("rejects duplicate competency IDs before writing a response", async () => {
    mockDB.findById.mockResolvedValue(nomination());
    mockDB.findOne.mockResolvedValue(cycle());

    await expect(
      submitPeerReview(ORG_ID, "nomination-1", actor(REVIEWER_ID), {
        overall_rating: 4,
        ratings: [
          { competency_id: "competency-1", rating: 4 },
          { competency_id: "competency-1", rating: 5 },
        ],
      }),
    ).rejects.toThrow("only be rated once");
    expect(mockDB.create).not.toHaveBeenCalled();
  });

  it("conceals a deleted, foreign, or wrong-framework competency", async () => {
    mockDB.findById.mockResolvedValue(nomination());
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "review_cycles") return cycle();
      if (table === "review_cycle_participants") return { id: "participant-1" };
      if (table === "competency_frameworks") return { id: "framework-1" };
      return null;
    });
    mockDB.raw.mockResolvedValue([[{ id: "competency-1" }]]);

    await expect(
      submitPeerReview(ORG_ID, "nomination-1", actor(REVIEWER_ID), {
        overall_rating: 4,
        ratings: [{ competency_id: "foreign-competency", rating: 4 }],
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(mockDB.findOne).toHaveBeenCalledWith("competency_frameworks", {
      id: "framework-1",
      organization_id: ORG_ID,
      is_active: true,
      deleted_at: null,
    });
    expect(mockDB.raw).toHaveBeenCalledWith(
      expect.stringContaining(
        "framework_id = ? AND deleted_at IS NULL AND id IN (?)",
      ),
      ["framework-1", "foreign-competency"],
    );
    expect(mockDB.create).not.toHaveBeenCalled();
  });

  it("blocks submissions once a cycle leaves active or in-review", async () => {
    mockDB.findById.mockResolvedValue(nomination());
    mockDB.findOne.mockResolvedValue(cycle({ status: "calibration" }));

    await expect(
      submitPeerReview(ORG_ID, "nomination-1", actor(REVIEWER_ID), {
        overall_rating: 4,
      }),
    ).rejects.toThrow("calibration");
    expect(mockDB.create).not.toHaveBeenCalled();
  });

  it("synchronizes a valid submitted response into canonical reviews and ratings", async () => {
    mockDB.findById.mockResolvedValue(nomination());
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "review_cycles") return cycle();
      if (table === "review_cycle_participants") return { id: "participant-1" };
      if (table === "competency_frameworks") return { id: "framework-1" };
      if (table === "peer_review_responses") return null;
      if (table === "reviews") return null;
      return null;
    });
    mockDB.raw.mockResolvedValue([[{ id: "competency-1" }]]);
    mockDB.create.mockImplementation(async (table: string, data: any) => ({
      ...data,
      id: table === "reviews" ? "review-1" : "response-1",
    }));
    mockDB.update.mockImplementation(async (_table: string, id: string, data: any) => ({
      id,
      ...data,
    }));

    await submitPeerReview(ORG_ID, "nomination-1", actor(REVIEWER_ID), {
      overall_rating: 4,
      ratings: [{ competency_id: "competency-1", rating: 4, comments: "Strong" }],
      strengths: "Clear feedback",
      improvements: "More examples",
      comments: "Strong collaboration",
    });

    expect(mockDB.deleteMany).toHaveBeenCalledWith(
      "review_competency_ratings",
      { review_id: "review-1" },
    );
    expect(mockDB.createMany).toHaveBeenCalledWith(
      "review_competency_ratings",
      [expect.objectContaining({
        review_id: "review-1",
        competency_id: "competency-1",
        rating: 4,
      })],
    );
    expect(mockDB.update).toHaveBeenCalledWith(
      "reviews",
      "review-1",
      expect.objectContaining({
        status: "submitted",
        overall_rating: 4,
        summary: "Strong collaboration",
      }),
    );
  });
});
