import { expect, test } from "@playwright/test";
import { mockDashboard } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockDashboard(page);
  await page.goto("/dashboard");
  await expect(page.locator("main h1")).toBeVisible();
});

test.describe("mobile navigation drawer", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("moves focus inside, wraps Tab in both directions, and keeps background inert", async ({ page }) => {
    const trigger = page.locator('[aria-controls="mobile-navigation"]');
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Main navigation" });
    const closeButton = dialog.getByRole("button", { name: "Close navigation" });
    const lastButton = dialog.getByRole("button", { name: "Log out", exact: true });
    await expect(dialog).toBeVisible();
    await expect(closeButton).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(lastButton).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(closeButton).toBeFocused();

    // Even programmatic focus cannot move into the inert page behind the modal.
    await page.locator('header button[aria-label="Change language"]').evaluate((button) => button.focus());
    await expect(closeButton).toBeFocused();
    await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  });

  test("Escape and the close button restore focus and release the scroll lock", async ({ page }) => {
    const trigger = page.locator('[aria-controls="mobile-navigation"]');
    const dialog = page.getByRole("dialog", { name: "Main navigation" });
    const originalOverflow = await page.locator("body").evaluate((body) => body.style.overflow);

    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(await page.locator("body").evaluate((body) => body.style.overflow)).toBe(originalOverflow);

    await trigger.click();
    await dialog.getByRole("button", { name: "Close navigation" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("closes when navigating to the current route", async ({ page }) => {
    const trigger = page.locator('[aria-controls="mobile-navigation"]');
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Main navigation" });

    await dialog.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("closes on desktop resize and can reopen after returning to mobile", async ({ page }) => {
    const trigger = page.locator('[aria-controls="mobile-navigation"]');
    const dialog = page.getByRole("dialog", { name: "Main navigation" });
    const originalOverflow = await page.locator("body").evaluate((body) => body.style.overflow);
    await trigger.click();
    await expect(dialog).toBeVisible();

    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
    expect(await page.locator("body").evaluate((body) => body.style.overflow)).toBe(originalOverflow);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close navigation" })).toBeFocused();
  });
});

test("desktop sidebar collapse remains available and survives reload", async ({ page }) => {
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("main h1")).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Collapse sidebar", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
});
