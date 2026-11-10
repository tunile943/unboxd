import { expect, type Page, test } from "@playwright/test";
import { openSample, SAMPLE } from "./helpers";

const isPhone = (name: string) => name === "phone";
const region = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("desktop shows both boxes side by side and switches to Your data and back", async ({ page }, info) => {
  test.skip(isPhone(info.project.name), "desktop layout");
  await openSample(page);
  await expect(page.getByRole("tab")).toHaveCount(2);
  await expect(region(page, "Boxd In").getByRole("listitem")).toHaveCount(SAMPLE.picks_in.length);
  await expect(region(page, "Boxd Out").getByRole("listitem")).toHaveCount(SAMPLE.picks_out.length);
  await expect(page.getByRole("tab", { name: "Boxd In Boxd Out" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "Your data" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(region(page, "Boxd In")).toHaveCount(0);

  await page.getByRole("tab", { name: "Boxd In Boxd Out" }).click();
  await expect(region(page, "Boxd In")).toBeVisible();
  await expect(region(page, "Boxd Out")).toBeVisible();
});

test("phones get three tabs and one box at a time", async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), "phone layout");
  await openSample(page);
  await expect(page.getByRole("tab")).toHaveCount(3);
  await expect(region(page, "Boxd In")).toBeVisible();
  await expect(region(page, "Boxd Out")).toBeHidden();

  await page.getByRole("tab", { name: "Boxd Out" }).click();
  await expect(region(page, "Boxd Out")).toBeVisible();
  await expect(region(page, "Boxd In")).toBeHidden();

  await page.getByRole("tab", { name: "Your data" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(region(page, "Boxd Out")).toHaveCount(0);
  const tabBox = await page.getByRole("tab", { name: "Boxd In" }).boundingBox();
  expect(tabBox!.height).toBeGreaterThanOrEqual(44);
});

test("a pick on your watchlist carries the badge", async ({ page }, info) => {
  const inPick = SAMPLE.picks_in.find((p) => p.on_watchlist);
  const pick = inPick ?? SAMPLE.picks_out.find((p) => p.on_watchlist)!;
  const box = inPick ? "Boxd In" : "Boxd Out";
  await openSample(page);
  if (isPhone(info.project.name)) await page.getByRole("tab", { name: box }).click();
  const card = region(page, box).getByRole("listitem").filter({ hasText: pick.title });
  await expect(card.getByText("★ on your watchlist")).toBeVisible();
  const badged = region(page, box).getByRole("listitem").filter({ hasText: "★ on your watchlist" });
  await expect(badged).toHaveCount((inPick ? SAMPLE.picks_in : SAMPLE.picks_out).filter((p) => p.on_watchlist).length);
});

test("the sample strip opens the shipping label and leads back to the landing", async ({ page }) => {
  await openSample(page);
  await expect(page.getByText("Sample diary", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Who is the sample diary?" }).click();
  const label = page.getByRole("dialog", { name: "The sample diary" });
  await expect(label).toBeVisible();
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
  await page.keyboard.press("Escape");
  await expect(label).toBeHidden();

  await page.getByRole("button", { name: "Use your own export" }).click();
  await expect(page.getByTestId("landing")).toBeVisible();
  await expect(page.getByTestId("results")).toHaveCount(0);
});

test("the Needs review chip shows only films that need a check", async ({ page }) => {
  const lost = { ...SAMPLE.films[0], name: "A Film Nobody Has Heard Of", year: 1999 };
  const films = [...SAMPLE.films.slice(0, 10), lost];
  await openSample(page, { films });
  await page.getByRole("tab", { name: "Your data" }).click();
  const rows = page.getByRole("table").locator("tbody tr");
  await expect(rows).toHaveCount(films.filter((f) => f.watched).length);

  const chip = page.getByRole("button", { name: "Needs review (1)" });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(lost.name);
  await expect(rows.first().getByRole("img", { name: "Not found" })).toBeVisible();

  await chip.click();
  await expect(rows).toHaveCount(films.filter((f) => f.watched).length);
  expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
});

test("no tab scrolls the page sideways", async ({ page }, info) => {
  await openSample(page);
  const tabs = isPhone(info.project.name) ? ["Boxd In", "Boxd Out", "Your data"] : ["Boxd In Boxd Out", "Your data"];
  for (const name of tabs) {
    await page.getByRole("tab", { name, exact: true }).click();
    expect(await noSideScroll(page)).toBeLessThanOrEqual(0);
  }
});

test("tabs work from the keyboard", async ({ page }, info) => {
  await openSample(page);
  const names = isPhone(info.project.name) ? ["Boxd In", "Boxd Out", "Your data"] : ["Boxd In Boxd Out", "Your data"];
  const tab = (i: number) => page.getByRole("tab", { name: names[i], exact: true });
  await tab(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tab(1)).toBeFocused();
  await expect(tab(1)).toHaveAttribute("aria-selected", "true");
  await expect(tab(0)).toHaveAttribute("tabindex", "-1");
  await page.keyboard.press("End");
  await expect(tab(names.length - 1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowRight");
  await expect(tab(0)).toBeFocused();
  await expect(tab(0)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toBeVisible();
});

test("on desktop each column scrolls on its own", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "phones show one column at a time");
  await openSample(page);
  const boxdIn = page.getByRole("region", { name: "Boxd In" });
  const boxdOut = page.getByRole("region", { name: "Boxd Out" });
  await boxdOut.locator(".u-card").first().waitFor();
  // Not hover(): mid pop-in the column is briefly taller, and hover() would scroll the page to fit it.
  const box = (await boxdIn.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 150);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => boxdIn.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await boxdOut.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0); // the page itself stays put
  await expect(boxdIn.getByRole("heading", { name: "Boxd In" })).toBeInViewport(); // sticky column header
});

test("focus moves to the results, and back to the landing on start over", async ({ page }) => {
  await openSample(page);
  await expect(page.getByRole("heading", { level: 1, name: "Recommendations for the sample diary" })).toBeFocused();
  await page.getByRole("button", { name: "Use your own export" }).click();
  await expect(page.locator("#landing-title")).toBeFocused();
});

test("on phones the sample label is a full-screen sheet that scrolls", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "desktop keeps the centered modal");
  await page.setViewportSize({ width: 390, height: 600 }); // a short phone: the label no longer fits
  await openSample(page);
  await page.getByRole("button", { name: "Who is the sample diary?" }).click();
  const sheet = page.getByRole("dialog", { name: "The sample diary" });
  const box = (await sheet.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(Math.round(box.width)).toBe(vp.width);
  expect(Math.round(box.height)).toBe(vp.height);
  await sheet.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  expect(await sheet.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByText(/Watchlist leans older/)).toBeInViewport();
  await page.getByRole("button", { name: "Close" }).click(); // still reachable after scrolling: sticky bar
  await expect(sheet).toBeHidden();
});

test("Your data shows 100 films at a time with Show more", async ({ page }) => {
  const films = Array.from({ length: 250 }, (_, i) => ({ ...SAMPLE.films[0], watched: true, name: `Film ${i}` }));
  await openSample(page, { films });
  await page.getByRole("tab", { name: "Your data" }).click();
  const rows = page.getByRole("table").locator("tbody tr");
  await expect(rows).toHaveCount(100);
  await page.getByRole("button", { name: "Show 100 more (150 left)" }).click();
  await expect(rows).toHaveCount(200);
  await page.getByRole("button", { name: "Show 50 more (50 left)" }).click();
  await expect(rows).toHaveCount(250);
  await expect(page.getByRole("button", { name: /Show \d+ more/ })).toHaveCount(0);
});
