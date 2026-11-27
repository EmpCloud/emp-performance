import { expect, test } from "@playwright/test";
import { mockShell, notification } from "./fixtures";

test("reopening the preview fetches notifications received since it closed", async ({ page }) => {
  const state = await mockShell(page);
  await page.goto("/dashboard");
  const bell = page.getByRole("button", { name: "Notifications", exact: true });
  await bell.click();
  await expect(page.getByText("No notifications yet", { exact: true })).toBeVisible();
  await bell.click();
  const previousRequests = state.requests.filter(r => r.path === "/notifications/feed").length;

  state.notifications.push(notification({ title: "New review assigned" }));
  await bell.click();
  await expect(page.getByRole("button", { name: /New review assigned/ })).toBeVisible();
  expect(state.requests.filter(r => r.path === "/notifications/feed").length).toBeGreaterThan(previousRequests);
});

test("an open preview polls for changed items even when the unread count stays the same", async ({ page }) => {
  await page.clock.install();
  const state = await mockShell(page);
  state.notifications.push(notification({ title: "Earlier notification" }));
  await page.goto("/dashboard");
  const bell = page.getByRole("button", { name: "Notifications", exact: true });
  await bell.click();
  await expect(page.getByRole("button", { name: /Earlier notification/ })).toBeVisible();
  await expect(bell).toHaveText("1");

  state.notifications = [notification({ title: "Updated notification" })];
  await page.clock.fastForward(61_000);
  await expect(page.getByRole("button", { name: /Updated notification/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Earlier notification/ })).toHaveCount(0);
  await expect(bell).toHaveText("1");
});

test("a closed preview stops polling while the unread badge keeps updating", async ({ page }) => {
  await page.clock.install();
  const state = await mockShell(page);
  await page.goto("/dashboard");
  const bell = page.getByRole("button", { name: "Notifications", exact: true });
  await bell.click();
  await expect(page.getByText("No notifications yet", { exact: true })).toBeVisible();
  await bell.click();
  const previewRequests = state.requests.filter(r => r.path === "/notifications/feed").length;

  state.notifications.push(notification({ title: "Received while closed" }));
  await page.clock.fastForward(61_000);
  await expect(bell).toHaveText("1");
  expect(state.requests.filter(r => r.path === "/notifications/feed").length).toBe(previewRequests);
  await bell.click();
  await expect(page.getByRole("button", { name: /Received while closed/ })).toBeVisible();
});
