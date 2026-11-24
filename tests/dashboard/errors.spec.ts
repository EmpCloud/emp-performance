import { test, expect } from "@playwright/test";
import { mockDashboard } from "./fixtures";

test("admin metrics retain their organizational scope", async ({ page }) => {
  const api = await mockDashboard(page);
  await page.goto("/dashboard");
  await expect(page.locator('main a[href="/review-cycles"]')).toContainText("4");
  await expect(page.locator('main a[href="/goals"]').first()).toContainText("100%");
  expect(api.requests.some(r => r.path === "/analytics/overview")).toBe(true);
});

for (const role of ["employee", "manager"]) {
  test(`${role} receives personal metrics without requesting HR-only overview`, async ({ page }) => {
    const api = await mockDashboard(page, role);
    await page.goto("/dashboard");
    await expect(page.locator('main a[href="/my/goals"]').first()).toContainText("100%");
    await expect(page.getByRole("main")).not.toContainText("Active Cycles");
    await expect(page.getByRole("main")).not.toContainText("Active PIPs");
    expect(api.requests.some(r => r.path === "/analytics/overview")).toBe(false);
    expect(api.requests.some(r => r.path === "/analytics/my-overview")).toBe(true);
    await expect.poll(() => api.requests.find(r => r.path === "/goals")?.params.employeeId).toBe("7");
  });
}

test("failed metrics show a recoverable error, never fabricated zero totals", async ({ page }) => {
  const api = await mockDashboard(page);
  api.failOverview = true;
  await page.goto("/dashboard");
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("0 / 0 goals");
  api.failOverview = false;
  await page.getByRole("button", { name: /retry/i }).first().click();
  await expect(page.locator('main a[href="/goals"]').first()).toContainText("100%");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const dependency of ["failGoals", "failNotifications"] as const) {
  test(`${dependency} reports incomplete activity and supports retry`, async ({ page }) => {
    const api = await mockDashboard(page);
    api[dependency] = true;
    await page.goto("/dashboard");
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText("No activity in the selected range.");
    api[dependency] = false;
    await page.getByRole("button", { name: /retry/i }).first().click();
    await expect(page.getByRole("main")).toContainText("Completed goal");
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
