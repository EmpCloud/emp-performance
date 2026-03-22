// ============================================================================
// EMP-PERFORMANCE — OpenAPI / Swagger Documentation
// ============================================================================

import { Request, Response } from "express";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "EMP Performance API",
    version: "1.0.0",
    description:
      "Performance management module for the EMP HRMS ecosystem. Manages review cycles, goals/OKRs, competencies, PIPs, career paths, 1-on-1 meetings, feedback, peer reviews, and succession planning.",
  },
  servers: [{ url: "http://localhost:3002", description: "Local development" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http" as const, scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      ApiResponse: {
        type: "object" as const,
        properties: {
          success: { type: "boolean" },
          data: { type: "object" },
        },
      },
      Error: {
        type: "object" as const,
        properties: {
          success: { type: "boolean", example: false },
          error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" } } },
        },
      },
    },
  },
  paths: {
    // =========================================================================
    // AUTH
    // =========================================================================
    "/api/v1/auth/login": {
      post: { tags: ["Auth"], summary: "Login with email and password", security: [], responses: { "200": { description: "Login successful" } } },
    },
    "/api/v1/auth/register": {
      post: { tags: ["Auth"], summary: "Register a new organization", security: [], responses: { "201": { description: "Registered" } } },
    },
    "/api/v1/auth/sso": {
      post: { tags: ["Auth"], summary: "SSO authentication via EMP Cloud token", security: [], responses: { "200": { description: "SSO login successful" } } },
    },
    "/api/v1/auth/refresh-token": {
      post: { tags: ["Auth"], summary: "Refresh access token", security: [], responses: { "200": { description: "New tokens" } } },
    },

    // =========================================================================
    // REVIEW CYCLES
    // =========================================================================
    "/api/v1/review-cycles": {
      get: {
        tags: ["Review Cycles"],
        summary: "List review cycles (paginated)",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "per_page", in: "query", schema: { type: "integer" } },
          { name: "status", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Review cycle list" } },
      },
      post: { tags: ["Review Cycles"], summary: "Create a review cycle", responses: { "201": { description: "Review cycle created" } } },
    },
    "/api/v1/review-cycles/{id}": {
      get: {
        tags: ["Review Cycles"],
        summary: "Get review cycle by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Review cycle data" } },
      },
      put: {
        tags: ["Review Cycles"],
        summary: "Update review cycle",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Review cycle updated" } },
      },
    },
    "/api/v1/review-cycles/{id}/launch": {
      post: {
        tags: ["Review Cycles"],
        summary: "Launch a review cycle",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Cycle launched" } },
      },
    },
    "/api/v1/review-cycles/{id}/close": {
      post: {
        tags: ["Review Cycles"],
        summary: "Close a review cycle",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Cycle closed" } },
      },
    },
    "/api/v1/review-cycles/{id}/participants": {
      get: {
        tags: ["Review Cycles"],
        summary: "List cycle participants",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Participant list" } },
      },
      post: {
        tags: ["Review Cycles"],
        summary: "Add participants to cycle",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Participants added" } },
      },
    },
    "/api/v1/review-cycles/{id}/participants/{userId}": {
      delete: {
        tags: ["Review Cycles"],
        summary: "Remove participant from cycle",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "userId", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Participant removed" } },
      },
    },
    "/api/v1/review-cycles/{id}/ratings-distribution": {
      get: {
        tags: ["Review Cycles"],
        summary: "Get ratings distribution for a cycle",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Ratings distribution" } },
      },
    },

    // =========================================================================
    // REVIEWS
    // =========================================================================
    "/api/v1/reviews": {
      get: {
        tags: ["Reviews"],
        summary: "List reviews (paginated)",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "cycle_id", in: "query", schema: { type: "integer" } },
          { name: "reviewee_id", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Review list" } },
      },
    },
    "/api/v1/reviews/{id}": {
      get: {
        tags: ["Reviews"],
        summary: "Get review by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Review data" } },
      },
      put: {
        tags: ["Reviews"],
        summary: "Update review (save draft)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Review updated" } },
      },
    },
    "/api/v1/reviews/{id}/submit": {
      post: {
        tags: ["Reviews"],
        summary: "Submit a review",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Review submitted" } },
      },
    },
    "/api/v1/reviews/{id}/competency-ratings": {
      post: {
        tags: ["Reviews"],
        summary: "Submit competency ratings for a review",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Ratings submitted" } },
      },
    },

    // =========================================================================
    // COMPETENCIES
    // =========================================================================
    "/api/v1/competencies": {
      get: { tags: ["Competencies"], summary: "List competency frameworks", responses: { "200": { description: "Competency list" } } },
      post: { tags: ["Competencies"], summary: "Create a competency framework", responses: { "201": { description: "Competency created" } } },
    },
    "/api/v1/competencies/{id}": {
      get: {
        tags: ["Competencies"],
        summary: "Get competency by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Competency data" } },
      },
      put: {
        tags: ["Competencies"],
        summary: "Update competency",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Competency updated" } },
      },
      delete: {
        tags: ["Competencies"],
        summary: "Delete competency",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Competency deleted" } },
      },
    },
    "/api/v1/competencies/{id}/levels": {
      post: {
        tags: ["Competencies"],
        summary: "Add level to competency",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Level added" } },
      },
    },

    // =========================================================================
    // GOALS
    // =========================================================================
    "/api/v1/goals": {
      get: {
        tags: ["Goals"],
        summary: "List goals (paginated)",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "owner_id", in: "query", schema: { type: "integer" } },
          { name: "status", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Goal list" } },
      },
      post: { tags: ["Goals"], summary: "Create a goal", responses: { "201": { description: "Goal created" } } },
    },
    "/api/v1/goals/tree": {
      get: { tags: ["Goals"], summary: "Get goal alignment tree", responses: { "200": { description: "Goal tree" } } },
    },
    "/api/v1/goals/{id}": {
      get: {
        tags: ["Goals"],
        summary: "Get goal by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Goal data" } },
      },
      put: {
        tags: ["Goals"],
        summary: "Update goal",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Goal updated" } },
      },
      delete: {
        tags: ["Goals"],
        summary: "Delete goal",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Goal deleted" } },
      },
    },
    "/api/v1/goals/{id}/alignment": {
      get: {
        tags: ["Goals"],
        summary: "Get goal alignment details",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Alignment data" } },
      },
    },
    "/api/v1/goals/{id}/key-results": {
      post: {
        tags: ["Goals"],
        summary: "Add key result to goal",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Key result added" } },
      },
    },
    "/api/v1/goals/{id}/key-results/{krId}": {
      put: {
        tags: ["Goals"],
        summary: "Update key result",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "krId", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Key result updated" } },
      },
      delete: {
        tags: ["Goals"],
        summary: "Delete key result",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "krId", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Key result deleted" } },
      },
    },
    "/api/v1/goals/{id}/check-in": {
      post: {
        tags: ["Goals"],
        summary: "Submit a goal check-in",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Check-in submitted" } },
      },
    },
    "/api/v1/goals/{id}/check-ins": {
      get: {
        tags: ["Goals"],
        summary: "List goal check-ins",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Check-in list" } },
      },
    },

    // =========================================================================
    // PIPs
    // =========================================================================
    "/api/v1/pips": {
      get: { tags: ["PIPs"], summary: "List performance improvement plans (paginated)", responses: { "200": { description: "PIP list" } } },
      post: { tags: ["PIPs"], summary: "Create a PIP", responses: { "201": { description: "PIP created" } } },
    },
    "/api/v1/pips/{id}": {
      get: {
        tags: ["PIPs"],
        summary: "Get PIP by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "PIP data" } },
      },
      put: {
        tags: ["PIPs"],
        summary: "Update PIP",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "PIP updated" } },
      },
    },
    "/api/v1/pips/{id}/goals": {
      post: {
        tags: ["PIPs"],
        summary: "Add goal to PIP",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Goal added" } },
      },
    },
    "/api/v1/pips/{id}/updates": {
      post: {
        tags: ["PIPs"],
        summary: "Add progress update to PIP",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Update added" } },
      },
    },
    "/api/v1/pips/{id}/close": {
      post: {
        tags: ["PIPs"],
        summary: "Close a PIP (pass/fail)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "PIP closed" } },
      },
    },
    "/api/v1/pips/{id}/extend": {
      post: {
        tags: ["PIPs"],
        summary: "Extend PIP duration",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "PIP extended" } },
      },
    },

    // =========================================================================
    // CAREER PATHS
    // =========================================================================
    "/api/v1/career-paths": {
      get: { tags: ["Career Paths"], summary: "List career paths", responses: { "200": { description: "Career path list" } } },
      post: { tags: ["Career Paths"], summary: "Create a career path", responses: { "201": { description: "Career path created" } } },
    },
    "/api/v1/career-paths/{id}": {
      get: {
        tags: ["Career Paths"],
        summary: "Get career path by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Career path data" } },
      },
      put: {
        tags: ["Career Paths"],
        summary: "Update career path",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Career path updated" } },
      },
      delete: {
        tags: ["Career Paths"],
        summary: "Delete career path",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Career path deleted" } },
      },
    },
    "/api/v1/career-paths/{id}/milestones": {
      post: {
        tags: ["Career Paths"],
        summary: "Add milestone to career path",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Milestone added" } },
      },
    },
    "/api/v1/career-paths/{id}/assign": {
      post: {
        tags: ["Career Paths"],
        summary: "Assign employee to career path",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Assigned" } },
      },
    },

    // =========================================================================
    // ONE-ON-ONE MEETINGS
    // =========================================================================
    "/api/v1/meetings": {
      get: { tags: ["1-on-1 Meetings"], summary: "List 1-on-1 meetings", responses: { "200": { description: "Meeting list" } } },
      post: { tags: ["1-on-1 Meetings"], summary: "Schedule a 1-on-1 meeting", responses: { "201": { description: "Meeting created" } } },
    },
    "/api/v1/meetings/{id}": {
      get: {
        tags: ["1-on-1 Meetings"],
        summary: "Get meeting by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Meeting data" } },
      },
      put: {
        tags: ["1-on-1 Meetings"],
        summary: "Update meeting",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Meeting updated" } },
      },
    },
    "/api/v1/meetings/{id}/complete": {
      post: {
        tags: ["1-on-1 Meetings"],
        summary: "Mark meeting as complete",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Meeting completed" } },
      },
    },
    "/api/v1/meetings/{meetingId}/agenda": {
      post: {
        tags: ["1-on-1 Meetings"],
        summary: "Add agenda item to meeting",
        parameters: [{ name: "meetingId", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Agenda item added" } },
      },
    },

    // =========================================================================
    // FEEDBACK
    // =========================================================================
    "/api/v1/feedback": {
      post: { tags: ["Feedback"], summary: "Give continuous feedback", responses: { "201": { description: "Feedback submitted" } } },
    },
    "/api/v1/feedback/received": {
      get: { tags: ["Feedback"], summary: "List feedback received", responses: { "200": { description: "Received feedback" } } },
    },
    "/api/v1/feedback/given": {
      get: { tags: ["Feedback"], summary: "List feedback given", responses: { "200": { description: "Given feedback" } } },
    },
    "/api/v1/feedback/wall": {
      get: { tags: ["Feedback"], summary: "Public feedback wall", responses: { "200": { description: "Feedback wall" } } },
    },
    "/api/v1/feedback/{id}": {
      delete: {
        tags: ["Feedback"],
        summary: "Delete feedback",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Feedback deleted" } },
      },
    },

    // =========================================================================
    // PEER REVIEWS
    // =========================================================================
    "/api/v1/peer-reviews/nominate": {
      post: { tags: ["Peer Reviews"], summary: "Nominate peer reviewers", responses: { "201": { description: "Nomination submitted" } } },
    },
    "/api/v1/peer-reviews/nominations": {
      get: { tags: ["Peer Reviews"], summary: "List peer review nominations", responses: { "200": { description: "Nomination list" } } },
    },
    "/api/v1/peer-reviews/nominations/{id}/approve": {
      put: {
        tags: ["Peer Reviews"],
        summary: "Approve peer nomination",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Nomination approved" } },
      },
    },
    "/api/v1/peer-reviews/{id}/submit": {
      put: {
        tags: ["Peer Reviews"],
        summary: "Submit peer review",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Peer review submitted" } },
      },
    },

    // =========================================================================
    // SUCCESSION
    // =========================================================================
    "/api/v1/succession-plans": {
      get: { tags: ["Succession"], summary: "List succession plans", responses: { "200": { description: "Succession plan list" } } },
      post: { tags: ["Succession"], summary: "Create succession plan", responses: { "201": { description: "Plan created" } } },
    },
    "/api/v1/succession-plans/{id}": {
      get: {
        tags: ["Succession"],
        summary: "Get succession plan by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Plan data" } },
      },
    },
    "/api/v1/succession-plans/{id}/candidates": {
      post: {
        tags: ["Succession"],
        summary: "Add candidate to succession plan",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "201": { description: "Candidate added" } },
      },
    },

    // =========================================================================
    // NOTIFICATIONS
    // =========================================================================
    "/api/v1/notifications": {
      get: { tags: ["Notifications"], summary: "List notifications", responses: { "200": { description: "Notification list" } } },
    },
    "/api/v1/notifications/{id}/read": {
      put: {
        tags: ["Notifications"],
        summary: "Mark notification as read",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Marked as read" } },
      },
    },
    "/api/v1/notifications/read-all": {
      post: { tags: ["Notifications"], summary: "Mark all notifications as read", responses: { "200": { description: "All marked as read" } } },
    },

    // =========================================================================
    // ANALYTICS
    // =========================================================================
    "/api/v1/analytics/overview": {
      get: { tags: ["Analytics"], summary: "Performance overview metrics", responses: { "200": { description: "Overview data" } } },
    },
    "/api/v1/analytics/ratings-distribution": {
      get: { tags: ["Analytics"], summary: "Overall ratings distribution", responses: { "200": { description: "Distribution data" } } },
    },
    "/api/v1/analytics/trends": {
      get: { tags: ["Analytics"], summary: "Performance trends over time", responses: { "200": { description: "Trend data" } } },
    },
    "/api/v1/analytics/goal-completion": {
      get: { tags: ["Analytics"], summary: "Goal completion rates", responses: { "200": { description: "Completion data" } } },
    },
    "/api/v1/analytics/top-performers": {
      get: { tags: ["Analytics"], summary: "Top performers leaderboard", responses: { "200": { description: "Top performers" } } },
    },

    // =========================================================================
    // HEALTH
    // =========================================================================
    "/health": {
      get: { tags: ["Health"], summary: "Health check", security: [], responses: { "200": { description: "Server is healthy" } } },
    },
  },
};

export function swaggerUIHandler(_req: Request, res: Response) {
  res.send(`<!DOCTYPE html>
<html><head><title>EMP Performance API</title>
<link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head><body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script>SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#swagger-ui' })</script>
</body></html>`);
}

export function openapiHandler(_req: Request, res: Response) {
  res.json(spec);
}
