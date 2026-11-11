import { expect, type Page, test } from "@playwright/test";
import { mockApi } from "./helpers";

const sideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("the landing footnote links to Privacy, and its page bar back to How it works", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.locator("#priv-note").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Privacy" })).toHaveAttribute("aria-current", "page");
  expect(await sideScroll(page)).toBeLessThanOrEqual(0);

  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "How it works" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Why did I get this film?" })).toBeVisible();
  await expect(page.locator("details").first()).toHaveAttribute("open", "");
  expect(await sideScroll(page)).toBeLessThanOrEqual(0);

  await page.getByRole("link", { name: "Unboxd" }).click();
  await expect(page.getByTestId("box")).toBeVisible();
});

test("the footer links to both pages from the results", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(page.getByTestId("results")).toBeVisible();
  await page.locator("footer.u-foot").getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await page.locator("footer.u-foot").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
});
