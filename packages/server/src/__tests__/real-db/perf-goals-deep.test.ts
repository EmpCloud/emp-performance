import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import knex, { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";

let db: Knex;
const TEST_ORG = 88821;
const TEST_TS = Date.now();
const cleanupIds: { table: string; id: string }[] = [];
function track(table: string, id: string) { cleanupIds.push({ table, id }); }

beforeAll(async () => {
  db = knex({ client: "mysql2", connection: { host: "localhost", port: 3306, user: "empcloud", password: "EmpCloud2026", database: "emp_performance" }, pool: { min: 1, max: 5 } });
  await db.raw("SELECT 1");
});
afterEach(async () => { for (const item of [...cleanupIds].reverse()) { try { await db(item.table).where({ id: item.id }).del(); } catch {} } cleanupIds.length = 0; });
afterAll(async () => { await db.destroy(); });

async function createGoal(opts: any = {}) {
  const id = uuidv4();
  await db("goals").insert({ id, organization_id: TEST_ORG, employee_id: opts.employeeId || 88830, title: opts.title || `Goal-${TEST_TS}-${id.slice(0,4)}`, description: "Test goal", category: opts.category || "individual", status: opts.status || "not_started", priority: opts.priority || "medium", progress: opts.progress || 0, start_date: "2026-01-01", due_date: "2026-06-30", parent_goal_id: opts.parentId || null, created_by: 88820 });
  track("goals", id); return id;
}
async function createKeyResult(goalId: string, opts: any = {}) {
  const id = uuidv4();
  await db("key_results").insert({ id, goal_id: goalId, title: opts.title || `KR-${TEST_TS}-${id.slice(0,4)}`, metric_type: opts.metricType || "number", target_value: opts.targetValue || 100, current_value: opts.currentValue || 0, unit: opts.unit || "units", weight: opts.weight || 1.0 });
  track("key_results", id); return id;
}

describe("Goals - CRUD", () => {
  it("should create an individual goal", async () => {
    const id = await createGoal();
    const g = await db("goals").where({ id }).first();
    expect(g.category).toBe("individual");
    expect(g.status).toBe("not_started");
    expect(g.progress).toBe(0);
  });
  it("should create a team goal", async () => {
    const id = await createGoal({ category: "team" });
    expect((await db("goals").where({ id }).first()).category).toBe("team");
  });
  it("should create a company-level goal", async () => {
    const id = await createGoal({ category: "company" });
    const g = await db("goals").where({ id }).first();
    expect(g.category).toBe("company");
  });
  it("should update goal progress", async () => {
    const id = await createGoal({ status: "in_progress" });
    await db("goals").where({ id }).update({ progress: 65 });
    expect((await db("goals").where({ id }).first()).progress).toBe(65);
  });
  it("should complete a goal", async () => {
    const id = await createGoal({ status: "in_progress" });
    await db("goals").where({ id }).update({ progress: 100, status: "completed", completed_at: new Date() });
    const g = await db("goals").where({ id }).first();
    expect(g.status).toBe("completed");
    expect(g.progress).toBe(100);
  });
});

describe("Goals - OKR Tree (Parent-Child)", () => {
  it("should create parent goal with child goals", async () => {
    const parentId = await createGoal({ category: "company" });
    await createGoal({ category: "team", parentId });
    await createGoal({ category: "team", parentId });
    expect((await db("goals").where({ parent_goal_id: parentId })).length).toBe(2);
  });
  it("should cascade 3 levels deep", async () => {
    const l1 = await createGoal({ category: "company" });
    const l2 = await createGoal({ category: "team", parentId: l1 });
    const l3 = await createGoal({ category: "individual", parentId: l2 });
    expect((await db("goals").where({ id: l3 }).first()).parent_goal_id).toBe(l2);
    expect((await db("goals").where({ id: l2 }).first()).parent_goal_id).toBe(l1);
  });
});

describe("Key Results", () => {
  it("should create key results for a goal", async () => {
    const goalId = await createGoal();
    await createKeyResult(goalId, { title: "Revenue", targetValue: 1000000, unit: "INR" });
    await createKeyResult(goalId, { title: "Customers", targetValue: 100, unit: "customers" });
    expect((await db("key_results").where({ goal_id: goalId })).length).toBe(2);
  });
  it("should update key result progress", async () => {
    const goalId = await createGoal();
    const krId = await createKeyResult(goalId, { targetValue: 50 });
    await db("key_results").where({ id: krId }).update({ current_value: 30 });
    const kr = await db("key_results").where({ id: krId }).first();
    expect(Number(kr.current_value)).toBe(30);
    expect(Math.round((Number(kr.current_value) / Number(kr.target_value)) * 100)).toBe(60);
  });
  it("should complete a key result", async () => {
    const goalId = await createGoal();
    const krId = await createKeyResult(goalId, { targetValue: 10 });
    await db("key_results").where({ id: krId }).update({ current_value: 10 });
    expect(Number((await db("key_results").where({ id: krId }).first()).current_value)).toBe(10);
  });
  it("should support percentage metric type", async () => {
    const goalId = await createGoal();
    const krId = await createKeyResult(goalId, { metricType: "percentage", targetValue: 100, unit: "%" });
    expect((await db("key_results").where({ id: krId }).first()).metric_type).toBe("percentage");
  });
});

describe("Goal Check-ins", () => {
  it("should create goal check-in entries", async () => {
    const goalId = await createGoal();
    for (let i = 1; i <= 3; i++) {
      const id = uuidv4();
      await db("goal_check_ins").insert({ id, goal_id: goalId, author_id: 88830, progress: i * 20, notes: `Check-in ${i}` });
      track("goal_check_ins", id);
    }
    const checkIns = await db("goal_check_ins").where({ goal_id: goalId });
    expect(checkIns).toHaveLength(3);
  });
});

describe("Goal Alignment", () => {
  it("should align individual goals to team goals", async () => {
    const teamGoal = await createGoal({ category: "team" });
    for (let i = 0; i < 3; i++) {
      await createGoal({ category: "individual", parentId: teamGoal, employeeId: 88840 + i });
    }
    const aligned = await db("goals").where({ parent_goal_id: teamGoal });
    expect(aligned).toHaveLength(3);
    aligned.forEach((g: any) => expect(g.category).toBe("individual"));
  });
  it("should support goal priority levels", async () => {
    for (const p of ["high", "medium", "low"]) {
      const id = await createGoal({ priority: p });
      expect((await db("goals").where({ id }).first()).priority).toBe(p);
    }
  });
});
