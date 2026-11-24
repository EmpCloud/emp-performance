import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn() }));

vi.mock("../../db/adapters", () => ({ getDB: () => mocks }));

import { getMyOverview, getOverview } from "./analytics.service";

type FixtureRow = Record<string, string | number>;
let rows: Record<string, FixtureRow[]>;

beforeEach(() => {
  rows = {};
  mocks.count.mockReset();
  // Model the adapter's equality filters against rows instead of returning
  // values by call order, so tenant/user/status mistakes change the result.
  mocks.count.mockImplementation(async (table: string, where: FixtureRow = {}) =>
    (rows[table] ?? []).filter((row) =>
      Object.entries(where).every(([key, value]) => row[key] === value),
    ).length,
  );
});

describe("overview goal completion", () => {
  it("excludes cancelled goals from organization totals and keeps tenant scope", async () => {
    rows.goals = [
      { organization_id: 7, employee_id: 101, status: "completed" },
      { organization_id: 7, employee_id: 101, status: "in_progress" },
      { organization_id: 7, employee_id: 102, status: "at_risk" },
      { organization_id: 7, employee_id: 101, status: "cancelled" },
      { organization_id: 7, employee_id: 102, status: "cancelled" },
      { organization_id: 8, employee_id: 101, status: "completed" },
      { organization_id: 8, employee_id: 101, status: "cancelled" },
    ];

    expect(await getOverview(7)).toMatchObject({
      totalGoals: 3,
      completedGoals: 1,
      goalCompletionRate: 33,
    });
  });

  it("excludes cancelled goals from personal totals without counting colleagues", async () => {
    rows.goals = [
      { organization_id: 7, employee_id: 101, status: "completed" },
      { organization_id: 7, employee_id: 101, status: "not_started" },
      { organization_id: 7, employee_id: 101, status: "cancelled" },
      { organization_id: 7, employee_id: 102, status: "completed" },
      { organization_id: 7, employee_id: 102, status: "cancelled" },
      { organization_id: 8, employee_id: 101, status: "completed" },
      { organization_id: 8, employee_id: 101, status: "cancelled" },
    ];

    expect(await getMyOverview(7, 101)).toMatchObject({
      totalGoals: 2,
      completedGoals: 1,
      goalCompletionRate: 50,
    });
  });

  it.each(["organization", "personal"])(
    "reports zero goals and zero percent when all %s goals are cancelled",
    async (scope) => {
      rows.goals = [
        { organization_id: 7, employee_id: 101, status: "cancelled" },
        { organization_id: 7, employee_id: 102, status: "cancelled" },
        { organization_id: 8, employee_id: 101, status: "completed" },
      ];

      const result = scope === "organization"
        ? await getOverview(7)
        : await getMyOverview(7, 101);

      expect(result).toMatchObject({
        totalGoals: 0,
        completedGoals: 0,
        goalCompletionRate: 0,
      });
    },
  );
});
