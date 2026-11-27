import { test, expect } from "@playwright/test";
import { mockDashboard } from "./fixtures";

test("admin's pending card matches the personal workspace, not the organization total", async ({ page }) => {
  const api = await mockDashboard(page);
  api.overview.pendingReviews = 12;
  api.personal.pendingReviews = 2;
  await page.route("**/api/v1/reviews?*", route => {
    const params = new URL(route.request().url()).searchParams;
    const data = params.get("reviewer_id") === "7"
      ? ["pending", "draft"].map((status, i) => ({
          id: `review-${i}`, reviewer_id: 7, employee_id: 8,
          type: "manager", status, overall_rating: null, created_at: new Date().toISOString(),
        }))
      : [];
    return route.fulfill({ json: { success: true, data: { data, total: data.length, page: 1, perPage: 50, totalPages: 1 } } });
  });
  await page.goto("/dashboard");
  const card = page.getByRole("link", { name: "2 My Pending Reviews", exact: true });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("heading", { name: "My Reviews", exact: true })).toBeVisible();
  await expect(page.locator('main a[href$="/edit"]')).toHaveCount(2);
  await expect(page.locator('main a[href$="/edit"]').first()).toContainText("Pending");
  await expect(page.locator('main a[href$="/edit"]').last()).toContainText("Draft");
});

test("a personal review failure preserves org metrics and offers its own retry", async ({ page }) => {
  await mockDashboard(page);
  let unavailable = true;
  await page.route("**/api/v1/analytics/my-overview", route => unavailable
    ? route.fulfill({ status: 503, json: { success: false } })
    : route.fulfill({ json: { success: true, data: { pendingReviews: 2 } } }));
  await page.goto("/dashboard");
  await expect(page.getByRole("alert")).toContainText("Unable to load your pending reviews.");
  await expect(page.locator('main a[href="/review-cycles"]')).toContainText("4");
  unavailable = false;
  await page.getByRole("button", { name: "Retry reviews", exact: true }).click();
  await expect(page.getByRole("link", { name: "2 My Pending Reviews", exact: true })).toBeVisible();
});
