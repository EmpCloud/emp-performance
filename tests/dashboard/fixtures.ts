import type { Page } from "@playwright/test";

/** All API traffic is intercepted: these browser tests never use a real DB. */
export async function mockDashboard(page: Page, role = "hr_admin") {
  const user = {
    id: 7, empcloudUserId: 7, empcloudOrgId: 1, orgId: 1,
    performanceProfileId: null, role, email: "admin@example.test",
    firstName: "Test", lastName: "Admin", orgName: "Test Organization",
  };
  await page.addInitScript(({ user }) => {
    localStorage.setItem("access_token", "dashboard-browser-test");
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("i18nextLng", "en");
  }, { user });

  const state = {
    overview: { activeCycles: 4, pendingReviews: 6, goalCompletionRate: 100, pipCount: 2, feedbackCount: 3, totalGoals: 1, completedGoals: 1 },
    personal: { pendingReviews: 2, goalCompletionRate: 100, feedbackCount: 1, totalGoals: 1, completedGoals: 1 },
    goals: [{ id: "11111111-1111-4111-8111-111111111111", title: "Completed goal", status: "completed", progress: 100, employee_id: 7, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
    failOverview: false,
    failPersonalOverview: false,
    failGoals: false,
    failNotifications: false,
    requests: [] as { method: string; path: string; params: Record<string, string> }[],
  };
  const paginate = (data: unknown[]) => ({ data, total: data.length, page: 1, perPage: 15, totalPages: data.length ? 1 : 0 });
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace("/api/v1", "");
    state.requests.push({ method: route.request().method(), path: endpoint, params: Object.fromEntries(url.searchParams) });
    const ok = (data: unknown) => route.fulfill({ json: { success: true, data } });
    const unavailable = () => route.fulfill({ status: 503, json: { success: false, error: { code: "UNAVAILABLE", message: "Test service unavailable" } } });
    if (endpoint === "/analytics/overview") return state.failOverview ? unavailable() : ok(state.overview);
    if (endpoint === "/analytics/my-overview") return state.failPersonalOverview ? unavailable() : ok(state.personal);
    if (endpoint === "/notifications/unread-count") return ok({ count: 0 });
    if (endpoint === "/notifications/feed") return state.failNotifications ? unavailable() : ok(paginate([]));
    if (endpoint === "/goals" && route.request().method() === "GET") return state.failGoals ? unavailable() : ok(paginate(state.goals));
    if (endpoint === "/auth/logout") return ok({ message: "Logged out" });
    return route.fulfill({ status: 501, json: { success: false, error: { code: "UNMOCKED", message: `Unexpected test request: ${endpoint}` } } });
  });
  return state;
}
