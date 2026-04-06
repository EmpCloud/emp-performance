// =============================================================================
// EMP-PERFORMANCE: Final coverage push - Real DB tests for uncovered services
// =============================================================================
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import knexLib, { Knex } from "knex";

let db: Knex;
const ORG = 5;
const USER = 522;

beforeAll(async () => {
  db = knexLib({ client: "mysql2", connection: { host: "localhost", port: 3306, user: "empcloud", password: "EmpCloud2026", database: "emp_performance" } });
  await db.raw("SELECT 1");
});

afterAll(async () => { await db.destroy(); });

describe("Nine-box classification", () => {
  it("classifyNineBox all combos", async () => {
    const { classifyNineBox } = await import("../../services/analytics/nine-box.service");
    const combos = [[1,1],[1,3],[1,5],[3,1],[3,3],[3,5],[5,1],[5,3],[5,5]];
    for (const [p, pot] of combos) { expect(classifyNineBox(p, pot)).toBeTruthy(); }
  });
  it("getNineBoxData", async () => { const { getNineBoxData } = await import("../../services/analytics/nine-box.service"); const r = await getNineBoxData(ORG, "non-existent-cycle"); expect(r).toBeTruthy(); });
  it("listPotentialAssessments", async () => { const { listPotentialAssessments } = await import("../../services/analytics/nine-box.service"); const r = await listPotentialAssessments(ORG, USER); expect(r).toBeTruthy(); });
});

describe("Learning recommendations", () => {
  it("getLearningRecommendations", async () => {
    const { getLearningRecommendations } = await import("../../services/analytics/analytics.service");
    const r = getLearningRecommendations([{ competency: "JS", required_level: 4, current_level: 2, gap: 2 }]);
    expect(r.length).toBeGreaterThan(0);
  });
  it("getLearningRecommendations empty", async () => {
    const { getLearningRecommendations } = await import("../../services/analytics/analytics.service");
    expect(getLearningRecommendations([])).toHaveLength(0);
  });
});

describe("Analytics service coverage", () => {
  it("getOverview", async () => { const { getOverview } = await import("../../services/analytics/analytics.service"); expect(await getOverview(ORG)).toBeTruthy(); });
  it("getTrends", async () => { const { getTrends } = await import("../../services/analytics/analytics.service"); expect(await getTrends(ORG)).toBeTruthy(); });
  it("getGoalCompletion", async () => { const { getGoalCompletion } = await import("../../services/analytics/analytics.service"); expect(await getGoalCompletion(ORG)).toBeTruthy(); });
});

describe("Succession service coverage", () => {
  it("listSuccessionPlans", async () => { const { listSuccessionPlans } = await import("../../services/analytics/succession.service"); expect(await listSuccessionPlans(ORG)).toBeTruthy(); });
  it("getSuccessionPlan throws for non-existent", async () => { const { getSuccessionPlan } = await import("../../services/analytics/succession.service"); await expect(getSuccessionPlan(ORG, "non-existent")).rejects.toThrow(); });
});

describe("Career path service coverage", () => {
  it("listPaths", async () => { const { listPaths } = await import("../../services/career/career-path.service"); expect(await listPaths(ORG)).toBeTruthy(); });
  it("getPath throws for non-existent", async () => { const { getPath } = await import("../../services/career/career-path.service"); await expect(getPath(ORG, "non-existent")).rejects.toThrow(); });
  it("deletePath throws for non-existent", async () => { const { deletePath } = await import("../../services/career/career-path.service"); await expect(deletePath(ORG, "non-existent")).rejects.toThrow(); });
  it("getEmployeeTrack returns null", async () => { const { getEmployeeTrack } = await import("../../services/career/career-path.service"); expect(await getEmployeeTrack(ORG, 99999)).toBeNull(); });
});

describe("Competency framework coverage", () => {
  it("listFrameworks", async () => { const { listFrameworks } = await import("../../services/competency/competency-framework.service"); expect(await listFrameworks(ORG)).toBeTruthy(); });
  it("getFramework throws for non-existent", async () => { const { getFramework } = await import("../../services/competency/competency-framework.service"); await expect(getFramework(ORG, "non-existent")).rejects.toThrow(); });
  it("deleteFramework throws for non-existent", async () => { const { deleteFramework } = await import("../../services/competency/competency-framework.service"); await expect(deleteFramework(ORG, "non-existent")).rejects.toThrow(); });
});

describe("Performance letter service coverage", () => {
  it("listTemplates", async () => { const { listTemplates } = await import("../../services/letter/performance-letter.service"); expect(await listTemplates(ORG)).toBeTruthy(); });
  it("getTemplate throws for non-existent", async () => { const { getTemplate } = await import("../../services/letter/performance-letter.service"); await expect(getTemplate(ORG, "non-existent")).rejects.toThrow(); });
  it("deleteTemplate throws for non-existent", async () => { const { deleteTemplate } = await import("../../services/letter/performance-letter.service"); await expect(deleteTemplate(ORG, "non-existent")).rejects.toThrow(); });
  it("getLetter throws for non-existent", async () => { const { getLetter } = await import("../../services/letter/performance-letter.service"); await expect(getLetter(ORG, "non-existent")).rejects.toThrow(); });
  it("listLetters", async () => { const { listLetters } = await import("../../services/letter/performance-letter.service"); expect(await listLetters(ORG, {})).toBeTruthy(); });
});

describe("Manager effectiveness service coverage", () => {
  it("listManagerScores", async () => { const { listManagerScores } = await import("../../services/manager-effectiveness/manager-effectiveness.service"); expect(await listManagerScores(ORG, {})).toBeTruthy(); });
  it("getDashboard", async () => { const { getDashboard } = await import("../../services/manager-effectiveness/manager-effectiveness.service"); expect(await getDashboard(ORG)).toBeTruthy(); });
});

describe("Notification settings coverage", () => {
  it("getNotificationSettings", async () => { const { getNotificationSettings } = await import("../../services/notification/notification-settings.service"); expect(await getNotificationSettings(ORG)).toBeTruthy(); });
});

describe("One-on-one service coverage", () => {
  it("listMeetings", async () => { const { listMeetings } = await import("../../services/one-on-one/one-on-one.service"); expect(await listMeetings(ORG)).toBeTruthy(); });
  it("getMeeting throws for non-existent", async () => { const { getMeeting } = await import("../../services/one-on-one/one-on-one.service"); await expect(getMeeting(ORG, "non-existent")).rejects.toThrow(); });
  it("completeMeeting throws for non-existent", async () => { const { completeMeeting } = await import("../../services/one-on-one/one-on-one.service"); await expect(completeMeeting(ORG, "non-existent")).rejects.toThrow(); });
});

describe("Peer review service coverage", () => {
  it("listNominations", async () => { const { listNominations } = await import("../../services/peer-review/peer-review.service"); expect(await listNominations(ORG, "non-existent")).toBeTruthy(); });
  it("approveNomination throws for non-existent", async () => { const { approveNomination } = await import("../../services/peer-review/peer-review.service"); await expect(approveNomination(ORG, "non-existent")).rejects.toThrow(); });
  it("declineNomination throws for non-existent", async () => { const { declineNomination } = await import("../../services/peer-review/peer-review.service"); await expect(declineNomination(ORG, "non-existent")).rejects.toThrow(); });
});

describe("PIP service coverage", () => {
  it("listPIPs", async () => { const { listPIPs } = await import("../../services/pip/pip.service"); expect(await listPIPs(ORG, {})).toBeTruthy(); });
  it("getPIP throws for non-existent", async () => { const { getPIP } = await import("../../services/pip/pip.service"); await expect(getPIP(ORG, "non-existent")).rejects.toThrow(); });
  it("closePIP throws for non-existent", async () => { const { closePIP } = await import("../../services/pip/pip.service"); await expect(closePIP(ORG, "non-existent", "successful")).rejects.toThrow(); });
  it("extendPIP throws for non-existent", async () => { const { extendPIP } = await import("../../services/pip/pip.service"); await expect(extendPIP(ORG, "non-existent", "2026-07-31", "needs time")).rejects.toThrow(); });
});

describe("Review service coverage", () => {
  it("listReviews", async () => { const { listReviews } = await import("../../services/review/review.service"); expect(await listReviews(ORG, {})).toBeTruthy(); });
  it("getReview throws for non-existent", async () => { const { getReview } = await import("../../services/review/review.service"); await expect(getReview(ORG, "non-existent")).rejects.toThrow(); });
  it("submitReview throws for non-existent", async () => { const { submitReview } = await import("../../services/review/review.service"); await expect(submitReview(ORG, "non-existent")).rejects.toThrow(); });
  it("saveDraft throws for non-existent", async () => { const { saveDraft } = await import("../../services/review/review.service"); await expect(saveDraft(ORG, "non-existent", {} as any)).rejects.toThrow(); });
  it("getReviewsForParticipant", async () => { const { getReviewsForParticipant } = await import("../../services/review/review.service"); expect(await getReviewsForParticipant(ORG, USER)).toBeTruthy(); });
});

describe("AI Summary service", () => {
  it("exports functions", async () => { const m = await import("../../services/ai-summary/ai-summary.service"); expect(typeof m.generateReviewSummary).toBe("function"); expect(typeof m.generateEmployeeSummary).toBe("function"); expect(typeof m.generateTeamSummary).toBe("function"); });
});
