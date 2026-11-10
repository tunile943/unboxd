import { expect, type Page, test } from "@playwright/test";
import { openSample, presetSettings } from "./helpers";

const gear = (page: Page) => page.getByRole("button", { name: "Settings", exact: true });
const menu = (page: Page) => page.getByRole("dialog", { name: "Settings" });
const attr = (page: Page, name: string) => page.evaluate((n) => document.documentElement.getAttribute(n), name);

async function openMenu(page: Page) {
  await gear(page).click();
  await expect(menu(page)).toBeVisible();
  await expect(gear(page)).toHaveAttribute("aria-expanded", "true");
}

test("the gear opens the settings menu", async ({ page }) => {
  await openSample(page);
  await expect(gear(page)).toHaveAttribute("aria-haspopup", "dialog");
  await openMenu(page);
  await expect(menu(page).getByText("Settings are saved in this browser.")).toBeVisible();
  await expect(menu(page).getByRole("radio", { name: "System" })).toHaveCount(2);
});

test("Dark applies instantly and survives a reload without a flash", async ({ page }) => {
  await openSample(page);
  await openMenu(page);
  await menu(page).getByRole("radio", { name: "Dark" }).check();
  expect(await attr(page, "data-theme")).toBe("dark");

  // Record the theme the moment <body> is parsed, before any app script has run.
  await page.addInitScript(() => {
    new MutationObserver((_, obs) => {
      if (!document.body) return;
      (window as unknown as { themeAtBody: string | null }).themeAtBody = document.documentElement.getAttribute("data-theme");
      obs.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.reload();
  expect(await attr(page, "data-theme")).toBe("dark");
  expect(await page.evaluate(() => (window as unknown as { themeAtBody: string | null }).themeAtBody)).toBe("dark");
});

test("System removes the theme attribute", async ({ page }) => {
  await presetSettings(page, { display: "dark" });
  await openSample(page);
  expect(await attr(page, "data-theme")).toBe("dark");
  await openMenu(page);
  await expect(menu(page).getByRole("radio", { name: "Dark" })).toBeChecked();
  await menu(page).getByRole("radio", { name: "System" }).first().check();
  expect(await attr(page, "data-theme")).toBeNull();
});

test("Reduce motion On and Off set data-motion", async ({ page }) => {
  await openSample(page);
  await openMenu(page);
  const group = menu(page).getByRole("group", { name: "Reduce motion" });
  await group.getByRole("radio", { name: "On" }).check();
  expect(await attr(page, "data-motion")).toBe("reduce");
  await group.getByRole("radio", { name: "Off" }).check();
  expect(await attr(page, "data-motion")).toBe("full");
  await group.getByRole("radio", { name: "System" }).check();
  expect(await attr(page, "data-motion")).toBeNull();
});

test("the radios work from the keyboard", async ({ page }) => {
  await openSample(page);
  await openMenu(page);
  await expect(menu(page).getByRole("radio", { name: "System" }).first()).toBeFocused();
  await page.keyboard.press("ArrowRight");
  expect(await attr(page, "data-theme")).toBe("light");
});

test("Escape closes the menu and returns focus to the gear", async ({ page }) => {
  await openSample(page);
  await openMenu(page);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(gear(page)).toBeFocused();
  await expect(gear(page)).toHaveAttribute("aria-expanded", "false");
});

test("an outside click closes the menu and returns focus to the gear", async ({ page }) => {
  await openSample(page);
  await openMenu(page);
  await page.mouse.click(4, 500); // the page gutter on desktop, the scrim on phones
  await expect(menu(page)).toHaveCount(0);
  await expect(gear(page)).toBeFocused();
});

test("the close button closes the menu", async ({ page }) => {
  await openSample(page);
  await openMenu(page);
  await menu(page).getByRole("button", { name: "Close settings" }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(gear(page)).toBeFocused();
});

test("phones get a bottom sheet over a scrim", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone layout");
  await openSample(page);
  await openMenu(page);
  await expect(page.getByTestId("settings-scrim")).toBeVisible();
  const box = (await menu(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + box.height).toBeGreaterThan(viewport.height - 20);
  expect(box.width).toBeGreaterThan(viewport.width - 20);
  expect((await gear(page).boundingBox())!.width).toBe(44);
  await page.getByTestId("settings-scrim").click({ position: { x: 20, y: 20 } });
  await expect(menu(page)).toHaveCount(0);
});

test("desktop gets a popover under the gear", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "desktop layout");
  await openSample(page);
  await openMenu(page);
  await expect(page.getByTestId("settings-scrim")).toBeHidden();
  const g = (await gear(page).boundingBox())!;
  const m = (await menu(page).boundingBox())!;
  expect(m.y).toBeGreaterThan(g.y + g.height);
  expect(m.y - (g.y + g.height)).toBeLessThan(12);
  expect(m.x).toBeGreaterThanOrEqual(0);
  expect(m.x + m.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  // Anchored to the gear: one of its edges lines up with the gear's.
  expect(Math.min(Math.abs(m.x - g.x), Math.abs(m.x + m.width - (g.x + g.width)))).toBeLessThan(2);
});

// Needs PickColumns to render <span class="sticker new"> (results agent); enable once that lands.
test.fixme("Boxd Out picks show stickers", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "both columns show on desktop");
  await openSample(page);
  await expect(page.getByRole("region", { name: "Boxd Out" }).locator(".sticker.new").first()).toBeVisible();
});
