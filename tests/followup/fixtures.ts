import type { Page } from "@playwright/test";

export interface TestNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export function notification(overrides: Partial<TestNotification> = {}): TestNotification {
  return {
    id: "11111111-1111-4111-8111-111111111111", type: "review",
    title: "Your review is ready", body: "Open the review workspace.",
    link: "/notifications", is_read: false, created_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Local browser fixtures: no credentials, real API calls, or database writes. */
export async function mockShell(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("access_token", "followup-browser-test");
    localStorage.setItem("emp-performance-language", "en");
    localStorage.setItem("user", JSON.stringify({
      id: 7, empcloudUserId: 7, empcloudOrgId: 1, orgId: 1,
      role: "hr_admin", performanceProfileId: null, email: "admin@example.test",
      firstName: "Test", lastName: "Admin", orgName: "Test Organization",
    }));
  });
  const state = {
    notifications: [] as TestNotification[],
    failPreview: false, failUnread: false, failMarkRead: false, failMarkAll: false,
    beforeMarkAll: undefined as undefined | (() => Promise<void>),
    beforeMarkRead: undefined as undefined | (() => Promise<void>),
    requests: [] as { path: string; method: string; params: Record<string, string> }[],
  };
  const paginate = (items: unknown[]) => ({ data: items, page: 1, perPage: 20, totalPages: items.length ? 1 : 0, total: items.length });
  await page.route("**/api/v1/**", async route => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/v1", "");
    const method = route.request().method();
    state.requests.push({ path, method, params: Object.fromEntries(url.searchParams) });
    const ok = (data: unknown) => route.fulfill({ json: { success: true, data } });
    const unavailable = () => route.fulfill({ status: 503, json: { success: false, error: { code: "UNAVAILABLE", message: "Test service unavailable" } } });
    if (path === "/analytics/overview") return ok({ activeCycles: 0, pendingReviews: 0, goalCompletionRate: 0, pipCount: 0, feedbackCount: 0, totalGoals: 0, completedGoals: 0 });
    if (path === "/goals") return ok(paginate([]));
    if (path === "/notifications/unread-count") return state.failUnread ? unavailable() : ok({ count: state.notifications.filter(n => !n.is_read).length });
    if (path === "/notifications/feed") {
      if (state.failPreview && url.searchParams.get("perPage") === "8") return unavailable();
      return ok(paginate(state.notifications));
    }
    if (path === "/notifications/read-all" && method === "POST") {
      await state.beforeMarkAll?.();
      if (state.failMarkAll) return unavailable();
      state.notifications.forEach(n => { n.is_read = true; });
      return ok({ message: "Marked read" });
    }
    if (path.endsWith("/read") && method === "PATCH") {
      await state.beforeMarkRead?.();
      if (state.failMarkRead) return unavailable();
      const item = state.notifications.find(n => path === `/notifications/${n.id}/read`);
      if (item) item.is_read = true;
      return ok({ message: "Marked read" });
    }
    if (path === "/auth/logout") return ok({ message: "Logged out" });
    return route.fulfill({ status: 501, json: { success: false, error: { code: "UNMOCKED", message: `Unexpected test request: ${path}` } } });
  });
  return state;
}
