import { test, expect } from "@playwright/test";
import { mockShell, notification } from "./fixtures";

test("a failed mark-read request does not block opening a notification", async ({ page }) => {
  const api = await mockShell(page);
  api.notifications.push(notification());
  api.failMarkRead = true;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await page.getByRole("button", { name: /Your review is ready/ }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  await expect(page.getByText("Could not mark this notification as read. Please try again from Notifications.", { exact: true })).toBeVisible();
  expect(api.notifications[0].is_read).toBe(false);
  expect(errors).toEqual([]);
});

test("mark-all failure is visible and the same action can be retried", async ({ page }) => {
  const api = await mockShell(page);
  api.notifications.push(notification());
  api.failMarkAll = true;
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await page.getByRole("button", { name: "Mark all read", exact: true }).click();
  await expect(page.getByText("Could not mark all notifications as read. Please try again.", { exact: true })).toBeVisible();
  expect(api.notifications[0].is_read).toBe(false);
  api.failMarkAll = false;
  await page.getByRole("button", { name: "Mark all read", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mark all read", exact: true })).toHaveCount(0);
  expect(api.notifications[0].is_read).toBe(true);
});

test("mark-all prevents repeated submissions while its request is pending", async ({ page }) => {
  const api = await mockShell(page);
  api.notifications.push(notification());
  let complete!: () => void;
  api.beforeMarkAll = () => new Promise<void>(resolve => { complete = resolve; });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await page.getByRole("button", { name: "Mark all read", exact: true }).click();
  await expect.poll(() => api.requests.filter(r => r.path === "/notifications/read-all").length).toBe(1);
  await expect(page.getByRole("button", { name: "Marking as read…", exact: true })).toBeDisabled();
  complete();
  await expect(page.getByRole("button", { name: "Marking as read…", exact: true })).toHaveCount(0);
  expect(api.notifications[0].is_read).toBe(true);
});
