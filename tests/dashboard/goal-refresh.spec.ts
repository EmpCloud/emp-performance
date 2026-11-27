import { test, expect, type Page } from "@playwright/test";
import { mockDashboard } from "./fixtures";

async function mockGoalWorkflow(page: Page, role = "hr_admin") {
  const api = await mockDashboard(page, role);
  const updateOverview = () => {
    const completedGoals = api.goals.filter((goal) => goal.status === "completed").length;
    const totals = {
      completedGoals,
      totalGoals: api.goals.length,
      goalCompletionRate: api.goals.length ? Math.round(completedGoals / api.goals.length * 100) : 0,
    };
    Object.assign(api.overview, totals);
    Object.assign(api.personal, totals);
  };
  const fullGoal = (goal: (typeof api.goals)[number]) => ({
    ...goal,
    category: "individual",
    priority: "medium",
    key_results: [],
    check_ins: [],
  });

  // Extend the shared fixture with goal workflows; nothing reaches a real API.
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.replace("/api/v1", "");
    const method = request.method();
    const ok = (data: unknown, status = 200) => {
      api.requests.push({ method, path: endpoint, params: Object.fromEntries(url.searchParams) });
      return route.fulfill({ status, json: { success: true, data } });
    };
    if (endpoint === "/users") return ok([{ id: 7, full_name: "Test Admin", email: "admin@example.test" }]);
    if (endpoint === "/review-cycles") return ok({ data: [], total: 0, page: 1, perPage: 100, totalPages: 0 });
    if (endpoint === "/goals" && method === "POST") {
      const body = request.postDataJSON();
      const goal = {
        id: "22222222-2222-4222-8222-222222222222",
        title: body.title,
        status: "not_started",
        progress: 0,
        employee_id: 7,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      api.goals.unshift(goal);
      updateOverview();
      return ok(fullGoal(goal), 201);
    }
    const match = endpoint.match(/^\/goals\/([^/]+)(\/check-in)?$/);
    const goal = match && api.goals.find((candidate) => candidate.id === match[1]);
    if (goal && method === "GET") return ok(fullGoal(goal));
    if (goal && method === "PUT") {
      const body = request.postDataJSON();
      Object.assign(goal, body, { updated_at: new Date().toISOString() });
      if (goal.status === "completed") goal.progress = 100;
      updateOverview();
      return ok(fullGoal(goal));
    }
    if (goal && match?.[2] && method === "POST") {
      const body = request.postDataJSON();
      goal.progress = body.progress;
      if (goal.status === "not_started" && body.progress > 0) goal.status = "in_progress";
      goal.updated_at = new Date().toISOString();
      updateOverview();
      return ok({ id: "check-in-fixture", goal_id: goal.id, ...body });
    }
    return route.fallback();
  });
  return { api, updateOverview };
}

function dashboardGoalReads(api: Awaited<ReturnType<typeof mockDashboard>>) {
  return api.requests.filter((request) => request.path === "/goals" && request.params.perPage === "15").length;
}

test("creating a goal refreshes dashboard totals and activity without a reload", async ({ page }) => {
  const { api } = await mockGoalWorkflow(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "100% Goal Completion", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Completed goal/ })).toBeVisible();
  const initialGoalReads = dashboardGoalReads(api);
  const initialOverviewReads = api.requests.filter((request) => request.path === "/analytics/overview").length;

  await page.getByRole("link", { name: "100% Goal Completion", exact: true }).click();
  await page.getByRole("link", { name: "Create Goal", exact: true }).click();
  await page.getByPlaceholder("e.g. Increase customer satisfaction score to 90%").fill("New dashboard goal");
  await page.getByRole("button", { name: "Create Goal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New dashboard goal", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();

  await expect(page.getByRole("link", { name: "50% Goal Completion", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /New dashboard goal/ })).toBeVisible();
  expect(dashboardGoalReads(api)).toBeGreaterThan(initialGoalReads);
  expect(api.requests.filter((request) => request.path === "/analytics/overview").length).toBeGreaterThan(initialOverviewReads);
  expect(api.requests.filter((request) => request.path === "/goals" && request.method === "POST")).toHaveLength(1);
});

test("completing a goal refreshes dashboard progress and its activity status", async ({ page }) => {
  const { api, updateOverview } = await mockGoalWorkflow(page);
  Object.assign(api.goals[0], { title: "Goal to finish", status: "in_progress", progress: 50 });
  updateOverview();
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "0% Goal Completion", exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Goal to finish/ }).click();
  await expect(page.getByRole("heading", { name: "Goal to finish" })).toBeVisible();
  await page.getByRole("combobox").selectOption("completed");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();

  await expect(page.getByRole("link", { name: "100% Goal Completion", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Goal to finish/ })).toContainText("Completed");
  expect(api.requests.some((request) => request.method === "PUT" && request.path === `/goals/${api.goals[0].id}`)).toBe(true);
});

test("an employee check-in refreshes personal metrics and recent goal activity", async ({ page }) => {
  const { api, updateOverview } = await mockGoalWorkflow(page, "employee");
  Object.assign(api.goals[0], { title: "Personal check-in goal", status: "not_started", progress: 0 });
  updateOverview();
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "0% Goal Completion", exact: true })).toBeVisible();
  const initialOverviewReads = api.requests.filter((request) => request.path === "/analytics/my-overview").length;
  await page.getByRole("link", { name: /Personal check-in goal/ }).click();
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByRole("spinbutton").fill("50");
  await page.getByRole("button", { name: "Submit Check-in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Submit Check-in", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();

  await expect(page.getByRole("link", { name: /Personal check-in goal/ })).toContainText("In Progress");
  await expect.poll(() => api.requests.filter((request) => request.path === "/analytics/my-overview").length).toBeGreaterThan(initialOverviewReads);
  expect(api.requests.some((request) => request.path === "/analytics/overview")).toBe(false);
});
