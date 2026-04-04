import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import knex, { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";

let db: Knex;
const TEST_ORG = 88820;
const TEST_TS = Date.now();
const cleanupIds: { table: string; id: string }[] = [];
function track(table: string, id: string) { cleanupIds.push({ table, id }); }

beforeAll(async () => {
  db = knex({ client: "mysql2", connection: { host: "localhost", port: 3306, user: "empcloud", password: "EmpCloud2026", database: "emp_performance" }, pool: { min: 1, max: 5 } });
  await db.raw("SELECT 1");
});
afterEach(async () => { for (const item of [...cleanupIds].reverse()) { try { await db(item.table).where({ id: item.id }).del(); } catch {} } cleanupIds.length = 0; });
afterAll(async () => { await db.destroy(); });

async function createCycle(opts: any = {}) {
  const id = uuidv4();
  await db("review_cycles").insert({ id, organization_id: TEST_ORG, name: opts.name || `Cycle-${TEST_TS}-${id.slice(0,4)}`, type: opts.type || "annual", status: opts.status || "draft", start_date: opts.startDate || "2026-01-01", end_date: opts.endDate || "2026-12-31", review_deadline: "2026-07-31", created_by: 88820 });
  track("review_cycles", id); return id;
}
async function addParticipant(cycleId: string, empId: number, mgrId: number) {
  const id = uuidv4();
  await db("review_cycle_participants").insert({ id, cycle_id: cycleId, employee_id: empId, manager_id: mgrId, status: "pending" });
  track("review_cycle_participants", id); return id;
}
async function createReview(cycleId: string, empId: number, reviewerId: number, type: string) {
  const id = uuidv4();
  await db("reviews").insert({ id, organization_id: TEST_ORG, cycle_id: cycleId, employee_id: empId, reviewer_id: reviewerId, type, status: "draft" });
  track("reviews", id); return id;
}

describe("Review Cycle - Create & Launch", () => {
  it("should create a review cycle in draft", async () => {
    const id = await createCycle();
    const c = await db("review_cycles").where({ id }).first();
    expect(c.status).toBe("draft");
    expect(c.type).toBe("annual");
  });
  it("should launch a cycle (draft -> active)", async () => {
    const id = await createCycle();
    await db("review_cycles").where({ id }).update({ status: "active" });
    expect((await db("review_cycles").where({ id }).first()).status).toBe("active");
  });
  it("should support quarterly cycle type", async () => {
    const id = await createCycle({ type: "quarterly" });
    expect((await db("review_cycles").where({ id }).first()).type).toBe("quarterly");
  });
  it("should add participants to cycle", async () => {
    const cycleId = await createCycle();
    for (let i = 0; i < 5; i++) { await addParticipant(cycleId, 88830 + i, 88820); }
    expect((await db("review_cycle_participants").where({ cycle_id: cycleId })).length).toBe(5);
  });
});

describe("Review - Self Review", () => {
  it("should create a self-review", async () => {
    const cycleId = await createCycle({ status: "active" });
    const revId = await createReview(cycleId, 88831, 88831, "self");
    const r = await db("reviews").where({ id: revId }).first();
    expect(r.type).toBe("self");
    expect(r.employee_id).toBe(88831);
    expect(r.reviewer_id).toBe(88831);
  });
  it("should submit a self-review with ratings", async () => {
    const cycleId = await createCycle({ status: "active" });
    const revId = await createReview(cycleId, 88832, 88832, "self");
    await db("reviews").where({ id: revId }).update({ status: "submitted", overall_rating: 4, summary: "Good year", submitted_at: new Date() });
    const r = await db("reviews").where({ id: revId }).first();
    expect(r.status).toBe("submitted");
    expect(Number(r.overall_rating)).toBe(4);
  });
});

describe("Review - Manager Review", () => {
  it("should create manager review", async () => {
    const cycleId = await createCycle({ status: "active" });
    const mgrRevId = await createReview(cycleId, 88833, 88820, "manager");
    const r = await db("reviews").where({ id: mgrRevId }).first();
    expect(r.type).toBe("manager");
    expect(r.reviewer_id).toBe(88820);
  });
  it("should submit manager review with feedback", async () => {
    const cycleId = await createCycle({ status: "active" });
    const mgrRevId = await createReview(cycleId, 88834, 88820, "manager");
    await db("reviews").where({ id: mgrRevId }).update({ status: "submitted", overall_rating: 3, summary: "Meets expectations, room for growth", submitted_at: new Date() });
    const r = await db("reviews").where({ id: mgrRevId }).first();
    expect(Number(r.overall_rating)).toBe(3);
    expect(r.summary).toContain("room for growth");
  });
});

describe("Review - Competency Ratings", () => {
  it("should add competency ratings to a review", async () => {
    const cycleId = await createCycle({ status: "active" });
    const fwId = uuidv4();
    await db("competency_frameworks").insert({ id: fwId, organization_id: TEST_ORG, name: `FW-${TEST_TS}`, is_active: true, created_by: 88820 });
    track("competency_frameworks", fwId);
    const compId = uuidv4();
    await db("competencies").insert({ id: compId, framework_id: fwId, name: "Communication", category: "soft_skills", weight: 1.0 });
    track("competencies", compId);
    const revId = await createReview(cycleId, 88835, 88820, "manager");
    const ratingId = uuidv4();
    await db("review_competency_ratings").insert({ id: ratingId, review_id: revId, competency_id: compId, rating: 4, comments: "Strong communicator" });
    track("review_competency_ratings", ratingId);
    const rating = await db("review_competency_ratings").where({ id: ratingId }).first();
    expect(rating.rating).toBe(4);
  });
});

describe("Review - Calibration", () => {
  it("should create rating distributions for calibration", async () => {
    const cycleId = await createCycle({ status: "active" });
    const distributions = [{ rating: 1, count: 2, percentage: 5 }, { rating: 2, count: 8, percentage: 20 }, { rating: 3, count: 15, percentage: 37.5 }, { rating: 4, count: 12, percentage: 30 }, { rating: 5, count: 3, percentage: 7.5 }];
    for (const d of distributions) {
      const id = uuidv4();
      await db("rating_distributions").insert({ id, organization_id: TEST_ORG, cycle_id: cycleId, rating: d.rating, count: d.count, percentage: d.percentage });
      track("rating_distributions", id);
    }
    const dists = await db("rating_distributions").where({ cycle_id: cycleId });
    expect(dists).toHaveLength(5);
    expect(dists.reduce((s: number, d: any) => s + Number(d.percentage), 0)).toBe(100);
  });
  it("should record potential assessments", async () => {
    const cycleId = await createCycle({ status: "active" });
    const paId = uuidv4();
    await db("potential_assessments").insert({ id: paId, organization_id: TEST_ORG, cycle_id: cycleId, employee_id: 88836, assessed_by: 88820, potential_rating: 4, notes: "High potential, leadership material" });
    track("potential_assessments", paId);
    const pa = await db("potential_assessments").where({ id: paId }).first();
    expect(pa.potential_rating).toBe(4);
  });
});

describe("Review - Cycle Completion", () => {
  it("should complete a cycle", async () => {
    const id = await createCycle({ status: "active" });
    await db("review_cycles").where({ id }).update({ status: "completed" });
    expect((await db("review_cycles").where({ id }).first()).status).toBe("completed");
  });
  it("should support peer review nominations", async () => {
    const cycleId = await createCycle({ status: "active" });
    const nomId = uuidv4();
    await db("peer_review_nominations").insert({ id: nomId, cycle_id: cycleId, employee_id: 88837, nominee_id: 88838, status: "pending", nominated_by: 88820 });
    track("peer_review_nominations", nomId);
    await db("peer_review_nominations").where({ id: nomId }).update({ status: "approved", approved_by: 88820 });
    expect((await db("peer_review_nominations").where({ id: nomId }).first()).status).toBe("approved");
  });
});
