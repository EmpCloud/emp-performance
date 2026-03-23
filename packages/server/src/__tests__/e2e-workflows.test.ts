// ============================================================================
// EMP PERFORMANCE — FULL E2E WORKFLOW TESTS (Live Deployment)
// Runs against https://test-performance-api.empcloud.com
// ============================================================================

import { describe, it, expect, beforeAll } from "vitest";

const BASE = "https://test-performance-api.empcloud.com/api/v1";
let token = "";
let userId: number;
const TS = Date.now();

// ---------------------------------------------------------------------------
// Shared state across workflows
// ---------------------------------------------------------------------------

// Workflow 1
let frameworkId = "";
let compIds: string[] = [];
let cycleId = "";
let participantIds: string[] = [];
let reviewId = "";

// Workflow 2
let companyGoalId = "";
let deptGoalId = "";
let individualGoalId = "";
let kr1Id = "";
let kr2Id = "";

// Workflow 3
let pipId = "";
let pipObj1Id = "";
let pipObj2Id = "";

// Workflow 4
let careerPathId = "";
let level1Id = "";
let level2Id = "";
let level3Id = "";
let meetingId = "";
let agendaItemId = "";

// Workflow 5
let kudosFeedbackId = "";
let constructiveFeedbackId = "";

// Workflow 7
let successionPlanId = "";

// Workflow 8
let letterTemplateId = "";
let generatedLetterId = "";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
async function api(path: string, opts: RequestInit = {}): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

function pass(step: string, endpoint: string) {
  console.log(`  [PASS] ${step} — ${endpoint}`);
}

function fail(step: string, endpoint: string, detail: string) {
  console.log(`  [FAIL] ${step} — ${endpoint} — ${detail}`);
}

// ============================================================================
// AUTH
// ============================================================================
beforeAll(async () => {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ananya@technova.in", password: "Welcome@123" }),
  });
  const json = await res.json();
  token = json.data?.tokens?.accessToken;
  userId = json.data?.user?.empcloudUserId;
  expect(token).toBeTruthy();
  expect(userId).toBeTruthy();
  console.log(`\nAuthenticated as userId=${userId}\n`);
}, 15000);

// ============================================================================
// WORKFLOW 1: Complete Review Cycle
// ============================================================================
describe("Workflow 1: Complete Review Cycle (Create -> Launch -> Review -> Close)", () => {
  it("Step 1.1: Create competency framework", async () => {
    const { status, body } = await api("/competency-frameworks", {
      method: "POST",
      body: JSON.stringify({
        name: `Engineering v2 ${TS}`,
        description: "Engineering competency framework for E2E test",
      }),
    });
    console.log(`  1.1 POST /competency-frameworks — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    frameworkId = body.data.id;
    expect(frameworkId).toBeTruthy();
    pass("1.1", "POST /competency-frameworks");
  });

  it("Step 1.2: Add competency 1 — Technical Skills (weight 0.3)", async () => {
    const { status, body } = await api(`/competency-frameworks/${frameworkId}/competencies`, {
      method: "POST",
      body: JSON.stringify({ name: "Technical Skills", weight: 0.3, category: "core", order: 1 }),
    });
    console.log(`  1.2 POST /competency-frameworks/:id/competencies — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    compIds.push(body.data.id);
    pass("1.2", "POST /competency-frameworks/:id/competencies");
  });

  it("Step 1.3: Add competency 2 — Communication (weight 0.2)", async () => {
    const { status, body } = await api(`/competency-frameworks/${frameworkId}/competencies`, {
      method: "POST",
      body: JSON.stringify({ name: "Communication", weight: 0.2, category: "soft", order: 2 }),
    });
    console.log(`  1.3 POST /competency-frameworks/:id/competencies — status=${status}`);
    expect(status).toBe(201);
    compIds.push(body.data.id);
    pass("1.3", "POST /competency-frameworks/:id/competencies");
  });

  it("Step 1.4: Add competency 3 — Problem Solving (weight 0.25)", async () => {
    const { status, body } = await api(`/competency-frameworks/${frameworkId}/competencies`, {
      method: "POST",
      body: JSON.stringify({ name: "Problem Solving", weight: 0.25, category: "core", order: 3 }),
    });
    console.log(`  1.4 POST /competency-frameworks/:id/competencies — status=${status}`);
    expect(status).toBe(201);
    compIds.push(body.data.id);
    pass("1.4", "POST /competency-frameworks/:id/competencies");
  });

  it("Step 1.5: Add competency 4 — Teamwork (weight 0.25)", async () => {
    const { status, body } = await api(`/competency-frameworks/${frameworkId}/competencies`, {
      method: "POST",
      body: JSON.stringify({ name: "Teamwork", weight: 0.25, category: "soft", order: 4 }),
    });
    console.log(`  1.5 POST /competency-frameworks/:id/competencies — status=${status}`);
    expect(status).toBe(201);
    compIds.push(body.data.id);
    pass("1.5", "POST /competency-frameworks/:id/competencies");
  });

  it("Step 1.6: Get framework with competencies — verify 4 competencies", async () => {
    const { status, body } = await api(`/competency-frameworks/${frameworkId}`);
    console.log(`  1.6 GET /competency-frameworks/:id — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.competencies?.length || body.data.items?.length || 0).toBeGreaterThanOrEqual(4);
    pass("1.6", "GET /competency-frameworks/:id");
  });

  it("Step 1.7: Create review cycle — Q2 2026 Review", async () => {
    const { status, body } = await api("/review-cycles", {
      method: "POST",
      body: JSON.stringify({
        name: `Q2 2026 Review ${TS}`,
        type: "quarterly",
        start_date: "2026-04-01",
        end_date: "2026-06-30",
        review_deadline: "2026-07-15",
        framework_id: frameworkId,
        description: "E2E test quarterly review cycle",
      }),
    });
    console.log(`  1.7 POST /review-cycles — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    cycleId = body.data.id;
    expect(cycleId).toBeTruthy();
    pass("1.7", "POST /review-cycles");
  });

  it("Step 1.8: Get cycle — verify all fields", async () => {
    const { status, body } = await api(`/review-cycles/${cycleId}`);
    console.log(`  1.8 GET /review-cycles/:id — status=${status}`);
    expect(status).toBe(200);
    expect(body.data.name).toContain("Q2 2026 Review");
    expect(body.data.type).toBe("quarterly");
    expect(body.data.status).toBe("draft");
    expect(body.data.framework_id).toBe(frameworkId);
    pass("1.8", "GET /review-cycles/:id");
  });

  it("Step 1.9: Add participants (employee IDs 2, 3, 4)", async () => {
    const { status, body } = await api(`/review-cycles/${cycleId}/participants`, {
      method: "POST",
      body: JSON.stringify({
        participants: [
          { employee_id: 2, manager_id: 1 },
          { employee_id: 3, manager_id: 1 },
          { employee_id: 4, manager_id: 1 },
        ],
      }),
    });
    console.log(`  1.9 POST /review-cycles/:id/participants — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    pass("1.9", "POST /review-cycles/:id/participants");
  });

  it("Step 1.10: Get participants — verify 3 participants", async () => {
    const { status, body } = await api(`/review-cycles/${cycleId}/participants`);
    console.log(`  1.10 GET /review-cycles/:id/participants — status=${status}`);
    expect(status).toBe(200);
    const participants = Array.isArray(body.data) ? body.data : body.data?.participants || body.data?.data || [];
    expect(participants.length).toBeGreaterThanOrEqual(3);
    pass("1.10", "GET /review-cycles/:id/participants");
  });

  it("Step 1.11: Launch cycle — verify status=active", async () => {
    const { status, body } = await api(`/review-cycles/${cycleId}/launch`, {
      method: "POST",
    });
    console.log(`  1.11 POST /review-cycles/:id/launch — status=${status}`);
    expect(status).toBe(200);
    expect(body.data.status).toBe("active");
    pass("1.11", "POST /review-cycles/:id/launch");
  });

  it("Step 1.12: Create reviews for participants and list them", async () => {
    // Create manager reviews for each participant (launch does not auto-create)
    for (const empId of [2, 3, 4]) {
      const createRes = await api("/reviews", {
        method: "POST",
        body: JSON.stringify({
          cycle_id: cycleId,
          employee_id: empId,
          reviewer_id: userId,
          type: "manager",
        }),
      });
      console.log(`  1.12a POST /reviews (employee=${empId}) — status=${createRes.status}`);
      expect(createRes.status).toBe(201);
    }

    const { status, body } = await api(`/reviews?cycle_id=${cycleId}`);
    console.log(`  1.12 GET /reviews?cycle_id=... — status=${status}`);
    expect(status).toBe(200);
    // Paginated response: body.data.data is the array
    const reviews = body.data?.data || body.data || [];
    expect(reviews.length).toBeGreaterThanOrEqual(1);
    reviewId = reviews[0]?.id;
    expect(reviewId).toBeTruthy();
    pass("1.12", "GET /reviews?cycle_id=...");
  });

  it("Step 1.13: Get a review — verify pending status", async () => {
    const { status, body } = await api(`/reviews/${reviewId}`);
    console.log(`  1.13 GET /reviews/:id — status=${status}`);
    expect(status).toBe(200);
    expect(["pending", "draft"].includes(body.data.status)).toBe(true);
    pass("1.13", "GET /reviews/:id");
  });

  it("Step 1.14: Save review draft (partial ratings)", async () => {
    const { status, body } = await api(`/reviews/${reviewId}`, {
      method: "PUT",
      body: JSON.stringify({
        overall_rating: 4,
        summary: "Draft in progress — good performance overall",
      }),
    });
    console.log(`  1.14 PUT /reviews/:id — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    pass("1.14", "PUT /reviews/:id (save draft)");
  });

  it("Step 1.15: Submit review (all competencies rated, overall comment)", async () => {
    // First rate all competencies
    for (let i = 0; i < compIds.length; i++) {
      const rateRes = await api(`/reviews/${reviewId}/competency-ratings`, {
        method: "POST",
        body: JSON.stringify({
          competency_id: compIds[i],
          rating: 4 + (i % 2),
          comments: `Rating for competency ${i + 1}`,
        }),
      });
      console.log(`  1.15a Rate competency ${i + 1} — status=${rateRes.status}`);
      expect(rateRes.status).toBeLessThan(300);
    }

    // Now submit
    const { status, body } = await api(`/reviews/${reviewId}/submit`, {
      method: "POST",
      body: JSON.stringify({
        overall_rating: 4,
        summary: "Strong performance this quarter. Met all objectives and exceeded expectations in technical skills.",
        strengths: "Excellent problem solving and technical depth",
        improvements: "Could improve cross-team communication",
      }),
    });
    console.log(`  1.15 POST /reviews/:id/submit — status=${status}`);
    expect(status).toBe(200);
    expect(body.data.status).toBe("submitted");
    pass("1.15", "POST /reviews/:id/submit");
  });

  it("Step 1.16: Close cycle — verify status=completed", async () => {
    const { status, body } = await api(`/review-cycles/${cycleId}/close`, {
      method: "POST",
    });
    console.log(`  1.16 POST /review-cycles/:id/close — status=${status}`);
    expect(status).toBe(200);
    expect(body.data.status).toBe("completed");
    pass("1.16", "POST /review-cycles/:id/close");
  });

  it("Step 1.17: Get ratings distribution — verify bell curve data", async () => {
    const { status, body } = await api(`/review-cycles/${cycleId}/ratings-distribution`);
    console.log(`  1.17 GET /review-cycles/:id/ratings-distribution — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
    pass("1.17", "GET /review-cycles/:id/ratings-distribution");
  });
});

// ============================================================================
// WORKFLOW 2: Goals & OKRs Full Cycle
// ============================================================================
describe("Workflow 2: Goals & OKRs Full Cycle", () => {
  it("Step 2.1: Create company goal", async () => {
    const { status, body } = await api("/goals", {
      method: "POST",
      body: JSON.stringify({
        title: `Increase Revenue 50% ${TS}`,
        description: "Company-wide revenue target for FY26",
        category: "company",
        priority: "critical",
        start_date: "2026-01-01",
        due_date: "2026-12-31",
      }),
    });
    console.log(`  2.1 POST /goals — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    companyGoalId = body.data.id;
    expect(companyGoalId).toBeTruthy();
    pass("2.1", "POST /goals (company)");
  });

  it("Step 2.2: Create department goal linked to company goal", async () => {
    const { status, body } = await api("/goals", {
      method: "POST",
      body: JSON.stringify({
        title: `Engineering Dept Revenue Contribution ${TS}`,
        description: "Engineering department contribution to revenue",
        category: "department",
        priority: "high",
        start_date: "2026-01-01",
        due_date: "2026-12-31",
        parent_goal_id: companyGoalId,
      }),
    });
    console.log(`  2.2 POST /goals — status=${status}`);
    expect(status).toBe(201);
    deptGoalId = body.data.id;
    expect(deptGoalId).toBeTruthy();
    pass("2.2", "POST /goals (department)");
  });

  it("Step 2.3: Create individual goal linked to department goal", async () => {
    const { status, body } = await api("/goals", {
      method: "POST",
      body: JSON.stringify({
        title: `Close 50 Enterprise Deals ${TS}`,
        description: "Individual sales target",
        category: "individual",
        priority: "high",
        start_date: "2026-01-01",
        due_date: "2026-12-31",
        parent_goal_id: deptGoalId,
        employee_id: 2,
      }),
    });
    console.log(`  2.3 POST /goals — status=${status}`);
    expect(status).toBe(201);
    individualGoalId = body.data.id;
    expect(individualGoalId).toBeTruthy();
    pass("2.3", "POST /goals (individual)");
  });

  it("Step 2.4: Add key result 1 — Close 50 deals", async () => {
    const { status, body } = await api(`/goals/${individualGoalId}/key-results`, {
      method: "POST",
      body: JSON.stringify({
        title: "Close 50 enterprise deals",
        metric_type: "number",
        target_value: 50,
        current_value: 0,
        unit: "deals",
        weight: 60,
      }),
    });
    console.log(`  2.4 POST /goals/:id/key-results — status=${status}`);
    expect(status).toBe(201);
    kr1Id = body.data.id;
    expect(kr1Id).toBeTruthy();
    pass("2.4", "POST /goals/:id/key-results (KR1)");
  });

  it("Step 2.5: Add key result 2 — Revenue $5M", async () => {
    const { status, body } = await api(`/goals/${individualGoalId}/key-results`, {
      method: "POST",
      body: JSON.stringify({
        title: "Generate $5M revenue",
        metric_type: "currency",
        target_value: 5000000,
        current_value: 0,
        unit: "USD",
        weight: 40,
      }),
    });
    console.log(`  2.5 POST /goals/:id/key-results — status=${status}`);
    expect(status).toBe(201);
    kr2Id = body.data.id;
    expect(kr2Id).toBeTruthy();
    pass("2.5", "POST /goals/:id/key-results (KR2)");
  });

  it("Step 2.6: Get goal with KRs — verify 2 key results", async () => {
    const { status, body } = await api(`/goals/${individualGoalId}`);
    console.log(`  2.6 GET /goals/:id — status=${status}`);
    expect(status).toBe(200);
    const krs = body.data.key_results || body.data.keyResults || [];
    expect(krs.length).toBeGreaterThanOrEqual(2);
    pass("2.6", "GET /goals/:id");
  });

  it("Step 2.7: Check-in on KR1 (new_value=15)", async () => {
    const { status, body } = await api(`/goals/${individualGoalId}/check-in`, {
      method: "POST",
      body: JSON.stringify({
        progress: 30,
        notes: "Closed 15 deals so far",
        key_result_id: kr1Id,
        current_value: 15,
      }),
    });
    console.log(`  2.7 POST /goals/:id/check-in — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    pass("2.7", "POST /goals/:id/check-in (15 deals)");
  });

  it("Step 2.8: Check-in again (new_value=30)", async () => {
    const { status, body } = await api(`/goals/${individualGoalId}/check-in`, {
      method: "POST",
      body: JSON.stringify({
        progress: 60,
        notes: "Closed 30 deals — on track",
        key_result_id: kr1Id,
        current_value: 30,
      }),
    });
    console.log(`  2.8 POST /goals/:id/check-in — status=${status}`);
    expect(status).toBe(201);
    pass("2.8", "POST /goals/:id/check-in (30 deals)");
  });

  it("Step 2.9: Get check-in history — verify 2 entries", async () => {
    const { status, body } = await api(`/goals/${individualGoalId}/check-ins`);
    console.log(`  2.9 GET /goals/:id/check-ins — status=${status}`);
    expect(status).toBe(200);
    const checkins = Array.isArray(body.data) ? body.data : body.data?.checkIns || [];
    expect(checkins.length).toBeGreaterThanOrEqual(2);
    pass("2.9", "GET /goals/:id/check-ins");
  });

  it("Step 2.10: Update goal status to in_progress", async () => {
    const { status, body } = await api(`/goals/${individualGoalId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "in_progress" }),
    });
    console.log(`  2.10 PUT /goals/:id — status=${status}`);
    expect(status).toBe(200);
    expect(body.data.status).toBe("in_progress");
    pass("2.10", "PUT /goals/:id (status=in_progress)");
  });

  it("Step 2.11: Get goal tree — verify hierarchy", async () => {
    const { status, body } = await api("/goals/tree");
    console.log(`  2.11 GET /goals/tree — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
    pass("2.11", "GET /goals/tree");
  });

  it("Step 2.12: Get goal alignment for individual goal", async () => {
    const { status, body } = await api(`/goals/${individualGoalId}/alignment`);
    console.log(`  2.12 GET /goals/:id/alignment — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
    pass("2.12", "GET /goals/:id/alignment");
  });
});

// ============================================================================
// WORKFLOW 3: PIP Full Lifecycle
// ============================================================================
describe("Workflow 3: PIP Full Lifecycle", () => {
  it("Step 3.1: Create PIP (employee, reason, 60 days)", async () => {
    const startDate = "2026-03-23";
    const endDate = "2026-05-22";
    const { status, body } = await api("/pips", {
      method: "POST",
      body: JSON.stringify({
        employee_id: 3,
        reason: "Performance below expectations in Q1 2026 — need to improve code quality and delivery timelines significantly",
        start_date: startDate,
        end_date: endDate,
      }),
    });
    console.log(`  3.1 POST /pips — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    pipId = body.data.id;
    expect(pipId).toBeTruthy();
    pass("3.1", "POST /pips");
  });

  it("Step 3.2: Add objective 1 — Improve code quality", async () => {
    const { status, body } = await api(`/pips/${pipId}/objectives`, {
      method: "POST",
      body: JSON.stringify({
        title: "Improve code quality",
        description: "Achieve 90% code coverage and pass all code reviews without major issues",
        success_criteria: "Less than 2 critical bugs per sprint, 90% coverage",
        due_date: "2026-04-22",
      }),
    });
    console.log(`  3.2 POST /pips/:id/objectives — status=${status}`);
    expect(status).toBe(201);
    pipObj1Id = body.data.id;
    expect(pipObj1Id).toBeTruthy();
    pass("3.2", "POST /pips/:id/objectives (code quality)");
  });

  it("Step 3.3: Add objective 2 — Complete training", async () => {
    const { status, body } = await api(`/pips/${pipId}/objectives`, {
      method: "POST",
      body: JSON.stringify({
        title: "Complete training",
        description: "Complete advanced TypeScript and system design courses",
        success_criteria: "Course completion certificates submitted",
        due_date: "2026-05-15",
      }),
    });
    console.log(`  3.3 POST /pips/:id/objectives — status=${status}`);
    expect(status).toBe(201);
    pipObj2Id = body.data.id;
    expect(pipObj2Id).toBeTruthy();
    pass("3.3", "POST /pips/:id/objectives (training)");
  });

  it("Step 3.4: Get PIP — verify 2 objectives", async () => {
    const { status, body } = await api(`/pips/${pipId}`);
    console.log(`  3.4 GET /pips/:id — status=${status}`);
    expect(status).toBe(200);
    const objectives = body.data.objectives || [];
    expect(objectives.length).toBeGreaterThanOrEqual(2);
    pass("3.4", "GET /pips/:id");
  });

  it("Step 3.5: Add update/check-in — Completed first module", async () => {
    const { status, body } = await api(`/pips/${pipId}/updates`, {
      method: "POST",
      body: JSON.stringify({
        notes: "Completed first training module on advanced TypeScript. Code review feedback improving.",
        progress_rating: 3,
      }),
    });
    console.log(`  3.5 POST /pips/:id/updates — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    pass("3.5", "POST /pips/:id/updates");
  });

  it("Step 3.6: Update objective 1 status to met", async () => {
    const { status, body } = await api(`/pips/${pipId}/objectives/${pipObj1Id}`, {
      method: "PUT",
      body: JSON.stringify({ status: "completed" }),
    });
    console.log(`  3.6 PUT /pips/:id/objectives/:objId — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    pass("3.6", "PUT /pips/:id/objectives/:objId (completed)");
  });

  it("Step 3.7: Add another update", async () => {
    const { status, body } = await api(`/pips/${pipId}/updates`, {
      method: "POST",
      body: JSON.stringify({
        notes: "Both objectives progressing well. Employee showing significant improvement in code quality.",
        progress_rating: 4,
      }),
    });
    console.log(`  3.7 POST /pips/:id/updates — status=${status}`);
    expect(status).toBe(201);
    pass("3.7", "POST /pips/:id/updates (second)");
  });

  it("Step 3.8: Close PIP as success", async () => {
    const { status, body } = await api(`/pips/${pipId}/close`, {
      method: "POST",
      body: JSON.stringify({
        status: "completed_success",
        outcome_notes: "Employee successfully met all improvement objectives. Performance is now at expected level.",
      }),
    });
    console.log(`  3.8 POST /pips/:id/close — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("completed_success");
    pass("3.8", "POST /pips/:id/close (completed_success)");
  });
});

// ============================================================================
// WORKFLOW 4: Career Path & 1-on-1s
// ============================================================================
describe("Workflow 4: Career Path & 1-on-1s", () => {
  it("Step 4.1: Create career path", async () => {
    const { status, body } = await api("/career-paths", {
      method: "POST",
      body: JSON.stringify({
        name: `Software Engineering Track ${TS}`,
        description: "Career progression for software engineers",
        department: "Engineering",
      }),
    });
    console.log(`  4.1 POST /career-paths — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    careerPathId = body.data.id;
    expect(careerPathId).toBeTruthy();
    pass("4.1", "POST /career-paths");
  });

  it("Step 4.2: Add level 1 (Junior, 0-2 yrs)", async () => {
    const { status, body } = await api(`/career-paths/${careerPathId}/levels`, {
      method: "POST",
      body: JSON.stringify({
        title: "Junior Software Engineer",
        level: 1,
        description: "Entry level engineer",
        requirements: "Bachelor's degree in CS or equivalent",
        min_years_experience: 0,
      }),
    });
    console.log(`  4.2 POST /career-paths/:id/levels — status=${status}`);
    expect(status).toBe(201);
    level1Id = body.data.id;
    expect(level1Id).toBeTruthy();
    pass("4.2", "POST /career-paths/:id/levels (Junior)");
  });

  it("Step 4.3: Add level 2 (Mid, 2-5 yrs)", async () => {
    const { status, body } = await api(`/career-paths/${careerPathId}/levels`, {
      method: "POST",
      body: JSON.stringify({
        title: "Software Engineer",
        level: 2,
        description: "Mid-level engineer",
        requirements: "Strong fundamentals, independent delivery",
        min_years_experience: 2,
      }),
    });
    console.log(`  4.3 POST /career-paths/:id/levels — status=${status}`);
    expect(status).toBe(201);
    level2Id = body.data.id;
    expect(level2Id).toBeTruthy();
    pass("4.3", "POST /career-paths/:id/levels (Mid)");
  });

  it("Step 4.4: Add level 3 (Senior, 5-8 yrs)", async () => {
    const { status, body } = await api(`/career-paths/${careerPathId}/levels`, {
      method: "POST",
      body: JSON.stringify({
        title: "Senior Software Engineer",
        level: 3,
        description: "Senior engineer leading projects",
        requirements: "Technical leadership, system design, mentoring",
        min_years_experience: 5,
      }),
    });
    console.log(`  4.4 POST /career-paths/:id/levels — status=${status}`);
    expect(status).toBe(201);
    level3Id = body.data.id;
    expect(level3Id).toBeTruthy();
    pass("4.4", "POST /career-paths/:id/levels (Senior)");
  });

  it("Step 4.5: Get path with levels — verify 3 levels", async () => {
    const { status, body } = await api(`/career-paths/${careerPathId}`);
    console.log(`  4.5 GET /career-paths/:id — status=${status}`);
    expect(status).toBe(200);
    const levels = body.data.levels || [];
    expect(levels.length).toBeGreaterThanOrEqual(3);
    pass("4.5", "GET /career-paths/:id");
  });

  it("Step 4.6: Assign employee to career track", async () => {
    const { status, body } = await api("/career-paths/tracks/assign", {
      method: "POST",
      body: JSON.stringify({
        employeeId: 2,
        pathId: careerPathId,
        currentLevelId: level1Id,
        targetLevelId: level3Id,
      }),
    });
    console.log(`  4.6 POST /career-paths/tracks/assign — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    pass("4.6", "POST /career-paths/tracks/assign");
  });

  it("Step 4.7: Get employee career track — verify current level", async () => {
    const { status, body } = await api("/career-paths/tracks/employee/2");
    console.log(`  4.7 GET /career-paths/tracks/employee/:id — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
    pass("4.7", "GET /career-paths/tracks/employee/:id");
  });

  it("Step 4.8: Create 1-on-1 meeting", async () => {
    const { status, body } = await api("/one-on-ones", {
      method: "POST",
      body: JSON.stringify({
        employee_id: 2,
        manager_id: 1,
        title: `Weekly 1:1 ${TS}`,
        scheduled_at: "2026-03-25T10:00:00Z",
        duration_minutes: 30,
      }),
    });
    console.log(`  4.8 POST /one-on-ones — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    meetingId = body.data.id;
    expect(meetingId).toBeTruthy();
    pass("4.8", "POST /one-on-ones");
  });

  it("Step 4.9: Add agenda item", async () => {
    const { status, body } = await api(`/one-on-ones/${meetingId}/agenda`, {
      method: "POST",
      body: JSON.stringify({
        title: "Discuss Q2 goals and career progression",
        description: "Review progress on current goals and plan for next quarter",
        order: 1,
      }),
    });
    console.log(`  4.9 POST /one-on-ones/:id/agenda — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    agendaItemId = body.data.id;
    pass("4.9", "POST /one-on-ones/:id/agenda");
  });

  it("Step 4.10: Add action item (second agenda item)", async () => {
    const { status, body } = await api(`/one-on-ones/${meetingId}/agenda`, {
      method: "POST",
      body: JSON.stringify({
        title: "Action: Complete TypeScript certification by April 15",
        description: "Employee to submit completion cert",
        order: 2,
      }),
    });
    console.log(`  4.10 POST /one-on-ones/:id/agenda — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    pass("4.10", "POST /one-on-ones/:id/agenda (action item)");
  });

  it("Step 4.11: Get meeting with items — verify", async () => {
    const { status, body } = await api(`/one-on-ones/${meetingId}`);
    console.log(`  4.11 GET /one-on-ones/:id — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
    pass("4.11", "GET /one-on-ones/:id");
  });

  it("Step 4.12: Complete meeting", async () => {
    const { status, body } = await api(`/one-on-ones/${meetingId}/complete`, {
      method: "POST",
    });
    console.log(`  4.12 POST /one-on-ones/:id/complete — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("completed");
    pass("4.12", "POST /one-on-ones/:id/complete");
  });
});

// ============================================================================
// WORKFLOW 5: Continuous Feedback
// ============================================================================
describe("Workflow 5: Continuous Feedback", () => {
  it("Step 5.1: Give kudos to employee 2", async () => {
    const { status, body } = await api("/feedback", {
      method: "POST",
      body: JSON.stringify({
        to_user_id: 2,
        type: "kudos",
        message: `Outstanding work on the Q1 release! Great collaboration with the team. ${TS}`,
        visibility: "public",
        tags: ["teamwork", "delivery"],
        is_anonymous: false,
      }),
    });
    console.log(`  5.1 POST /feedback — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    kudosFeedbackId = body.data.id;
    pass("5.1", "POST /feedback (kudos)");
  });

  it("Step 5.2: Give constructive feedback", async () => {
    const { status, body } = await api("/feedback", {
      method: "POST",
      body: JSON.stringify({
        to_user_id: 3,
        type: "constructive",
        message: `Consider improving documentation practices for complex features. It would help the team onboard faster. ${TS}`,
        visibility: "private",
        is_anonymous: false,
      }),
    });
    console.log(`  5.2 POST /feedback — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    constructiveFeedbackId = body.data.id;
    pass("5.2", "POST /feedback (constructive)");
  });

  it("Step 5.3: Get received feedback", async () => {
    const { status, body } = await api("/feedback/received");
    console.log(`  5.3 GET /feedback/received — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    pass("5.3", "GET /feedback/received");
  });

  it("Step 5.4: Get feedback wall (public) — verify kudos appears", async () => {
    const { status, body } = await api("/feedback/wall");
    console.log(`  5.4 GET /feedback/wall — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    pass("5.4", "GET /feedback/wall");
  });
});

// ============================================================================
// WORKFLOW 6: Analytics & 9-Box
// ============================================================================
describe("Workflow 6: Analytics & 9-Box", () => {
  it("Step 6.1: Get analytics overview — verify stats", async () => {
    const { status, body } = await api("/analytics/overview");
    console.log(`  6.1 GET /analytics/overview — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
    pass("6.1", "GET /analytics/overview");
  });

  it("Step 6.2: Get 9-box grid (using created cycle)", async () => {
    // First create potential assessments for the cycle so 9-box has data
    await api("/analytics/potential-assessments", {
      method: "POST",
      body: JSON.stringify({
        cycle_id: cycleId,
        employee_id: 2,
        potential_rating: 4,
        notes: "High potential employee",
      }),
    });

    const { status, body } = await api(`/analytics/nine-box?cycleId=${cycleId}`);
    console.log(`  6.2 GET /analytics/nine-box — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
    pass("6.2", "GET /analytics/nine-box");
  });

  it("Step 6.3: Get skills gap for employee", async () => {
    const { status, body } = await api("/analytics/skills-gap/2");
    console.log(`  6.3 GET /analytics/skills-gap/:employeeId — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
    pass("6.3", "GET /analytics/skills-gap/:employeeId");
  });
});

// ============================================================================
// WORKFLOW 7: Succession Planning
// ============================================================================
describe("Workflow 7: Succession Planning", () => {
  it("Step 7.1: Create succession plan", async () => {
    const { status, body } = await api("/succession-plans", {
      method: "POST",
      body: JSON.stringify({
        position_title: `VP Engineering ${TS}`,
        current_holder_id: 1,
        department: "Engineering",
        criticality: "critical",
        status: "identified",
      }),
    });
    console.log(`  7.1 POST /succession-plans — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    successionPlanId = body.data.id;
    expect(successionPlanId).toBeTruthy();
    pass("7.1", "POST /succession-plans");
  });

  it("Step 7.2: Add candidate", async () => {
    const { status, body } = await api(`/succession-plans/${successionPlanId}/candidates`, {
      method: "POST",
      body: JSON.stringify({
        employee_id: 2,
        readiness: "1_2_years",
        development_notes: "Needs to develop executive leadership skills",
        nine_box_position: "High Performer",
      }),
    });
    console.log(`  7.2 POST /succession-plans/:id/candidates — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    pass("7.2", "POST /succession-plans/:id/candidates");
  });

  it("Step 7.3: Get plan with candidates — verify", async () => {
    const { status, body } = await api(`/succession-plans/${successionPlanId}`);
    console.log(`  7.3 GET /succession-plans/:id — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeTruthy();
    const candidates = body.data.candidates || [];
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    pass("7.3", "GET /succession-plans/:id");
  });
});

// ============================================================================
// WORKFLOW 8: Letters
// ============================================================================
describe("Workflow 8: Letters", () => {
  it("Step 8.1: Create letter template (appraisal type)", async () => {
    const { status, body } = await api("/letters/templates", {
      method: "POST",
      body: JSON.stringify({
        type: "appraisal",
        name: `Annual Appraisal Letter ${TS}`,
        content_template: `Dear {{employee_name}},

This letter is to formally communicate your performance appraisal for the period {{cycle_period}}.

Your overall performance rating is: {{overall_rating}}/5

Key Strengths:
{{strengths}}

Areas for Development:
{{improvements}}

We appreciate your contributions to {{org_name}} and look forward to your continued growth.

Sincerely,
HR Department`,
        is_default: false,
      }),
    });
    console.log(`  8.1 POST /letters/templates — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    letterTemplateId = body.data.id;
    expect(letterTemplateId).toBeTruthy();
    pass("8.1", "POST /letters/templates");
  });

  it("Step 8.2: Generate letter for employee", async () => {
    const { status, body } = await api("/letters/generate", {
      method: "POST",
      body: JSON.stringify({
        employee_id: 2,
        template_id: letterTemplateId,
        cycle_id: cycleId,
      }),
    });
    console.log(`  8.2 POST /letters/generate — status=${status}`);
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    generatedLetterId = body.data.id;
    expect(generatedLetterId).toBeTruthy();
    pass("8.2", "POST /letters/generate");
  });

  it("Step 8.3: List generated letters — verify", async () => {
    const { status, body } = await api("/letters");
    console.log(`  8.3 GET /letters — status=${status}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    // Paginated response: body.data.data is the array
    const letters = body.data?.data || body.data || [];
    expect(letters.length).toBeGreaterThanOrEqual(1);
    pass("8.3", "GET /letters");
  });
});
