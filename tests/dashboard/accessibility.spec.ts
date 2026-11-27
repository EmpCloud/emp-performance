import { test, expect } from "@playwright/test";
import { mockDashboard } from "./fixtures";

test("named dashboard controls support keyboard navigation and activity filtering", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await mockDashboard(page);
  const olderDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  api.goals.push({ ...api.goals[0], id: "older-goal", title: "Older activity", created_at: olderDate, updated_at: olderDate });
  await page.goto("/dashboard");
  const range = page.getByRole("combobox", { name: "Recent activity date range", exact: true });
  await expect(page.getByRole("link", { name: /Older activity/ })).toBeVisible();
  await range.focus();
  await page.keyboard.press("ArrowUp");
  await expect(range).toHaveValue("7");
  await expect(page.getByRole("link", { name: /Older activity/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Completed goal/ })).toBeVisible();

  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close navigation", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
});
