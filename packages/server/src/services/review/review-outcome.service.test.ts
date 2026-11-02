import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "../../security/actor-context";

const mocks = vi.hoisted(() => ({
  findUserById: vi.fn(),
  listReviews: vi.fn(),
  enqueueIntegrationEvent: vi.fn(),
}));

const mockDB = {
  findOne: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  update: vi.fn(),
  raw: vi.fn(),
  transaction: vi.fn(),
};

vi.mock("../../db/adapters", () => ({
  getDB: () => mockDB,
}));

vi.mock("../../db/empcloud", () => ({
  findUserById: mocks.findUserById,
}));

vi.mock("./review.service", () => ({
  listReviews: mocks.listReviews,
}));

vi.mock("../integration/outbox.service", () => ({
  enqueueIntegrationEvent: mocks.enqueueIntegrationEvent,
}));

import {
  REVIEW_OUTCOME_APPEAL_WINDOW_DAYS,
  acknowledgeReviewOutcome,
  createReviewOutcomesForRelease,
  getReviewOutcome,
  resolveReviewOutcomeAppeal,
  startReviewOutcomeAppeal,
  submitReviewOutcomeAppeal,
  withdrawReviewOutcomeAppeal,
} from "./review-outcome.service";

const ORG_ID = 7;
const OUTCOME_ID = "outcome-1";
const CYCLE_ID = "cycle-1";
const PARTICIPANT_ID = "participant-1";
const EMPLOYEE_ID = 101;

function actor(
  role: ActorContext["role"] = "employee",
  overrides: Partial<ActorContext> = {},
): ActorContext {
  return {
    userId: EMPLOYEE_ID,
    employeeId: EMPLOYEE_ID,
    organizationId: ORG_ID,
    role,
    roles: [role],
    authenticationMethod: "jwt",
    ...overrides,
  };
}

function outcome(overrides: Record<string, unknown> = {}) {
  return {
    id: OUTCOME_ID,
    organization_id: ORG_ID,
    cycle_id: CYCLE_ID,
    participant_id: PARTICIPANT_ID,
    employee_id: EMPLOYEE_ID,
    released_rating: "4.25",
    released_at: new Date("2026-10-20T10:00:00.000Z"),
    appeal_deadline_at: new Date("2026-11-03T10:00:00.000Z"),
    acknowledged_at: null,
    acknowledged_by: null,
    acknowledgement_note: null,
    appeal_status: null,
    appeal_reason: null,
    appeal_submitted_at: null,
    appeal_submitted_by: null,
    appeal_review_started_at: null,
    appeal_review_started_by: null,
    appeal_resolved_at: null,
    appeal_resolved_by: null,
    appeal_resolution_note: null,
    created_at: new Date("2026-10-20T10:00:00.000Z"),
    updated_at: new Date("2026-10-20T10:00:00.000Z"),
    ...overrides,
  } as any;
}

function cycle(overrides: Record<string, unknown> = {}) {
  return {
    id: CYCLE_ID,
    organization_id: ORG_ID,
    name: "2026 Annual Review",
    status: "completed",
    start_date: "2026-01-01",
    end_date: "2026-10-01",
    calibration_finalized_at: new Date("2026-10-19T10:00:00.000Z"),
    ...overrides,
  } as any;
}

function participant() {
  return {
    id: PARTICIPANT_ID,
    cycle_id: CYCLE_ID,
    employee_id: EMPLOYEE_ID,
  } as any;
}

function arrangeOutcome(initial = outcome()) {
  let current = initial;
  mockDB.findOne.mockImplementation(async (table: string, where: Record<string, unknown>) => {
    if (table === "review_outcomes") {
      return where.organization_id === ORG_ID && where.id === OUTCOME_ID ? current : null;
    }
    if (table === "review_cycles") return cycle();
    if (table === "review_cycle_participants") return participant();
    return null;
  });
  mockDB.update.mockImplementation(async (table: string, id: string, data: object) => {
    if (table !== "review_outcomes" || id !== OUTCOME_ID) throw new Error("Unexpected update");
    current = { ...current, ...data };
    return current;
  });
  return () => current;
}

describe("review outcome service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T10:00:00.000Z"));
    mockDB.transaction.mockImplementation(async (fn: (trx: typeof mockDB) => Promise<unknown>) =>
      fn(mockDB),
    );
    mockDB.raw.mockResolvedValue([]);
    mockDB.create.mockImplementation(async (_table: string, record: object) => record);
    mocks.enqueueIntegrationEvent.mockResolvedValue({ id: "outbox-event" });
    mocks.findUserById.mockResolvedValue({
      id: EMPLOYEE_ID,
      organization_id: ORG_ID,
      first_name: "Ananya",
      last_name: "Gupta",
    });
    mocks.listReviews.mockResolvedValue({
      data: [
        {
          id: "peer-review",
          type: "peer",
          reviewer_id: null,
          reviewer_anonymous: true,
        },
      ],
      total: 1,
      page: 1,
      perPage: 1000,
    });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("creates one validated outcome snapshot per participant with a 14-day deadline", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "review_cycles") return cycle({ status: "calibration" });
      if (table === "review_cycle_participants") return participant();
      return null;
    });
    mockDB.createMany.mockImplementation(async (_table: string, rows: any[]) => rows);
    const releasedAt = new Date("2026-10-30T09:00:00.000Z");

    const created = await createReviewOutcomesForRelease(
      mockDB as any,
      ORG_ID,
      CYCLE_ID,
      [
        {
          participant_id: PARTICIPANT_ID,
          employee_id: EMPLOYEE_ID,
          released_rating: 4.25,
        },
      ],
      releasedAt,
    );

    expect(mockDB.createMany).toHaveBeenCalledWith(
      "review_outcomes",
      expect.arrayContaining([
        expect.objectContaining({
          organization_id: ORG_ID,
          participant_id: PARTICIPANT_ID,
          employee_id: EMPLOYEE_ID,
          released_rating: 4.25,
          released_at: releasedAt,
          appeal_deadline_at: new Date(
            releasedAt.getTime() + REVIEW_OUTCOME_APPEAL_WINDOW_DAYS * 86_400_000,
          ),
        }),
      ]),
    );
    expect(created).toHaveLength(1);
  });

  it("refuses release snapshots that do not match the cycle participant", async () => {
    mockDB.findOne.mockImplementation(async (table: string) => {
      if (table === "review_cycles") return cycle({ status: "calibration" });
      return null;
    });

    await expect(
      createReviewOutcomesForRelease(mockDB as any, ORG_ID, CYCLE_ID, [
        {
          participant_id: PARTICIPANT_ID,
          employee_id: EMPLOYEE_ID,
          released_rating: 4.25,
        },
      ]),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockDB.createMany).not.toHaveBeenCalled();
  });

  it("returns released feedback through the existing privacy-preserving review service", async () => {
    arrangeOutcome();

    const detail = await getReviewOutcome(ORG_ID, OUTCOME_ID, actor());

    expect(mocks.listReviews).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({
        cycle_id: CYCLE_ID,
        employee_id: EMPLOYEE_ID,
        status: "submitted",
      }),
      expect.objectContaining({ userId: EMPLOYEE_ID }),
    );
    expect(detail.released_rating).toBe(4.25);
    expect(detail.reviews[0]).toMatchObject({ reviewer_id: null, reviewer_anonymous: true });
  });

  it("returns not found for a foreign-tenant outcome without querying its reviews", async () => {
    arrangeOutcome();

    await expect(
      getReviewOutcome(999, OUTCOME_ID, actor("employee", { organizationId: 999 })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.listReviews).not.toHaveBeenCalled();
  });

  it("records a one-time acknowledgement without agreement or appeal waiver", async () => {
    arrangeOutcome();

    const result = await acknowledgeReviewOutcome(
      ORG_ID,
      OUTCOME_ID,
      actor(),
      "I have received the result",
    );

    expect(result.acknowledged_by).toBe(EMPLOYEE_ID);
    const audit = mockDB.create.mock.calls.find((call) => call[0] === "audit_logs")?.[1] as any;
    const newValues = JSON.parse(audit.new_values);
    expect(newValues).toMatchObject({
      acknowledgement_does_not_indicate_agreement: true,
      acknowledgement_does_not_waive_appeal: true,
    });
    expect(audit.new_values).not.toContain("I have received the result");
  });

  it("does not let an administrator acknowledge on an employee's behalf", async () => {
    arrangeOutcome();

    await expect(
      acknowledgeReviewOutcome(
        ORG_ID,
        OUTCOME_ID,
        actor("hr_admin", { userId: 999, employeeId: 999 }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDB.update).not.toHaveBeenCalled();
  });

  it("allows an appeal after acknowledgement and stores no reason text in the audit row", async () => {
    const current = arrangeOutcome();
    await acknowledgeReviewOutcome(ORG_ID, OUTCOME_ID, actor(), "Received");
    mockDB.create.mockClear();

    const appealed = await submitReviewOutcomeAppeal(
      ORG_ID,
      OUTCOME_ID,
      actor(),
      "The evidence used for this rating is incomplete.",
    );

    expect(current().acknowledged_at).not.toBeNull();
    expect(appealed.appeal_status).toBe("submitted");
    const audit = mockDB.create.mock.calls.find((call) => call[0] === "audit_logs")?.[1] as any;
    expect(audit.new_values).not.toContain("evidence used");
    expect(mocks.enqueueIntegrationEvent).toHaveBeenCalledWith(
      mockDB,
      expect.objectContaining({
        eventType: "performance.review_outcome.appeal_submitted",
        aggregateId: OUTCOME_ID,
      }),
    );
  });

  it("enforces the snapshotted appeal deadline and one-appeal rule", async () => {
    arrangeOutcome(outcome({ appeal_deadline_at: new Date("2026-10-24T10:00:00.000Z") }));
    await expect(
      submitReviewOutcomeAppeal(
        ORG_ID,
        OUTCOME_ID,
        actor(),
        "This appeal has a sufficiently detailed reason.",
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    arrangeOutcome(outcome({ appeal_status: "withdrawn" }));
    await expect(
      submitReviewOutcomeAppeal(
        ORG_ID,
        OUTCOME_ID,
        actor(),
        "This second appeal is not permitted for the outcome.",
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("enforces appeal text bounds in the service as well as at the HTTP boundary", async () => {
    arrangeOutcome();

    await expect(
      submitReviewOutcomeAppeal(ORG_ID, OUTCOME_ID, actor(), "Too short"),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mockDB.transaction).not.toHaveBeenCalled();
  });

  it("allows withdrawal only before HR starts review", async () => {
    arrangeOutcome(outcome({ appeal_status: "submitted" }));
    await expect(
      withdrawReviewOutcomeAppeal(ORG_ID, OUTCOME_ID, actor()),
    ).resolves.toMatchObject({ appeal_status: "withdrawn" });

    arrangeOutcome(outcome({ appeal_status: "under_review" }));
    await expect(
      withdrawReviewOutcomeAppeal(ORG_ID, OUTCOME_ID, actor()),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("uses strict HR-only transitions and never mutates the released rating", async () => {
    arrangeOutcome(outcome({ appeal_status: "submitted" }));
    const hr = actor("hr_admin", { userId: 999, employeeId: 999 });
    await startReviewOutcomeAppeal(ORG_ID, OUTCOME_ID, hr);
    mockDB.update.mockClear();
    mockDB.create.mockClear();

    const resolved = await resolveReviewOutcomeAppeal(ORG_ID, OUTCOME_ID, hr, {
      outcome: "upheld",
      resolution_note: "The appeal is upheld and a correction workflow is required.",
    });

    expect(resolved).toMatchObject({ appeal_status: "upheld", released_rating: 4.25 });
    expect(mockDB.update).toHaveBeenCalledWith(
      "review_outcomes",
      OUTCOME_ID,
      expect.not.objectContaining({ released_rating: expect.anything() }),
    );
    const audit = mockDB.create.mock.calls.find((call) => call[0] === "audit_logs")?.[1] as any;
    expect(audit.new_values).not.toContain("correction workflow");
    expect(mocks.enqueueIntegrationEvent).toHaveBeenCalledWith(
      mockDB,
      expect.objectContaining({
        eventType: "performance.review_outcome.appeal_resolved",
        aggregateId: OUTCOME_ID,
      }),
    );
  });

  it("does not allow HR managers or employees to resolve appeals", async () => {
    arrangeOutcome(outcome({ appeal_status: "under_review" }));
    for (const denied of [
      actor("hr_manager", { userId: 999, employeeId: 999 }),
      actor("employee", { userId: 999, employeeId: 999 }),
    ]) {
      await expect(
        resolveReviewOutcomeAppeal(ORG_ID, OUTCOME_ID, denied, {
          outcome: "not_upheld",
          resolution_note: "The evidence does not support changing the released result.",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});
