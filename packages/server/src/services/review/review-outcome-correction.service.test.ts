import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "../../security/actor-context";

const mocks = vi.hoisted(() => ({ enqueueIntegrationEvent: vi.fn() }));

const mockDB = {
  findOne: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  count: vi.fn(),
  sum: vi.fn(),
  raw: vi.fn(),
  transaction: vi.fn(),
};

vi.mock("../../db/adapters", () => ({ getDB: () => mockDB }));
vi.mock("../integration/outbox.service", () => ({
  enqueueIntegrationEvent: mocks.enqueueIntegrationEvent,
}));

import {
  approveOutcomeCorrection,
  listOutcomeRevisions,
  proposeOutcomeCorrection,
  rejectOutcomeCorrection,
} from "./review-outcome-correction.service";

const ORG_ID = 7;
const OUTCOME_ID = "11111111-1111-4111-8111-111111111111";
const RELEASE_REVISION_ID = "22222222-2222-4222-8222-222222222222";
const CORRECTION_ID = "33333333-3333-4333-8333-333333333333";
const CYCLE_ID = "44444444-4444-4444-8444-444444444444";
const PARTICIPANT_ID = "55555555-5555-4555-8555-555555555555";
const EMPLOYEE_ID = 101;
const PROPOSER_ID = 201;
const REVIEWER_ID = 202;

function actor(
  role: ActorContext["role"],
  userId: number,
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

function outcome(overrides: Record<string, unknown> = {}) {
  return {
    id: OUTCOME_ID,
    organization_id: ORG_ID,
    cycle_id: CYCLE_ID,
    participant_id: PARTICIPANT_ID,
    employee_id: EMPLOYEE_ID,
    released_rating: "3.50",
    current_revision_id: RELEASE_REVISION_ID,
    appeal_status: "upheld",
    ...overrides,
  } as any;
}

function revision(overrides: Record<string, unknown> = {}) {
  return {
    id: CORRECTION_ID,
    organization_id: ORG_ID,
    outcome_id: OUTCOME_ID,
    version: 2,
    rating: "4.25",
    source: "appeal_correction",
    status: "pending",
    reason: "The upheld appeal supports this corrected rating.",
    proposed_by: PROPOSER_ID,
    proposed_at: new Date("2026-10-30T09:00:00.000Z"),
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    supersedes_revision_id: RELEASE_REVISION_ID,
    created_at: new Date("2026-10-30T09:00:00.000Z"),
    updated_at: new Date("2026-10-30T09:00:00.000Z"),
    ...overrides,
  } as any;
}

function arrangeState(options: {
  storedOutcome?: any;
  storedRevision?: any;
  pendingRevision?: any;
} = {}) {
  let storedOutcome = options.storedOutcome ?? outcome();
  let storedRevision = options.storedRevision ?? revision();
  const releaseRevision = revision({
    id: RELEASE_REVISION_ID,
    version: 1,
    rating: "3.50",
    source: "release",
    status: "applied",
    reason: null,
    proposed_by: null,
    supersedes_revision_id: null,
  });
  let participant = {
    id: PARTICIPANT_ID,
    cycle_id: CYCLE_ID,
    employee_id: EMPLOYEE_ID,
    final_rating: "3.50",
  } as any;

  mockDB.findOne.mockImplementation(async (table: string, where: Record<string, any>) => {
    if (table === "review_outcomes") {
      return where.id === OUTCOME_ID && where.organization_id === ORG_ID
        ? storedOutcome
        : null;
    }
    if (table === "review_outcome_revisions") {
      if (where.status === "pending") return options.pendingRevision ?? null;
      const candidate = where.id === RELEASE_REVISION_ID ? releaseRevision : storedRevision;
      return candidate.id === where.id &&
        candidate.outcome_id === where.outcome_id &&
        candidate.organization_id === where.organization_id
        ? candidate
        : null;
    }
    if (table === "review_cycles") {
      return where.id === CYCLE_ID && where.organization_id === ORG_ID
        ? { id: CYCLE_ID, organization_id: ORG_ID, status: "completed" }
        : null;
    }
    if (table === "review_cycle_participants") {
      return where.id === PARTICIPANT_ID && where.cycle_id === CYCLE_ID
        ? participant
        : null;
    }
    return null;
  });
  mockDB.findMany.mockImplementation(async (table: string, options: any) => {
    if (table !== "review_outcome_revisions") {
      return { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    }
    const rows = [releaseRevision, storedRevision].filter(
      (row) => !options.filters.status || row.status === options.filters.status,
    );
    return { data: rows, total: rows.length, page: 1, limit: 1000, totalPages: 1 };
  });
  mockDB.create.mockImplementation(async (table: string, data: any) => {
    if (table === "review_outcome_revisions") {
      storedRevision = { ...data, created_at: new Date(), updated_at: new Date() };
      return storedRevision;
    }
    return data;
  });
  mockDB.update.mockImplementation(async (table: string, id: string, data: any) => {
    if (table === "review_outcome_revisions" && id === CORRECTION_ID) {
      storedRevision = { ...storedRevision, ...data };
      return storedRevision;
    }
    if (table === "review_outcomes" && id === OUTCOME_ID) {
      storedOutcome = { ...storedOutcome, ...data };
      return storedOutcome;
    }
    if (table === "review_cycle_participants" && id === PARTICIPANT_ID) {
      participant = { ...participant, ...data };
      return participant;
    }
    throw new Error(`Unexpected update ${table}:${id}`);
  });
  mockDB.raw.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT p.final_rating")) {
      return [[{ final_rating: participant.final_rating }], []];
    }
    if (sql.includes("status = 'pending'")) {
      return options.pendingRevision ? [[{ id: options.pendingRevision.id }], []] : [];
    }
    if (sql.includes("SELECT version FROM review_outcome_revisions")) {
      return [[{ version: storedRevision.version }], []];
    }
    return [];
  });
  return {
    getOutcome: () => storedOutcome,
    getRevision: () => storedRevision,
    getParticipant: () => participant,
  };
}

describe("review outcome correction service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-30T10:00:00.000Z"));
    mockDB.transaction.mockImplementation(async (fn: (trx: typeof mockDB) => Promise<any>) =>
      fn(mockDB),
    );
    mockDB.createMany.mockImplementation(async (_table: string, data: any[]) => data);
    mockDB.deleteMany.mockResolvedValue(5);
    mocks.enqueueIntegrationEvent.mockResolvedValue({ id: "outbox-1" });
  });

  afterAll(() => vi.useRealTimers());

  it("shows employees only applied history and redacts governance notes", async () => {
    arrangeState({ storedRevision: revision({ status: "applied", review_note: "private" }) });

    const result = await listOutcomeRevisions(
      ORG_ID,
      OUTCOME_ID,
      actor("employee", EMPLOYEE_ID),
    );

    expect(mockDB.findMany).toHaveBeenCalledWith(
      "review_outcome_revisions",
      expect.objectContaining({ filters: expect.objectContaining({ status: "applied" }) }),
    );
    expect(result).toHaveLength(2);
    expect(
      result.every(
        (row) =>
          row.reason === null &&
          row.review_note === null &&
          row.proposed_by === null &&
          row.reviewed_by === null,
      ),
    ).toBe(true);
  });

  it("lets governance see pending history without weakening tenant scope", async () => {
    arrangeState();

    const result = await listOutcomeRevisions(
      ORG_ID,
      OUTCOME_ID,
      actor("hr_admin", REVIEWER_ID),
    );

    expect(result.some((row) => row.status === "pending")).toBe(true);
    const query = mockDB.findMany.mock.calls[0][1];
    expect(query.filters).not.toHaveProperty("status");
    expect(query.filters).toMatchObject({ organization_id: ORG_ID, outcome_id: OUTCOME_ID });
  });

  it("proposes only one correction after an upheld appeal under an outcome lock", async () => {
    arrangeState({ storedRevision: revision({ status: "rejected", version: 1 }) });

    const proposed = await proposeOutcomeCorrection(
      ORG_ID,
      OUTCOME_ID,
      actor("hr_admin", PROPOSER_ID),
      {
        rating: 4.25,
        reason: "The upheld appeal supports a corrected final rating.",
      },
    );

    expect(mockDB.raw).toHaveBeenCalledWith(
      expect.stringContaining("review_outcomes"),
      [OUTCOME_ID, ORG_ID],
    );
    expect(proposed).toMatchObject({ status: "pending", source: "appeal_correction" });
    const auditCall = mockDB.create.mock.calls.find((call) => call[0] === "audit_logs");
    expect(auditCall).toBeDefined();
    expect(JSON.stringify(auditCall)).not.toContain("upheld appeal supports");
  });

  it("rejects a second pending proposal", async () => {
    arrangeState({ pendingRevision: revision() });

    await expect(
      proposeOutcomeCorrection(
        ORG_ID,
        OUTCOME_ID,
        actor("hr_admin", PROPOSER_ID),
        {
          rating: 4.25,
          reason: "The upheld appeal supports a corrected final rating.",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("does not allow a proposal unless the appeal was upheld", async () => {
    arrangeState({ storedOutcome: outcome({ appeal_status: "not_upheld" }) });

    await expect(
      proposeOutcomeCorrection(
        ORG_ID,
        OUTCOME_ID,
        actor("hr_admin", PROPOSER_ID),
        {
          rating: 4.25,
          reason: "A correction must never bypass the upheld-appeal gate.",
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      mockDB.create.mock.calls.some((call) => call[0] === "review_outcome_revisions"),
    ).toBe(false);
  });

  it("prevents the proposer from approving their own correction", async () => {
    arrangeState();

    await expect(
      approveOutcomeCorrection(
        ORG_ID,
        OUTCOME_ID,
        CORRECTION_ID,
        actor("hr_admin", PROPOSER_ID),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDB.update).not.toHaveBeenCalled();
  });

  it("atomically applies an approved revision and emits only redacted metadata", async () => {
    const state = arrangeState();

    const applied = await approveOutcomeCorrection(
      ORG_ID,
      OUTCOME_ID,
      CORRECTION_ID,
      actor("org_admin", REVIEWER_ID),
      { review_note: "Verified against the appeal evidence." },
    );

    expect(applied.status).toBe("applied");
    expect(state.getOutcome()).toMatchObject({
      released_rating: "3.50",
      current_revision_id: CORRECTION_ID,
    });
    expect(state.getParticipant().final_rating).toBe(4.25);
    expect(mockDB.deleteMany).toHaveBeenCalledWith("rating_distributions", {
      organization_id: ORG_ID,
      cycle_id: CYCLE_ID,
    });
    expect(mockDB.createMany).toHaveBeenCalledWith(
      "rating_distributions",
      expect.arrayContaining([expect.objectContaining({ rating: 4, count: 1 })]),
    );
    expect(mockDB.create).toHaveBeenCalledWith(
      "notifications",
      expect.objectContaining({
        user_id: EMPLOYEE_ID,
        type: "review_outcome_correction_applied",
      }),
    );
    const auditCall = mockDB.create.mock.calls.find((call) => call[0] === "audit_logs");
    expect(auditCall).toBeDefined();
    expect(JSON.stringify(auditCall)).not.toContain("appeal evidence");
    const event = mocks.enqueueIntegrationEvent.mock.calls[0][1];
    expect(JSON.stringify(event.payload)).not.toContain("appeal evidence");
    expect(event).toMatchObject({
      eventType: "performance.review_outcome.correction_applied",
      idempotencyKey: `performance.review_outcome.correction_applied:${OUTCOME_ID}:v2`,
    });
  });

  it("makes rejection terminal without changing the effective rating", async () => {
    const state = arrangeState();
    const reviewer = actor("hr_admin", REVIEWER_ID);

    await expect(
      rejectOutcomeCorrection(ORG_ID, OUTCOME_ID, CORRECTION_ID, reviewer, {
        review_note: "The proposed correction is not supported by the evidence.",
      }),
    ).resolves.toMatchObject({ status: "rejected" });
    await expect(
      rejectOutcomeCorrection(ORG_ID, OUTCOME_ID, CORRECTION_ID, reviewer, {
        review_note: "A second rejection attempt must not mutate this record.",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.getOutcome().current_revision_id).toBe(RELEASE_REVISION_ID);
    expect(state.getParticipant().final_rating).toBe("3.50");
  });

  it("returns not found before exposing a foreign-tenant correction", async () => {
    arrangeState();

    await expect(
      listOutcomeRevisions(999, OUTCOME_ID, actor("super_admin", REVIEWER_ID, 999)),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDB.findMany).not.toHaveBeenCalled();
  });
});
