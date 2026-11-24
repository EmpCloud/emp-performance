import { test, expect } from "@playwright/test";
import { mockDashboard } from "./fixtures";

for (const width of [320, 390, 1440]) {
  test(`notification panel stays inside a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockDashboard(page);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Notifications", exact: true }).click();
    const empty = page.getByText("No notifications yet", { exact: true });
    await expect(empty).toBeVisible();
    const panel = page.getByRole("button", { name: "View all", exact: true }).locator("..");
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await expect(panel.getByText("Notifications", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "View all", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Notifications", exact: true }).click();
    await expect(empty).not.toBeVisible();
  });
}

for (const width of [320, 640, 1440]) {
  test(`notification panel stays inside an RTL ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockDashboard(page);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Change language", exact: true }).click();
    await page.getByRole("button", { name: /AR.*العربية/ }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await page.getByRole("button", { name: "Notifications", exact: true }).click();
    await expect(page.getByText("No notifications yet", { exact: true })).toBeVisible();
    const box = await page.getByRole("button", { name: "View all", exact: true }).locator("..").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  });
}

test("a populated notification panel keeps its footer reachable in landscape", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 320 });
  await mockDashboard(page);
  await page.route("**/api/v1/notifications/feed?*", route => route.fulfill({
    json: { success: true, data: { data: Array.from({ length: 8 }, (_, i) => ({
      id: `notice-${i}`, title: `Notification ${i}`, body: "Review reminder details", is_read: true,
      link: null, type: "review", created_at: new Date().toISOString(),
    })), total: 8, page: 1, perPage: 8, totalPages: 1 } },
  }));
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  const footer = page.getByRole("button", { name: "View all", exact: true });
  const panel = footer.locator("..");
  await expect(panel.getByText("Notification 0", { exact: true })).toBeVisible();
  const box = await panel.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(320);
  await expect(footer).toBeInViewport();
  expect(await panel.locator(".overflow-y-auto").evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
});
