import { expect, test } from "@playwright/test";
import { openSample, SAMPLE } from "./helpers";

test("the sample diary goes from landing to results", async ({ page }) => {
  await openSample(page);
  await expect(page.getByTestId("landing")).toHaveCount(0);
  await expect(page.getByText(SAMPLE.picks_in[0].title).first()).toBeVisible();
});

test("the page never scrolls sideways", async ({ page }) => {
  await openSample(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
