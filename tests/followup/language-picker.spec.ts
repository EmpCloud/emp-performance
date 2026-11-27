import { expect, test } from "@playwright/test";
import { mockShell } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockShell(page);
  await page.goto("/dashboard");
  await expect(page.locator("main h1")).toBeVisible();
});

test("announces selection and supports arrows, Home, End, Enter, and Escape", async ({ page }) => {
  const trigger = page.locator("button:has(svg.lucide-globe)");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.focus();
  await page.keyboard.press("ArrowDown");

  const menu = page.getByRole("menu");
  const first = menu.getByRole("menuitemradio", { name: "English", exact: true });
  const last = menu.locator('[lang="zh"]');
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute("aria-checked", "true");
  await expect(menu.getByRole("menuitemradio", { checked: true })).toHaveCount(1);

  await page.keyboard.press("End");
  await expect(last).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(last).toBeFocused();
  await page.keyboard.press("Home");
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(menu.locator('[lang="es"]')).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(menu).not.toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(menu.locator('[lang="es"]')).toBeFocused();
  await expect(menu.locator('[lang="es"]')).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(menu).toBeVisible();
  await trigger.click();
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("Space selects a language and ArrowUp opens at the last choice", async ({ page }) => {
  const trigger = page.locator("button:has(svg.lucide-globe)");
  await trigger.focus();
  await page.keyboard.press("ArrowUp");
  const menu = page.getByRole("menu");
  await expect(menu.locator('[lang="zh"]')).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await expect(menu.locator('[lang="hi"]')).toBeFocused();
  await page.keyboard.press("Space");
  await expect(menu).not.toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(trigger).toBeFocused();
});

test("Tab exits normally and outside clicks do not steal focus", async ({ page }) => {
  const trigger = page.locator("button:has(svg.lucide-globe)");
  const menu = page.getByRole("menu");
  await trigger.click();
  await expect(menu.getByRole("menuitemradio", { name: "English", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Light theme", exact: true })).toBeFocused();

  await trigger.click();
  await page.keyboard.press("Shift+Tab");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("button", { name: "Dark theme", exact: true }).click();
  await expect(menu).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Dark theme", exact: true })).toBeFocused();
});

for (const { width, height, rtl } of [
  { width: 320, height: 320, rtl: false },
  { width: 640, height: 320, rtl: true },
  { width: 1440, height: 900, rtl: true },
]) {
  test(`language choices stay reachable at ${width}x${height} ${rtl ? "RTL" : "LTR"}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const trigger = page.locator("button:has(svg.lucide-globe)");
    const menu = page.getByRole("menu");
    if (rtl) {
      await trigger.click();
      await menu.locator('[lang="ar"]').click();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    }
    await trigger.click();
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);

    await page.keyboard.press("End");
    await expect(menu.locator('[lang="zh"]')).toBeFocused();
    await expect(menu.locator('[lang="zh"]')).toBeInViewport({ ratio: 1 });
  });
}
