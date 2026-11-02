import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindUserById } = vi.hoisted(() => ({
  mockFindUserById: vi.fn(),
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
  findUserById: mockFindUserById,
}));

import {
  finalizeCalibration,
  getCalibrationHistory,
  getCalibrationRoster,
  getFinalizedCalibrationRatings,
  recordCalibrationDecision,
} from "./calibration.service";

const ORG_ID = 7;
const CYCLE_ID = "cycle-1";
const PARTICIPANT_ID = "participant-1";

const cycle = (overrides: Record<string, unknown> = {}) => ({
  id: CYCLE_ID,
  organization_id: ORG_ID,
  name: "2026 annual review",
  status: "calibration",
  calibration_finalized_at: null,
  calibration_finalized_by: null,
  ...overrides,
});

const participant = (overrides: Record<string, unknown> = {}) => ({
  id: PARTICIPANT_ID,
  cycle_id: CYCLE_ID,
  employee_id: 101,
  manager_id: 202,
  status: "in_progress",
  ...overrides,
});

const review = (overrides: Record<string, unknown> = {}) => ({
  id: "review-1",
  organization_id: ORG_ID,
  cycle_id: CYCLE_ID,
  employee_id: 101,
  reviewer_id: 101,
  type: "self",
  status: "submitted",
  overall_rating: 3,
  ...overrides,
});

const decision = (overrides: Record<string, unknown> = {}) => ({
  id: "decision-1",
  organization_id: ORG_ID,
  cycle_id: CYCLE_ID,
  participant_id: PARTICIPANT_ID,
  employee_id: 101,
  baseline_rating: 4,
  calibrated_rating: 4.5,
  reason: "Performance evidence supports this adjustment",
  version: 1,
  decided_by: 99,
  created_at: new Date("2026-10-20T10:00:00Z"),
  ...overrides,
});

function page<T>(data: T[]) {
  return {
    data,
    total: data.length,
    page: 1,
    limit: 250,
    totalPages: 1,
  };
}

function snapshotHash(
  rows: Array<{
    participant_id: string;
    employee_id: number;
    baseline_rating: number;
    effective_rating: number;
    decision_id: string | null;
    decision_version: number | null;
  }>,
) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        rows
          .map((row) => ({
            participant_id: row.participant_id,
            employee_id: Number(row.employee_id),
            baseline_rating: Number(row.baseline_rating),
            effective_rating: Number(row.effective_rating),
            decision_id: row.decision_id ?? null,
            decision_version:
              row.decision_version === null ? null : Number(row.decision_version),
          }))
          .sort((left, right) =>
            left.participant_id.localeCompare(right.participant_id),
          ),
      ),
    )
    .digest("hex");
}

function arrangeCycleAndParticipant(currentCycle = cycle()) {
  mockDB.findOne.mockImplementation(async (table: string) => {
    if (table === "review_cycles") return currentCycle;
    if (table === "review_cycle_participants") return participant();
    return null;
  });
}

function arrangeRosterData(options: {
  decisions?: ReturnType<typeof decision>[];
  reviews?: ReturnType<typeof review>[];
  participants?: ReturnType<typeof participant>[];
} = {}) {
  const reviews = options.reviews ?? [
    review(),
    review({
      id: "review-2",
      reviewer_id: 202,
      type: "manager",
      overall_rating: 5,
    }),
  ];
  mockDB.findMany.mockImplementation(async (table: string) => {
    if (table === "review_cycle_participants") {
      return page(options.participants ?? [participant()]);
    }
    if (table === "reviews") return page(reviews);
    if (table === "review_calibration_decisions") {
      return page(options.decisions ?? []);
    }
    return page([]);
  });
}

describe("calibration.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDB.transaction.mockImplementation(async (fn: (trx: typeof mockDB) => Promise<unknown>) =>
      fn(mockDB),
    );
    mockFindUserById.mockImplementation(async (id: number) => ({
      id,
      organization_id: ORG_ID,
      first_name: "Ananya",
      last_name: "Gupta",
    }));
  });

  it("builds a tenant-scoped roster with an equal-average baseline", async () => {
    arrangeCycleAndParticipant();
    arrangeRosterData();

    const roster = await getCalibrationRoster(ORG_ID, CYCLE_ID);

    expect(mockDB.findOne).toHaveBeenCalledWith("review_cycles", {
      id: CYCLE_ID,
      organization_id: ORG_ID,
    });
    expect(roster).toMatchObject({
      participant_count: 1,
      ready_count: 1,
      is_complete: true,
      participants: [
        {
          employee_name: "Ananya Gupta",
          baseline_rating: 4,
          calibrated_rating: null,
          final_rating: 4,
          has_decision: false,
          incomplete_required_reviews: [],
        },
      ],
    });
  });

  it("does not expose calibration data before the calibration phase", async () => {
    arrangeCycleAndParticipant(cycle({ status: "in_review" }));

    await expect(getCalibrationRoster(ORG_ID, CYCLE_ID)).rejects.toThrow(
      "only after the cycle enters calibration",
    );
    expect(mockDB.findMany).not.toHaveBeenCalled();
  });

  it("uses the newest immutable decision as the effective rating", async () => {
    arrangeCycleAndParticipant();
    arrangeRosterData({
      decisions: [decision({ id: "v2", version: 2, calibrated_rating: "4.75" }), decision()],
    });

    const roster = await getCalibrationRoster(ORG_ID, CYCLE_ID);

    expect(roster.participants[0]).toMatchObject({
      baseline_rating: 4,
      calibrated_rating: 4.75,
      final_rating: 4.75,
      has_decision: true,
      latest_decision: { id: "v2", version: 2 },
    });
  });

  it("records a trimmed adjustment as the next append-only version", async () => {
    arrangeCycleAndParticipant();
    mockDB.findMany.mockImplementation(async (table: string, options: any) => {
      if (table === "reviews") {
        return page([
          review(),
          review({ reviewer_id: 202, type: "manager", overall_rating: 5 }),
        ]);
      }
      if (table === "review_calibration_decisions" && options.limit === 1) {
        return page([decision({ version: 3 })]);
      }
      return page([]);
    });
    mockDB.create.mockImplementation(async (_table: string, data: any) => data);

    const result = await recordCalibrationDecision(
      ORG_ID,
      CYCLE_ID,
      PARTICIPANT_ID,
      99,
      { rating: 4.25, reason: "  Sustained impact across the full review period  " },
    );

    expect(mockDB.create).toHaveBeenCalledWith(
      "review_calibration_decisions",
      expect.objectContaining({
        organization_id: ORG_ID,
        participant_id: PARTICIPANT_ID,
        baseline_rating: 4,
        calibrated_rating: 4.25,
        reason: "Sustained impact across the full review period",
        version: 4,
        decided_by: 99,
      }),
    );
    expect(mockDB.raw).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE"),
      [CYCLE_ID, ORG_ID],
    );
    expect(result.version).toBe(4);
  });

  it("requires a meaningful reason for every override", async () => {
    arrangeCycleAndParticipant();

    await expect(
      recordCalibrationDecision(ORG_ID, CYCLE_ID, PARTICIPANT_ID, 99, {
        rating: 4,
        reason: "too short",
      }),
    ).rejects.toThrow("at least 10 characters");

    expect(mockDB.create).not.toHaveBeenCalled();
  });

  it("does not allow decisions after finalization", async () => {
    arrangeCycleAndParticipant(
      cycle({ calibration_finalized_at: new Date("2026-10-29T10:00:00Z") }),
    );

    await expect(
      recordCalibrationDecision(ORG_ID, CYCLE_ID, PARTICIPANT_ID, 99, {
        rating: 4,
        reason: "Valid documented calibration reason",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("returns decision history newest first and scoped to the tenant", async () => {
    arrangeCycleAndParticipant();
    const history = [decision({ id: "v2", version: 2 }), decision()];
    mockDB.findMany.mockResolvedValue(page(history));

    await expect(
      getCalibrationHistory(ORG_ID, CYCLE_ID, PARTICIPANT_ID),
    ).resolves.toEqual(history);
    expect(mockDB.findMany).toHaveBeenCalledWith(
      "review_calibration_decisions",
      expect.objectContaining({
        filters: {
          organization_id: ORG_ID,
          cycle_id: CYCLE_ID,
          participant_id: PARTICIPANT_ID,
        },
        sort: { field: "version", order: "desc" },
      }),
    );
  });

  it("finalizes a complete roster without requiring adjustment decisions", async () => {
    arrangeCycleAndParticipant();
    arrangeRosterData({ decisions: [] });
    mockDB.createMany.mockImplementation(async (_table: string, data: any[]) => data);
    mockDB.update.mockImplementation(async (_table: string, _id: string, data: any) => ({
      ...cycle(),
      ...data,
    }));

    const result = await finalizeCalibration(ORG_ID, CYCLE_ID, 99);

    expect(mockDB.update).toHaveBeenCalledWith(
      "review_cycles",
      CYCLE_ID,
      expect.objectContaining({
        calibration_finalized_at: expect.any(String),
        calibration_finalized_by: 99,
        calibration_snapshot_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(mockDB.createMany).toHaveBeenCalledWith(
      "review_calibration_snapshots",
      [
        expect.objectContaining({
          participant_id: PARTICIPANT_ID,
          employee_id: 101,
          baseline_rating: 4,
          effective_rating: 4,
          decision_id: null,
          decision_version: null,
        }),
      ],
    );
    expect(mockDB.raw).toHaveBeenCalledWith(
      expect.stringContaining("FOR UPDATE"),
      [CYCLE_ID, ORG_ID],
    );
    expect(result.calibration_finalized_by).toBe(99);
  });

  it("refuses to finalize while a required review is incomplete", async () => {
    arrangeCycleAndParticipant();
    arrangeRosterData({ reviews: [review()] });

    await expect(finalizeCalibration(ORG_ID, CYCLE_ID, 99)).rejects.toThrow(
      "1 participant(s) have incomplete or invalid required reviews",
    );
    expect(mockDB.update).not.toHaveBeenCalled();
  });

  it("refuses to finalize while an assigned peer review is incomplete", async () => {
    arrangeCycleAndParticipant();
    arrangeRosterData({
      reviews: [
        review(),
        review({ reviewer_id: 202, type: "manager", overall_rating: 5 }),
        review({ id: "peer-1", reviewer_id: 303, type: "peer", status: "draft", overall_rating: 4 }),
      ],
    });

    await expect(finalizeCalibration(ORG_ID, CYCLE_ID, 99)).rejects.toThrow(
      "1 participant(s) have incomplete or invalid required reviews",
    );
    expect(mockDB.createMany).not.toHaveBeenCalled();
  });

  it("returns the immutable rating snapshot only after finalization", async () => {
    const snapshots = [
      {
        id: "snapshot-1",
        organization_id: ORG_ID,
        cycle_id: CYCLE_ID,
        participant_id: PARTICIPANT_ID,
        employee_id: 101,
        baseline_rating: 4,
        effective_rating: 4.5,
        decision_id: "decision-1",
        decision_version: 1,
        finalized_at: new Date("2026-10-29T10:00:00Z"),
      },
    ];
    const finalizedCycle = cycle({
      calibration_finalized_at: new Date("2026-10-29T10:00:00Z"),
      calibration_finalized_by: 99,
      calibration_snapshot_hash: snapshotHash(snapshots),
    });
    arrangeCycleAndParticipant(finalizedCycle);
    mockDB.findMany.mockImplementation(async (table: string) =>
      table === "review_calibration_snapshots" ? page(snapshots) : page([]),
    );

    await expect(getFinalizedCalibrationRatings(ORG_ID, CYCLE_ID)).resolves.toEqual([
      {
        participant_id: PARTICIPANT_ID,
        employee_id: 101,
        baseline_rating: 4,
        calibrated_rating: 4.5,
        decision_id: "decision-1",
        decision_version: 1,
      },
    ]);
  });

  it("refuses release when the finalized snapshot digest does not match", async () => {
    arrangeCycleAndParticipant(
      cycle({
        calibration_finalized_at: new Date("2026-10-29T10:00:00Z"),
        calibration_snapshot_hash: "0".repeat(64),
      }),
    );
    mockDB.findMany.mockResolvedValue(
      page([
        {
          id: "snapshot-1",
          organization_id: ORG_ID,
          cycle_id: CYCLE_ID,
          participant_id: PARTICIPANT_ID,
          employee_id: 101,
          baseline_rating: 4,
          effective_rating: 4.5,
          decision_id: null,
          decision_version: null,
          finalized_at: new Date(),
        },
      ]),
    );

    await expect(getFinalizedCalibrationRatings(ORG_ID, CYCLE_ID)).rejects.toThrow(
      "integrity check",
    );
  });
});
