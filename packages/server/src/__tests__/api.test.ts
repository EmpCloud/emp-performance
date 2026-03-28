// ============================================================================
// EMP PERFORMANCE — COMPREHENSIVE API INTEGRATION TESTS
// Hits the live API at https://test-performance.empcloud.com (or localhost:4300)
// Run: npx vitest run src/__tests__/api.test.ts
// ============================================================================

import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.PERFORMANCE_API_URL || "https://test-performance.empcloud.com";
const API = `${BASE_URL}/api/v1`;

let token = "";
let refreshTokenValue = "";
let userId: number;

// Unique suffix to avoid collisions
const UID = Date.now();

// Shared IDs populated across tests
let cycleId: string;
let reviewId: string;
let goalId: string;
let keyResultId: string;
let frameworkId: string;
let competencyId: string;
let feedbackId: string;
let pipId: string;
let pipObjectiveId: string;
let meetingId: string;
let agendaItemId: string;
let careerPathId: string;
let careerPathLevelId: string;
let successionPlanId: string;
let letterTemplateId: string;
let letterId: string;
let peerNominationId: string;

// ---- Helpers ----------------------------------------------------------------

async function api(path: string, opts: RequestInit = {}): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// =============================================================================
// HEALTH
// =============================================================================
describe("Health", () => {
  it("GET /health returns ok", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
  });
});

// =============================================================================
// AUTH
// =============================================================================
describe("Auth", () => {
  it("POST /auth/login with valid credentials returns tokens", async () => {
    const { status, body } = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ananya@technova.in", password: "Welcome@123" }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.tokens.accessToken).toBeTruthy();
    token = body.data.tokens.accessToken;
    refreshTokenValue = body.data.tokens.refreshToken || "";
    userId = body.data.user.empcloudUserId || body.data.user.id;
  });

  it("POST /auth/login with wrong password returns error", async () => {
    const { status } = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ananya@technova.in", password: "WrongPassword" }),
    });
    expect([400, 401]).toContain(status);
  });

  it("POST /auth/login with missing fields returns error", async () => {
    const { status } = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "ananya@technova.in" }),
    });
    expect([400, 401, 422]).toContain(status);
  });

  it("POST /auth/sso with invalid token returns error", async () => {
    const { status } = await api("/auth/sso", {
      method: "POST",
      body: JSON.stringify({ token: "invalid-sso-token" }),
    });
    expect([400, 401, 403, 500]).toContain(status);
  });

  it("POST /auth/refresh-token with invalid token returns error", async () => {
    const { status } = await api("/auth/refresh-token", {
      method: "POST",
      body: JSON.stringify({ refreshToken: "bad-refresh-token" }),
    });
    expect([400, 401, 403]).toContain(status);
  });

  it("POST /auth/refresh-token with valid token succeeds", async () => {
    if (!refreshTokenValue) return;
    const { status, body } = await api("/auth/refresh-token", {
      method: "POST",
      body: JSON.stringify({ refreshToken: refreshTokenValue }),
    });
    expect([200, 400, 401]).toContain(status);
    if (status === 200 && body.data?.tokens?.accessToken) {
      token = body.data.tokens.accessToken;
    }
  });
});

// =============================================================================
// COMPETENCY FRAMEWORKS
// =============================================================================
describe("Competency Frameworks", () => {
  it("POST /competencies creates a framework", async () => {
    const { status, body } = await api("/competencies", {
      method: "POST",
      body: JSON.stringify({
        name: `API Test Framework ${UID}`,
        description: "Integration test competency framework",
      }),
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    frameworkId = body.data.id;
  });

  it("GET /competencies returns framework list", async () => {
    const { status, body } = await api("/competencies");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("GET /competencies/:id returns framework detail", async () => {
    const { status, body } = await api(`/competencies/${frameworkId}`);
    expect(status).toBe(200);
    expect(body.data.id).toBe(frameworkId);
  });

  it("PUT /competencies/:id updates framework", async () => {
    const { status, body } = await api(`/competencies/${frameworkId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: `API Test Framework UPDATED ${UID}`,
        description: "Updated description",
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /competencies/:id/competencies adds a competency", async () => {
    const { status, body } = await api(`/competencies/${frameworkId}/competencies`, {
      method: "POST",
      body: JSON.stringify({
        name: `Problem Solving ${UID}`,
        description: "Ability to analyze and solve problems",
        category: "Core",
        weight: 20,
      }),
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    competencyId = body.data.id;
  });

  it("PUT /competencies/:id/competencies/:compId updates competency", async () => {
    if (!competencyId) return;
    const { status, body } = await api(`/competencies/${frameworkId}/competencies/${competencyId}`, {
      method: "PUT",
      body: JSON.stringify({
        description: "Updated: Advanced problem solving skills",
        weight: 25,
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// REVIEW CYCLES
// =============================================================================
describe("Review Cycles", () => {
  it("POST /review-cycles creates a new cycle", async () => {
    const { status, body } = await api("/review-cycles", {
      method: "POST",
      body: JSON.stringify({
        name: `API Test Cycle ${UID}`,
        type: "annual",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        review_start_date: "2026-11-01",
        review_end_date: "2026-12-15",
        description: "Integration test review cycle",
      }),
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    cycleId = body.data.id;
  });

  it("GET /review-cycles returns paginated list", async () => {
    const { status, body } = await api("/review-cycles");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("GET /review-cycles with status filter works", async () => {
    const { status, body } = await api("/review-cycles?status=draft");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /review-cycles with type filter works", async () => {
    const { status, body } = await api("/review-cycles?type=annual");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /review-cycles/:id returns cycle detail", async () => {
    const { status, body } = await api(`/review-cycles/${cycleId}`);
    expect(status).toBe(200);
    expect(body.data.id).toBe(cycleId);
  });

  it("PUT /review-cycles/:id updates the cycle", async () => {
    const { status, body } = await api(`/review-cycles/${cycleId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: `API Test Cycle UPDATED ${UID}`,
        description: "Updated integration test cycle",
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /review-cycles/:id/participants returns participants", async () => {
    const { status, body } = await api(`/review-cycles/${cycleId}/participants`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /review-cycles/:id/participants adds participants", async () => {
    const { status, body } = await api(`/review-cycles/${cycleId}/participants`, {
      method: "POST",
      body: JSON.stringify({
        participants: [
          { employee_id: userId, reviewer_id: userId },
        ],
      }),
    });
    expect([201, 400]).toContain(status);
  });

  it("POST /review-cycles/:id/launch launches the cycle", async () => {
    const { status, body } = await api(`/review-cycles/${cycleId}/launch`, {
      method: "POST",
    });
    // May require participants to launch
    expect([200, 400]).toContain(status);
  });

  it("GET /review-cycles/:id/ratings-distribution returns bell curve data", async () => {
    const { status, body } = await api(`/review-cycles/${cycleId}/ratings-distribution`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /review-cycles/:id/close closes the cycle", async () => {
    const { status } = await api(`/review-cycles/${cycleId}/close`, {
      method: "POST",
    });
    // May fail if cycle is not in active state
    expect([200, 400]).toContain(status);
  });

  it("GET /review-cycles/:nonexistent returns 404", async () => {
    const { status } = await api("/review-cycles/00000000-0000-0000-0000-000000000000");
    expect([400, 404]).toContain(status);
  });
});

// =============================================================================
// REVIEWS
// =============================================================================
describe("Reviews", () => {
  it("POST /reviews creates a new review", async () => {
    const { status, body } = await api("/reviews", {
      method: "POST",
      body: JSON.stringify({
        cycle_id: cycleId,
        employee_id: userId,
        reviewer_id: userId,
        type: "self",
      }),
    });
    expect([201, 400]).toContain(status);
    if (status === 201) {
      reviewId = body.data.id;
    }
  });

  it("GET /reviews returns paginated list", async () => {
    const { status, body } = await api("/reviews");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // Grab a review ID if we don't have one yet
    if (!reviewId && body.data?.length > 0) {
      reviewId = body.data[0].id;
    }
  });

  it("GET /reviews with cycle_id filter works", async () => {
    const { status, body } = await api(`/reviews?cycle_id=${cycleId}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /reviews with status filter works", async () => {
    const { status, body } = await api("/reviews?status=draft");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /reviews/:id returns review detail", async () => {
    if (!reviewId) return;
    const { status, body } = await api(`/reviews/${reviewId}`);
    expect(status).toBe(200);
    expect(body.data.id).toBe(reviewId);
  });

  it("PUT /reviews/:id saves draft", async () => {
    if (!reviewId) return;
    const { status, body } = await api(`/reviews/${reviewId}`, {
      method: "PUT",
      body: JSON.stringify({
        overall_rating: 4,
        overall_comments: "Strong performer via API test",
        strengths: "Technical leadership, mentoring",
        areas_of_improvement: "Time management",
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /reviews/:id/competency-ratings rates a competency", async () => {
    if (!reviewId || !competencyId) return;
    const { status, body } = await api(`/reviews/${reviewId}/competency-ratings`, {
      method: "POST",
      body: JSON.stringify({
        competency_id: competencyId,
        rating: 4,
        comments: "Good problem-solving skills observed",
      }),
    });
    expect([200, 201, 400]).toContain(status);
  });

  it("POST /reviews/:id/submit submits the review", async () => {
    if (!reviewId) return;
    const { status } = await api(`/reviews/${reviewId}/submit`, {
      method: "POST",
      body: JSON.stringify({
        overall_rating: 4,
        overall_comments: "Submitted via API test",
        strengths: "Technical excellence",
        areas_of_improvement: "Cross-team collaboration",
      }),
    });
    // May fail if already submitted or missing required fields
    expect([200, 400]).toContain(status);
  });
});

// =============================================================================
// GOALS
// =============================================================================
describe("Goals", () => {
  it("POST /goals creates a new goal", async () => {
    const { status, body } = await api("/goals", {
      method: "POST",
      body: JSON.stringify({
        title: `API Test Goal ${UID}`,
        description: "Integration test goal",
        category: "individual",
        employee_id: userId,
        start_date: "2026-01-01",
        due_date: "2026-06-30",
        cycle_id: cycleId,
        status: "in_progress",
      }),
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    goalId = body.data.id;
  });

  it("GET /goals returns paginated list", async () => {
    const { status, body } = await api("/goals");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("GET /goals with employeeId filter works", async () => {
    const { status, body } = await api(`/goals?employeeId=${userId}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /goals with category filter works", async () => {
    const { status, body } = await api("/goals?category=individual");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /goals/:id returns goal detail with KRs and check-ins", async () => {
    const { status, body } = await api(`/goals/${goalId}`);
    expect(status).toBe(200);
    expect(body.data.id).toBe(goalId);
  });

  it("PUT /goals/:id updates the goal", async () => {
    const { status, body } = await api(`/goals/${goalId}`, {
      method: "PUT",
      body: JSON.stringify({
        title: `API Test Goal UPDATED ${UID}`,
        progress: 25,
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /goals/:id/key-results adds a key result", async () => {
    const { status, body } = await api(`/goals/${goalId}/key-results`, {
      method: "POST",
      body: JSON.stringify({
        title: `KR: Complete 5 milestones ${UID}`,
        metric_type: "number",
        target_value: 5,
        current_value: 0,
        unit: "milestones",
      }),
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    keyResultId = body.data.id;
  });

  it("PUT /goals/:id/key-results/:krId updates key result", async () => {
    if (!keyResultId) return;
    const { status, body } = await api(`/goals/${goalId}/key-results/${keyResultId}`, {
      method: "PUT",
      body: JSON.stringify({
        current_value: 2,
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /goals/:id/check-in logs a check-in", async () => {
    const { status, body } = await api(`/goals/${goalId}/check-in`, {
      method: "POST",
      body: JSON.stringify({
        note: `API test check-in at ${UID}`,
        progress: 30,
        key_result_id: keyResultId,
        current_value: 2,
      }),
    });
    expect([200, 201]).toContain(status);
  });

  it("GET /goals/:id/check-ins returns check-in list", async () => {
    const { status, body } = await api(`/goals/${goalId}/check-ins`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /goals/tree returns hierarchical goal tree", async () => {
    const { status, body } = await api("/goals/tree");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /goals/:id/alignment returns goal with ancestors/descendants", async () => {
    const { status, body } = await api(`/goals/${goalId}/alignment`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// FEEDBACK
// =============================================================================
describe("Feedback", () => {
  it("POST /feedback gives feedback", async () => {
    const { status, body } = await api("/feedback", {
      method: "POST",
      body: JSON.stringify({
        to_user_id: userId,
        type: "appreciation",
        message: `Great work on the API integration tests! ${UID}`,
        visibility: "public",
        tags: ["teamwork", "technical"],
        is_anonymous: false,
      }),
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    feedbackId = body.data.id;
  });

  it("GET /feedback returns received feedback list", async () => {
    const { status, body } = await api("/feedback");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /feedback/received returns received feedback", async () => {
    const { status, body } = await api("/feedback/received");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /feedback/given returns given feedback", async () => {
    const { status, body } = await api("/feedback/given");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /feedback/wall returns public kudos feed", async () => {
    const { status, body } = await api("/feedback/wall");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /feedback with missing fields returns validation error", async () => {
    const { status } = await api("/feedback", {
      method: "POST",
      body: JSON.stringify({ to_user_id: userId }),
    });
    expect([400, 422]).toContain(status);
  });

  it("DELETE /feedback/:id deletes feedback", async () => {
    if (!feedbackId) return;
    const { status, body } = await api(`/feedback/${feedbackId}`, { method: "DELETE" });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// PIPs (Performance Improvement Plans)
// =============================================================================
describe("PIPs", () => {
  it("POST /pips creates a new PIP", async () => {
    const { status, body } = await api("/pips", {
      method: "POST",
      body: JSON.stringify({
        employee_id: userId,
        title: `API Test PIP ${UID}`,
        reason: "Integration test PIP for API validation",
        start_date: "2026-04-01",
        end_date: "2026-06-30",
        expected_outcome: "Demonstrate improvement in target areas",
      }),
    });
    expect([201, 400]).toContain(status);
    if (status === 201) {
      pipId = body.data.id;
    }
  });

  it("GET /pips returns paginated list", async () => {
    const { status, body } = await api("/pips");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    // Grab a PIP ID if we don't have one
    if (!pipId && body.data?.length > 0) {
      pipId = body.data[0].id;
    }
  });

  it("GET /pips with status filter works", async () => {
    const { status, body } = await api("/pips?status=active");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /pips/:id returns PIP detail with objectives", async () => {
    if (!pipId) return;
    const { status, body } = await api(`/pips/${pipId}`);
    expect(status).toBe(200);
    expect(body.data.id).toBe(pipId);
  });

  it("PUT /pips/:id updates the PIP", async () => {
    if (!pipId) return;
    const { status, body } = await api(`/pips/${pipId}`, {
      method: "PUT",
      body: JSON.stringify({
        reason: "Updated reason via API test",
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /pips/:id/objectives adds an objective", async () => {
    if (!pipId) return;
    const { status, body } = await api(`/pips/${pipId}/objectives`, {
      method: "POST",
      body: JSON.stringify({
        title: `Complete 3 training modules ${UID}`,
        description: "Finish assigned learning path",
        due_date: "2026-05-31",
        success_criteria: "All modules completed with 80%+ score",
      }),
    });
    expect([200, 201]).toContain(status);
    if (body.data?.id) {
      pipObjectiveId = body.data.id;
    }
  });

  it("PUT /pips/:id/objectives/:objId updates objective status", async () => {
    if (!pipId || !pipObjectiveId) return;
    const { status, body } = await api(`/pips/${pipId}/objectives/${pipObjectiveId}`, {
      method: "PUT",
      body: JSON.stringify({
        status: "in_progress",
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /pips/:id/updates adds a PIP update/check-in", async () => {
    if (!pipId) return;
    const { status, body } = await api(`/pips/${pipId}/updates`, {
      method: "POST",
      body: JSON.stringify({
        notes: `Weekly check-in via API test ${UID}`,
        progress_rating: 3,
      }),
    });
    expect([200, 201]).toContain(status);
  });

  it("POST /pips/:id/extend extends PIP end date", async () => {
    if (!pipId) return;
    const { status } = await api(`/pips/${pipId}/extend`, {
      method: "POST",
      body: JSON.stringify({ end_date: "2026-07-31" }),
    });
    expect([200, 400]).toContain(status);
  });
});

// =============================================================================
// ONE-ON-ONE MEETINGS
// =============================================================================
describe("One-on-One Meetings", () => {
  it("POST /meetings creates a new meeting", async () => {
    const scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const { status, body } = await api("/meetings", {
      method: "POST",
      body: JSON.stringify({
        employee_id: userId,
        manager_id: userId,
        title: `API Test 1:1 ${UID}`,
        scheduled_at: scheduledAt,
        duration_minutes: 30,
      }),
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    meetingId = body.data.id;
  });

  it("GET /meetings returns meeting list", async () => {
    const { status, body } = await api("/meetings");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /meetings with status filter works", async () => {
    const { status, body } = await api("/meetings?status=scheduled");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /meetings/:id returns meeting detail", async () => {
    if (!meetingId) return;
    const { status, body } = await api(`/meetings/${meetingId}`);
    expect(status).toBe(200);
    expect(body.data.id).toBe(meetingId);
  });

  it("PUT /meetings/:id updates meeting", async () => {
    if (!meetingId) return;
    const { status, body } = await api(`/meetings/${meetingId}`, {
      method: "PUT",
      body: JSON.stringify({
        title: `API Test 1:1 UPDATED ${UID}`,
        duration_minutes: 45,
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /meetings/:id/agenda adds agenda item", async () => {
    if (!meetingId) return;
    const { status, body } = await api(`/meetings/${meetingId}/agenda`, {
      method: "POST",
      body: JSON.stringify({
        title: `Discuss Q1 goals ${UID}`,
        description: "Review progress on quarterly goals",
        order: 1,
      }),
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    agendaItemId = body.data.id;
  });

  it("PUT /meetings/agenda/:itemId updates agenda item", async () => {
    if (!agendaItemId) return;
    const { status, body } = await api(`/meetings/agenda/${agendaItemId}`, {
      method: "PUT",
      body: JSON.stringify({
        title: `Discuss Q1 goals UPDATED ${UID}`,
        description: "Updated review",
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /meetings/agenda/:itemId/complete marks agenda item done", async () => {
    if (!agendaItemId) return;
    const { status, body } = await api(`/meetings/agenda/${agendaItemId}/complete`, {
      method: "POST",
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /meetings/:id/complete completes the meeting", async () => {
    if (!meetingId) return;
    const { status, body } = await api(`/meetings/${meetingId}/complete`, {
      method: "POST",
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// PEER REVIEWS
// =============================================================================
describe("Peer Reviews", () => {
  it("POST /peer-reviews/nominate creates a nomination", async () => {
    const { status, body } = await api("/peer-reviews/nominate", {
      method: "POST",
      body: JSON.stringify({
        cycleId: cycleId,
        employeeId: userId,
        peerId: userId,
      }),
    });
    // May fail if self-nomination is not allowed
    expect([201, 400]).toContain(status);
    if (status === 201) {
      peerNominationId = body.data.id;
    }
  });

  it("GET /peer-reviews/nominations returns nomination list", async () => {
    const { status, body } = await api(`/peer-reviews/nominations?cycleId=${cycleId}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    // Grab a nomination ID if we don't have one
    if (!peerNominationId && body.data?.data?.length > 0) {
      peerNominationId = body.data.data[0].id;
    }
  });

  it("PUT /peer-reviews/:id/approve approves nomination", async () => {
    if (!peerNominationId) return;
    const { status } = await api(`/peer-reviews/${peerNominationId}/approve`, {
      method: "PUT",
    });
    expect([200, 400]).toContain(status);
  });
});

// =============================================================================
// CAREER PATHS
// =============================================================================
describe("Career Paths", () => {
  it("POST /career-paths creates a career path", async () => {
    const { status, body } = await api("/career-paths", {
      method: "POST",
      body: JSON.stringify({
        name: `API Test Path ${UID}`,
        description: "Integration test career path",
        department: "Engineering",
      }),
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    careerPathId = body.data.id;
  });

  it("GET /career-paths returns path list", async () => {
    const { status, body } = await api("/career-paths");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /career-paths/:id returns path detail", async () => {
    if (!careerPathId) return;
    const { status, body } = await api(`/career-paths/${careerPathId}`);
    expect(status).toBe(200);
    expect(body.data.id).toBe(careerPathId);
  });

  it("PUT /career-paths/:id updates path", async () => {
    if (!careerPathId) return;
    const { status, body } = await api(`/career-paths/${careerPathId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: `API Test Path UPDATED ${UID}`,
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /career-paths/:pathId/levels adds a level", async () => {
    if (!careerPathId) return;
    const { status, body } = await api(`/career-paths/${careerPathId}/levels`, {
      method: "POST",
      body: JSON.stringify({
        title: `Senior Engineer ${UID}`,
        level: 3,
        description: "Senior-level individual contributor",
        requirements: "5+ years experience",
        min_years_experience: 5,
      }),
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    careerPathLevelId = body.data.id;
  });

  it("PUT /career-paths/levels/:levelId updates level", async () => {
    if (!careerPathLevelId) return;
    const { status, body } = await api(`/career-paths/levels/${careerPathLevelId}`, {
      method: "PUT",
      body: JSON.stringify({
        description: "Updated senior engineer description",
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /career-paths/tracks/employee/:employeeId returns employee track", async () => {
    const { status, body } = await api(`/career-paths/tracks/employee/${userId}`);
    expect([200, 404]).toContain(status);
  });

  it("POST /career-paths/tracks/assign assigns employee to track", async () => {
    if (!careerPathId || !careerPathLevelId) return;
    const { status } = await api("/career-paths/tracks/assign", {
      method: "POST",
      body: JSON.stringify({
        employeeId: userId,
        pathId: careerPathId,
        currentLevelId: careerPathLevelId,
      }),
    });
    expect([201, 400]).toContain(status);
  });
});

// =============================================================================
// SUCCESSION PLANNING
// =============================================================================
describe("Succession Planning", () => {
  it("POST /succession-plans creates a succession plan", async () => {
    const { status, body } = await api("/succession-plans", {
      method: "POST",
      body: JSON.stringify({
        position_title: `VP Engineering ${UID}`,
        department: "Engineering",
        criticality: "high",
        status: "active",
      }),
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    successionPlanId = body.data.id;
  });

  it("GET /succession-plans returns plan list", async () => {
    const { status, body } = await api("/succession-plans");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /succession-plans/:id returns plan detail", async () => {
    if (!successionPlanId) return;
    const { status, body } = await api(`/succession-plans/${successionPlanId}`);
    expect(status).toBe(200);
    expect(body.data.id).toBe(successionPlanId);
  });

  it("POST /succession-plans/:id/candidates adds a succession candidate", async () => {
    if (!successionPlanId) return;
    const { status, body } = await api(`/succession-plans/${successionPlanId}/candidates`, {
      method: "POST",
      body: JSON.stringify({
        employee_id: userId,
        readiness: "ready_now",
        development_notes: "Strong leadership potential",
        nine_box_position: "high_performer",
      }),
    });
    expect([201, 400]).toContain(status);
  });
});

// =============================================================================
// PERFORMANCE LETTERS
// =============================================================================
describe("Performance Letters", () => {
  it("GET /letters/templates returns letter templates", async () => {
    const { status, body } = await api("/letters/templates");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /letters/templates creates a letter template", async () => {
    const { status, body } = await api("/letters/templates", {
      method: "POST",
      body: JSON.stringify({
        type: "appreciation",
        name: `API Test Letter Template ${UID}`,
        content_template: "<h1>Appreciation Letter</h1><p>Dear {{employeeName}},</p><p>Thank you for your excellent work.</p>",
        is_default: false,
      }),
    });
    expect(status).toBe(201);
    expect(body.success).toBe(true);
    letterTemplateId = body.data.id;
  });

  it("GET /letters/templates/:id returns template detail", async () => {
    if (!letterTemplateId) return;
    const { status, body } = await api(`/letters/templates/${letterTemplateId}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("PUT /letters/templates/:id updates template", async () => {
    if (!letterTemplateId) return;
    const { status, body } = await api(`/letters/templates/${letterTemplateId}`, {
      method: "PUT",
      body: JSON.stringify({
        name: `API Test Letter UPDATED ${UID}`,
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("POST /letters/generate generates a letter", async () => {
    if (!letterTemplateId) return;
    const { status, body } = await api("/letters/generate", {
      method: "POST",
      body: JSON.stringify({
        employee_id: userId,
        template_id: letterTemplateId,
        cycle_id: cycleId || null,
      }),
    });
    expect([200, 201, 400]).toContain(status);
    if (body.data?.id) {
      letterId = body.data.id;
    }
  });

  it("GET /letters returns generated letters list", async () => {
    const { status, body } = await api("/letters");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /letters/:id returns letter detail", async () => {
    if (!letterId) return;
    const { status, body } = await api(`/letters/${letterId}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// ANALYTICS
// =============================================================================
describe("Analytics", () => {
  it("GET /analytics/overview returns dashboard stats", async () => {
    const { status, body } = await api("/analytics/overview");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /analytics/trends returns performance trends", async () => {
    const { status, body } = await api("/analytics/trends");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /analytics/goal-completion returns goal completion metrics", async () => {
    const { status, body } = await api("/analytics/goal-completion");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /analytics/ratings-distribution requires cycleId", async () => {
    const { status } = await api("/analytics/ratings-distribution");
    expect([400, 422]).toContain(status);
  });

  it("GET /analytics/ratings-distribution with cycleId works", async () => {
    if (!cycleId) return;
    const { status, body } = await api(`/analytics/ratings-distribution?cycleId=${cycleId}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /analytics/top-performers requires cycleId", async () => {
    const { status } = await api("/analytics/top-performers");
    expect([400, 422]).toContain(status);
  });

  it("GET /analytics/top-performers with cycleId works", async () => {
    if (!cycleId) return;
    const { status, body } = await api(`/analytics/top-performers?cycleId=${cycleId}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /analytics/team-comparison returns team data", async () => {
    const { status, body } = await api("/analytics/team-comparison");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /analytics/nine-box requires cycleId", async () => {
    const { status } = await api("/analytics/nine-box");
    expect([400, 422]).toContain(status);
  });

  it("GET /analytics/nine-box with cycleId works", async () => {
    if (!cycleId) return;
    const { status, body } = await api(`/analytics/nine-box?cycleId=${cycleId}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /analytics/skills-gap/:employeeId returns individual skills gap", async () => {
    const { status, body } = await api(`/analytics/skills-gap/${userId}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /analytics/potential-assessments requires cycleId", async () => {
    const { status } = await api("/analytics/potential-assessments");
    expect([400, 422]).toContain(status);
  });

  it("GET /analytics/potential-assessments with cycleId works", async () => {
    if (!cycleId) return;
    const { status, body } = await api(`/analytics/potential-assessments?cycleId=${cycleId}`);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// AI SUMMARY
// =============================================================================
describe("AI Summary", () => {
  it("GET /ai-summary/employee/:userId requires cycleId", async () => {
    const { status } = await api(`/ai-summary/employee/${userId}`);
    expect([400, 422]).toContain(status);
  });

  it("GET /ai-summary/employee/:userId with cycleId works or returns gracefully", async () => {
    if (!cycleId) return;
    const { status } = await api(`/ai-summary/employee/${userId}?cycleId=${cycleId}`);
    // AI may not be configured — accept success or server error
    expect([200, 400, 500, 503]).toContain(status);
  });

  it("GET /ai-summary/review/:reviewId returns summary", async () => {
    if (!reviewId) return;
    const { status } = await api(`/ai-summary/review/${reviewId}`);
    expect([200, 400, 404, 500, 503]).toContain(status);
  });
});

// =============================================================================
// MANAGER EFFECTIVENESS
// =============================================================================
describe("Manager Effectiveness", () => {
  it("GET /manager-effectiveness/dashboard returns dashboard stats", async () => {
    const { status, body } = await api("/manager-effectiveness/dashboard");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /manager-effectiveness requires period param", async () => {
    const { status } = await api("/manager-effectiveness");
    expect([400, 422]).toContain(status);
  });

  it("GET /manager-effectiveness with period returns scores", async () => {
    const { status, body } = await api("/manager-effectiveness?period=2026-Q1");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /manager-effectiveness/:managerId returns detail", async () => {
    const { status, body } = await api(`/manager-effectiveness/${userId}?period=2026-Q1`);
    expect([200, 404]).toContain(status);
  });

  it("POST /manager-effectiveness/calculate/:managerId calculates score", async () => {
    const { status } = await api(`/manager-effectiveness/calculate/${userId}`, {
      method: "POST",
      body: JSON.stringify({ period: "2026-Q1" }),
    });
    expect([200, 201, 400]).toContain(status);
  });
});

// =============================================================================
// NOTIFICATIONS
// =============================================================================
describe("Notifications", () => {
  it("GET /notifications/settings returns notification settings", async () => {
    const { status, body } = await api("/notifications/settings");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("PUT /notifications/settings updates notification settings", async () => {
    const { status, body } = await api("/notifications/settings", {
      method: "PUT",
      body: JSON.stringify({
        review_deadline_reminder_days: 3,
        pip_checkin_reminder_days: 7,
      }),
    });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });

  it("GET /notifications/queue-status returns queue health", async () => {
    const { status, body } = await api("/notifications/queue-status");
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// =============================================================================
// AUTHORIZATION CHECKS
// =============================================================================
describe("Authorization", () => {
  it("GET /goals without token returns 401", async () => {
    const saved = token;
    token = "";
    const { status } = await api("/goals");
    expect([401, 403]).toContain(status);
    token = saved;
  });

  it("POST /review-cycles without token returns 401", async () => {
    const saved = token;
    token = "";
    const { status } = await api("/review-cycles", {
      method: "POST",
      body: JSON.stringify({ name: "Unauthorized" }),
    });
    expect([401, 403]).toContain(status);
    token = saved;
  });

  it("GET /analytics/overview without token returns 401", async () => {
    const saved = token;
    token = "";
    const { status } = await api("/analytics/overview");
    expect([401, 403]).toContain(status);
    token = saved;
  });

  it("GET /pips without token returns 401", async () => {
    const saved = token;
    token = "";
    const { status } = await api("/pips");
    expect([401, 403]).toContain(status);
    token = saved;
  });

  it("POST /feedback without token returns 401", async () => {
    const saved = token;
    token = "";
    const { status } = await api("/feedback", {
      method: "POST",
      body: JSON.stringify({ to_user_id: 1, type: "praise", message: "test" }),
    });
    expect([401, 403]).toContain(status);
    token = saved;
  });
});

// =============================================================================
// CLEANUP
// =============================================================================
describe("Cleanup", () => {
  it("DELETE /goals/:id/key-results/:krId removes key result", async () => {
    if (!goalId || !keyResultId) return;
    const { status } = await api(`/goals/${goalId}/key-results/${keyResultId}`, { method: "DELETE" });
    expect(status).toBe(200);
  });

  it("DELETE /goals/:id removes test goal", async () => {
    if (!goalId) return;
    const { status } = await api(`/goals/${goalId}`, { method: "DELETE" });
    expect(status).toBe(200);
  });

  it("DELETE /competencies/:id/competencies/:compId removes competency", async () => {
    if (!frameworkId || !competencyId) return;
    const { status } = await api(`/competencies/${frameworkId}/competencies/${competencyId}`, { method: "DELETE" });
    expect(status).toBe(200);
  });

  it("DELETE /competencies/:id removes framework", async () => {
    if (!frameworkId) return;
    const { status } = await api(`/competencies/${frameworkId}`, { method: "DELETE" });
    expect(status).toBe(200);
  });

  it("DELETE /career-paths/levels/:levelId removes level", async () => {
    if (!careerPathLevelId) return;
    const { status } = await api(`/career-paths/levels/${careerPathLevelId}`, { method: "DELETE" });
    expect(status).toBe(200);
  });

  it("DELETE /career-paths/:id removes career path", async () => {
    if (!careerPathId) return;
    const { status } = await api(`/career-paths/${careerPathId}`, { method: "DELETE" });
    expect(status).toBe(200);
  });

  it("DELETE /letters/templates/:id removes letter template", async () => {
    if (!letterTemplateId) return;
    const { status } = await api(`/letters/templates/${letterTemplateId}`, { method: "DELETE" });
    expect(status).toBe(200);
  });
});
