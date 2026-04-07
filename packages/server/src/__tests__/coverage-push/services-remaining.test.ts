/**
 * EMP Performance — Coverage push for remaining 0% services.
 * Competency, Feedback, Goal, One-on-one, Peer-review, Review, Review-cycle.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-coverage-push";
process.env.EMPCLOUD_URL = "http://localhost:3000";
process.env.LOG_LEVEL = "error";

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const mockDB = {
  findOne: vi.fn().mockResolvedValue(null),
  findById: vi.fn().mockResolvedValue(null),
  findMany: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  create: vi.fn().mockImplementation((_t: string, d: any) => Promise.resolve({ id: "mock-id", ...d })),
  update: vi.fn().mockImplementation((_t: string, id: string, d: any) => Promise.resolve({ id, ...d })),
  delete: vi.fn().mockResolvedValue(undefined),
  count: vi.fn().mockResolvedValue(0),
  raw: vi.fn().mockResolvedValue([[]]),
};

vi.mock("../../db/adapters", () => ({
  initDB: vi.fn(), closeDB: vi.fn(), getDB: () => mockDB,
}));
vi.mock("../../db/empcloud", () => ({
  initEmpCloudDB: vi.fn(), closeEmpCloudDB: vi.fn(),
  findUserByEmail: vi.fn().mockResolvedValue(null),
  findUserById: vi.fn().mockResolvedValue({ id: 522, email: "t@t.com", first_name: "Test", last_name: "User", organization_id: 5, role: "employee" }),
  findOrgById: vi.fn().mockResolvedValue({ id: 5, name: "TestOrg" }),
}));
vi.mock("../../services/email/email.service", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  sendReviewReminder: vi.fn().mockResolvedValue(undefined),
  sendPIPCheckInReminder: vi.fn().mockResolvedValue(undefined),
  sendOneOnOneReminder: vi.fn().mockResolvedValue(undefined),
  sendGoalDeadlineReminder: vi.fn().mockResolvedValue(undefined),
  sendCycleLaunchedNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const ORG = 5;
beforeEach(() => {
  vi.clearAllMocks();
  mockDB.findOne.mockResolvedValue(null);
  mockDB.findById.mockResolvedValue(null);
  mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  mockDB.count.mockResolvedValue(0);
  mockDB.raw.mockResolvedValue([[]]);
  mockDB.create.mockImplementation((_t: string, d: any) => Promise.resolve({ id: "mock-id", ...d }));
  mockDB.update.mockImplementation((_t: string, id: string, d: any) => Promise.resolve({ id, ...d }));
});

// ── COMPETENCY FRAMEWORK SERVICE ────────────────────────────────────────────
describe("Competency Framework Service", () => {
  let svc: typeof import("../../services/competency/competency-framework.service");
  beforeAll(async () => { svc = await import("../../services/competency/competency-framework.service"); });

  it("createFramework creates", async () => {
    const r = await svc.createFramework(ORG, { name: "Core", description: "Core competencies" } as any);
    expect(r).toHaveProperty("id");
  });
  it("listFrameworks returns data", async () => {
    const r = await svc.listFrameworks(ORG);
    expect(Array.isArray(r)).toBe(true);
  });
  it("getFramework throws for missing", async () => {
    await expect(svc.getFramework(ORG, "f1")).rejects.toThrow();
  });
  it("getFramework succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "f1", name: "Core" });
    mockDB.findMany.mockResolvedValue({ data: [{ id: "c1" }], total: 1, page: 1, limit: 100, totalPages: 1 });
    const r = await svc.getFramework(ORG, "f1");
    expect(r).toHaveProperty("competencies");
  });
  it("updateFramework throws for missing", async () => {
    await expect(svc.updateFramework(ORG, "f1", { name: "Updated" })).rejects.toThrow();
  });
  it("updateFramework succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "f1" });
    const r = await svc.updateFramework(ORG, "f1", { name: "Updated" });
    expect(r).toHaveProperty("id");
  });
  it("deleteFramework throws for missing", async () => {
    await expect(svc.deleteFramework(ORG, "f1")).rejects.toThrow();
  });
  it("deleteFramework succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "f1" });
    await expect(svc.deleteFramework(ORG, "f1")).resolves.toBeUndefined();
  });
  it("addCompetency throws for missing framework", async () => {
    await expect(svc.addCompetency(ORG, "f1", { name: "Leadership", category: "core" } as any)).rejects.toThrow();
  });
  it("addCompetency succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "f1" });
    const r = await svc.addCompetency(ORG, "f1", { name: "Leadership", category: "core", weight: 4 } as any);
    expect(r).toHaveProperty("id");
  });
  it("updateCompetency throws for missing", async () => {
    await expect(svc.updateCompetency(ORG, "c1", { name: "Updated" })).rejects.toThrow();
  });
  it("removeCompetency throws for missing", async () => {
    await expect(svc.removeCompetency(ORG, "c1")).rejects.toThrow();
  });
});

// ── FEEDBACK SERVICE ────────────────────────────────────────────────────────
describe("Feedback Service", () => {
  let svc: typeof import("../../services/feedback/feedback.service");
  beforeAll(async () => { svc = await import("../../services/feedback/feedback.service"); });

  it("giveFeedback creates feedback", async () => {
    const r = await svc.giveFeedback(ORG, 100, { to_user_id: 522, type: "kudos" as any, message: "Great work!", visibility: "public" } as any);
    expect(r).toHaveProperty("id");
  });
  it("listReceived returns data", async () => {
    const r = await svc.listReceived(ORG, 522, {});
    expect(r).toBeDefined();
  });
  it("listGiven returns data", async () => {
    const r = await svc.listGiven(ORG, 100, {});
    expect(r).toBeDefined();
  });
  it("listAll returns data", async () => {
    const r = await svc.listAll(ORG, {});
    expect(r).toBeDefined();
  });
  it("getPublicWall returns data", async () => {
    const r = await svc.getPublicWall(ORG);
    expect(r).toBeDefined();
  });
  it("deleteFeedback throws for missing", async () => {
    await expect(svc.deleteFeedback(ORG, "fb1")).rejects.toThrow();
  });
  it("deleteFeedback succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "fb1" });
    await expect(svc.deleteFeedback(ORG, "fb1")).resolves.toBeUndefined();
  });
});

// ── GOAL SERVICE ────────────────────────────────────────────────────────────
describe("Goal Service", () => {
  let svc: typeof import("../../services/goal/goal.service");
  beforeAll(async () => { svc = await import("../../services/goal/goal.service"); });

  it("createGoal creates a goal", async () => {
    const r = await svc.createGoal(ORG, 522, {
      employee_id: 522, title: "Learn TypeScript", description: "Master TS",
      category: "professional" as any, due_date: "2026-06-30",
    } as any);
    expect(r).toHaveProperty("id");
  });
  it("listGoals returns data", async () => {
    const r = await svc.listGoals(ORG, {});
    expect(r).toBeDefined();
  });
  it("getGoal throws for missing", async () => {
    await expect(svc.getGoal(ORG, "g1")).rejects.toThrow();
  });
  it("getGoal succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "g1", title: "Goal" });
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
    const r = await svc.getGoal(ORG, "g1");
    expect(r).toHaveProperty("id");
  });
  it("updateGoal throws for missing", async () => {
    await expect(svc.updateGoal(ORG, "g1", { title: "Updated" })).rejects.toThrow();
  });
  it("updateGoal succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "g1" });
    const r = await svc.updateGoal(ORG, "g1", { title: "Updated", status: "in_progress" as any, progress: 50 });
    expect(r).toHaveProperty("id");
  });
  it("deleteGoal throws for missing", async () => {
    await expect(svc.deleteGoal(ORG, "g1")).rejects.toThrow();
  });
  it("deleteGoal succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "g1" });
    await expect(svc.deleteGoal(ORG, "g1")).resolves.toBeUndefined();
  });
  it("addKeyResult throws for missing goal", async () => {
    await expect(svc.addKeyResult(ORG, "g1", { title: "KR1", target_value: 100 } as any)).rejects.toThrow();
  });
  it("addKeyResult succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "g1" });
    const r = await svc.addKeyResult(ORG, "g1", { title: "KR1", target_value: 100 } as any);
    expect(r).toHaveProperty("id");
  });
  it("checkIn throws for missing goal", async () => {
    await expect(svc.checkIn(ORG, "g1", { progress: 50, notes: "Good" } as any, 522)).rejects.toThrow();
  });
  it("getCheckIns returns data", async () => {
    mockDB.findOne.mockResolvedValue({ id: "g1" });
    const r = await svc.getCheckIns(ORG, "g1");
    expect(r).toBeDefined();
  });
  it("getGoalTree returns data", async () => {
    const r = await svc.getGoalTree(ORG, {});
    expect(r).toBeDefined();
  });
});

// ── ONE-ON-ONE SERVICE ──────────────────────────────────────────────────────
describe("One-on-One Service", () => {
  let svc: typeof import("../../services/one-on-one/one-on-one.service");
  beforeAll(async () => { svc = await import("../../services/one-on-one/one-on-one.service"); });

  it("createMeeting creates", async () => {
    const r = await svc.createMeeting(ORG, {
      manager_id: 100, employee_id: 522, title: "Weekly Sync",
      scheduled_at: "2026-04-10T10:00:00Z",
    } as any);
    expect(r).toHaveProperty("id");
  });
  it("listMeetings returns data", async () => {
    const r = await svc.listMeetings(ORG, { userId: 522 });
    expect(r).toBeDefined();
  });
  it("getMeeting throws for missing", async () => {
    await expect(svc.getMeeting(ORG, "m1")).rejects.toThrow();
  });
  it("getMeeting succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "m1", title: "Sync" });
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
    const r = await svc.getMeeting(ORG, "m1");
    expect(r).toHaveProperty("id");
  });
  it("updateMeeting throws for missing", async () => {
    await expect(svc.updateMeeting(ORG, "m1", { title: "Updated" })).rejects.toThrow();
  });
  it("completeMeeting throws for missing", async () => {
    await expect(svc.completeMeeting(ORG, "m1")).rejects.toThrow();
  });
  it("completeMeeting succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "m1" });
    const r = await svc.completeMeeting(ORG, "m1");
    expect(r).toHaveProperty("id");
  });
  it("addAgendaItem throws for missing meeting", async () => {
    await expect(svc.addAgendaItem(ORG, "m1", { topic: "Q1 Review" } as any)).rejects.toThrow();
  });
  it("addAgendaItem succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "m1" });
    const r = await svc.addAgendaItem(ORG, "m1", { topic: "Q1 Review", notes: "Discuss goals" } as any);
    expect(r).toHaveProperty("id");
  });
});

// ── PEER REVIEW SERVICE ─────────────────────────────────────────────────────
describe("Peer Review Service", () => {
  let svc: typeof import("../../services/peer-review/peer-review.service");
  beforeAll(async () => { svc = await import("../../services/peer-review/peer-review.service"); });

  it("nominate creates nomination", async () => {
    let c = 0;
    mockDB.findOne.mockImplementation(async () => {
      c++;
      if (c === 1) return { id: "c1", status: "active" }; // cycle
      return null; // no existing nomination
    });
    const r = await svc.nominate(ORG, "c1", 522, 200, 100);
    expect(r).toHaveProperty("id");
  });
  it("listNominations returns data", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1" });
    const r = await svc.listNominations(ORG, "c1");
    expect(r).toBeDefined();
  });
  it("approveNomination throws for missing", async () => {
    await expect(svc.approveNomination(ORG, "n1")).rejects.toThrow();
  });
  it("approveNomination succeeds", async () => {
    mockDB.findById.mockResolvedValue({ id: "n1", status: "pending", cycle_id: "c1" });
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: ORG });
    const r = await svc.approveNomination(ORG, "n1", 100);
    expect(r).toHaveProperty("id");
  });
  it("declineNomination throws for missing", async () => {
    await expect(svc.declineNomination(ORG, "n1")).rejects.toThrow();
  });
  it("declineNomination succeeds", async () => {
    mockDB.findById.mockResolvedValue({ id: "n1", status: "pending", cycle_id: "c1" });
    mockDB.findOne.mockResolvedValue({ id: "c1", organization_id: ORG });
    const r = await svc.declineNomination(ORG, "n1", 100);
    expect(r).toHaveProperty("id");
  });
});

// ── REVIEW SERVICE ──────────────────────────────────────────────────────────
describe("Review Service", () => {
  let svc: typeof import("../../services/review/review.service");
  beforeAll(async () => { svc = await import("../../services/review/review.service"); });

  it("createReview creates", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", status: "active" });
    const r = await svc.createReview(ORG, {
      cycle_id: "c1", employee_id: 522, reviewer_id: 100, type: "manager" as any,
    } as any);
    expect(r).toHaveProperty("id");
  });
  it("getReview throws for missing", async () => {
    await expect(svc.getReview(ORG, "r1")).rejects.toThrow();
  });
  it("getReview succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "r1" });
    mockDB.findMany.mockResolvedValue({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 });
    const r = await svc.getReview(ORG, "r1");
    expect(r).toHaveProperty("id");
  });
  it("listReviews returns data", async () => {
    const r = await svc.listReviews(ORG, {});
    expect(r).toBeDefined();
  });
  it("saveDraft throws for missing review", async () => {
    await expect(svc.saveDraft(ORG, "r1", { summary: "Draft" })).rejects.toThrow();
  });
  it("submitReview throws for missing review", async () => {
    await expect(svc.submitReview(ORG, "r1", { overall_rating: 4 })).rejects.toThrow();
  });
  it("getReviewsForParticipant returns data", async () => {
    mockDB.raw.mockResolvedValue([[]]);
    const r = await svc.getReviewsForParticipant(ORG, "c1", 522);
    expect(r).toBeDefined();
  });
});

// ── REVIEW CYCLE SERVICE ────────────────────────────────────────────────────
describe("Review Cycle Service", () => {
  let svc: typeof import("../../services/review/review-cycle.service");
  beforeAll(async () => { svc = await import("../../services/review/review-cycle.service"); });

  it("createCycle creates", async () => {
    const r = await svc.createCycle(ORG, {
      name: "Q1 2026 Review", type: "quarterly" as any,
      start_date: "2026-01-01", end_date: "2026-03-31",
    } as any);
    expect(r).toHaveProperty("id");
  });
  it("listCycles returns data", async () => {
    const r = await svc.listCycles(ORG, {});
    expect(r).toBeDefined();
  });
  it("getCycle throws for missing", async () => {
    await expect(svc.getCycle(ORG, "c1")).rejects.toThrow();
  });
  it("getCycle succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", name: "Q1", status: "active" });
    mockDB.count.mockResolvedValue(5);
    const r = await svc.getCycle(ORG, "c1");
    expect(r).toHaveProperty("id");
  });
  it("updateCycle throws for missing", async () => {
    await expect(svc.updateCycle(ORG, "c1", { name: "Updated" })).rejects.toThrow();
  });
  it("updateCycle succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1" });
    const r = await svc.updateCycle(ORG, "c1", { name: "Updated" });
    expect(r).toHaveProperty("id");
  });
  it("launchCycle throws for missing", async () => {
    await expect(svc.launchCycle(ORG, "c1")).rejects.toThrow();
  });
  it("launchCycle succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", status: "draft" });
    mockDB.count.mockResolvedValue(3); // needs participants
    const r = await svc.launchCycle(ORG, "c1");
    expect(r).toHaveProperty("id");
  });
  it("closeCycle throws for missing", async () => {
    await expect(svc.closeCycle(ORG, "c1")).rejects.toThrow();
  });
  it("closeCycle succeeds", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", status: "active" });
    mockDB.raw.mockResolvedValue([[]]);
    const r = await svc.closeCycle(ORG, "c1");
    expect(r).toHaveProperty("id");
  });
  it("addParticipants adds participants", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1", status: "draft" });
    const r = await svc.addParticipants(ORG, "c1", [{ employee_id: 522, manager_id: 100 }]);
    expect(r).toBeDefined();
  });
  it("listParticipants returns data", async () => {
    mockDB.findOne.mockResolvedValue({ id: "c1" });
    const r = await svc.listParticipants(ORG, "c1");
    expect(r).toBeDefined();
  });
  it("removeParticipant throws for missing cycle", async () => {
    await expect(svc.removeParticipant(ORG, "c1", "p1")).rejects.toThrow();
  });
});
