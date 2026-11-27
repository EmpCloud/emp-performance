import { expect, test } from "@playwright/test";
import { mockShell, notification } from "./fixtures";

test("notification preview distinguishes loading and failure, then retries successfully", async ({ page }) => {
  const state = await mockShell(page);
  state.failPreview = true;
  state.notifications = [notification({ title: "Recovered notification" })];

  let releasePreview!: () => void;
  const previewGate = new Promise<void>(resolve => { releasePreview = resolve; });
  await page.route("**/api/v1/notifications/feed?*", async route => {
    if (new URL(route.request().url()).searchParams.get("perPage") === "8") {
      await previewGate;
    }
    await route.fallback();
  });

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  try {
    await expect(page.getByRole("status", { name: "Loading notifications" })).toBeVisible();
    await expect(page.getByText("No notifications yet", { exact: true })).not.toBeVisible();
  } finally {
    releasePreview();
  }

  await expect(page.getByRole("alert").filter({ hasText: "Unable to load notifications." })).toBeVisible();
  await expect(page.getByText("No notifications yet", { exact: true })).not.toBeVisible();
  state.failPreview = false;
  await page.getByRole("button", { name: "Retry notifications", exact: true }).click();
  await expect(page.getByRole("button", { name: /Recovered notification/ })).toBeVisible();
  await expect(page.getByText("Unable to load notifications.", { exact: true })).not.toBeVisible();
});

test("a successful empty notification preview retains its empty state", async ({ page }) => {
  await mockShell(page);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Notifications", exact: true }).click();

  await expect(page.getByText("No notifications yet", { exact: true })).toBeVisible();
  await expect(page.getByText("Unable to load notifications.", { exact: true })).not.toBeVisible();
});

test("an unavailable unread count is announced and can recover independently", async ({ page }) => {
  const state = await mockShell(page);
  state.failUnread = true;
  state.notifications = [notification()];
  await page.goto("/dashboard");

  const unavailableBell = page.getByRole("button", { name: "Notifications (unread count unavailable)", exact: true });
  await expect(unavailableBell).toBeVisible();
  await expect(unavailableBell).toHaveAttribute("title", "Notifications (unread count unavailable)");
  await unavailableBell.click();
  await expect(page.getByRole("alert").filter({ hasText: "Unread count unavailable." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Your review is ready/ })).toBeVisible();

  state.failUnread = false;
  await page.getByRole("button", { name: "Retry unread count", exact: true }).click();
  await expect(page.getByRole("button", { name: "Notifications", exact: true })).toHaveText("1");
  await expect(page.getByText("Unread count unavailable.", { exact: true })).not.toBeVisible();
});
