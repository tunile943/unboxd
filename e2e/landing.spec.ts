import { expect, type Page, test } from "@playwright/test";
import { mockApi, presetSettings, SAMPLE } from "./helpers";

// 250 films = 3 resolve batches of 100.
const MANY = Array.from({ length: 250 }, (_, i) => {
  const f = SAMPLE.films[i % SAMPLE.films.length];
  return i < SAMPLE.films.length ? f : { ...f, name: `${f.name} ${i}` };
});

type Seen = { jigs: string[]; classes: string[]; statuses: string[] };

/** Record each write to the box's data-jig and class, and each status text, from before the run starts. */
async function watchBox(page: Page) {
  await page.getByTestId("box").waitFor(); // after the check for saved data
  await page.evaluate(() => {
    const w = window as unknown as Seen;
    Object.assign(w, { jigs: [], classes: [], statuses: [] });
    const box = document.querySelector("[data-testid=box]")!;
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.attributeName === "data-jig") w.jigs.push(box.getAttribute("data-jig") ?? "");
        if (r.attributeName === "class") w.classes.push(box.className);
      }
      const status = box.querySelector("[role=status]")?.textContent;
      if (status && status !== w.statuses.at(-1)) w.statuses.push(status);
    }).observe(box, { attributes: true, attributeFilter: ["data-jig", "class"], childList: true, subtree: true, characterData: true });
  });
}
const recorded = (page: Page) =>
  page.evaluate(() => {
    const { jigs, classes, statuses } = window as unknown as Seen;
    return { jigs, classes, statuses };
  });

test("landing shows both entry points and the privacy footnote", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  const landing = page.getByTestId("landing");
  await expect(landing.getByRole("heading", { name: "Two boxes of films, carefully packed from your ratings." })).toBeVisible();
  await expect(landing.getByText("Choose ZIP")).toBeVisible();
  await expect(landing.getByRole("button", { name: "Try with sample data" })).toBeVisible();
  await expect(landing.getByText("Your export isn't saved.")).toBeVisible();
  await expect(landing.getByText(/then discarded/)).toBeVisible();
});

test("the sample shows progress on the label, then results", async ({ page }) => {
  await mockApi(page, { delayMs: 300 });
  await page.goto("/");
  await watchBox(page);
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(page.getByTestId("box").getByRole("progressbar")).toBeVisible();
  await expect(page.getByTestId("results")).toBeVisible();
  await expect(page.getByTestId("landing")).toHaveCount(0);
  // The last batch and "Packing" can land in one render, so "1/1" may never show.
  const { statuses } = await recorded(page);
  expect(statuses.slice(0, 2)).toEqual(["Opening the sample diary…", "Matching films on TMDB… 0/1 batches"]);
  expect(statuses.slice(-2)).toEqual(["Packing your Boxd In…", "Unpacking…"]);
});

test("each batch jiggles the box, never the same way twice in a row", async ({ page }) => {
  await mockApi(page, { films: MANY, delayMs: 150 });
  await page.goto("/");
  await watchBox(page);
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(page.getByTestId("results")).toBeVisible();
  const { jigs, classes } = await recorded(page);
  expect(jigs).toHaveLength(3);
  for (const j of jigs) expect(["a", "b", "c", "d"]).toContain(j);
  for (let i = 1; i < jigs.length; i++) expect(jigs[i]).not.toBe(jigs[i - 1]);
  expect(classes.some((c) => c.includes("growing"))).toBe(true);
});

test("reduce motion: no grow or jiggle, results still appear", async ({ page }) => {
  await presetSettings(page, { motion: "on" });
  await mockApi(page, { films: MANY, delayMs: 100 });
  await page.goto("/");
  await watchBox(page);
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(page.getByTestId("results")).toBeVisible();
  const { jigs, classes } = await recorded(page);
  expect(jigs).toEqual([]);
  expect(classes.filter((c) => /growing|jiggle/.test(c))).toEqual([]);
});

test("a matching failure shows on the label and the drop zone still works", async ({ page }) => {
  await mockApi(page, { fail: "resolve" });
  await page.goto("/");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  const alert = page.getByTestId("box").getByRole("alert");
  await expect(alert).toContainText("Couldn't pack your box");
  await expect(alert).toContainText("mock resolve failure");
  await expect(page.getByTestId("box").locator('input[type="file"]')).toBeEnabled();

  await page.unrouteAll();
  await mockApi(page);
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(page.getByTestId("results")).toBeVisible();
});

test("the landing never scrolls sideways, loading included", async ({ page }) => {
  await mockApi(page, { films: MANY, delayMs: 600 });
  await page.goto("/");
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(page.getByTestId("box")).toHaveAttribute("data-jig", /[abcd]/);
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test("phone: landing buttons are at least 44px tall", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  await mockApi(page);
  await page.goto("/");
  for (const btn of [page.getByText("Choose ZIP"), page.getByRole("button", { name: "Try with sample data" })]) {
    expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test("a file dropped beside the box doesn't open in the browser", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  // Polled: the window listener attaches after hydration.
  await expect.poll(() =>
    page.evaluate(() => {
      const drop = new DragEvent("drop", { cancelable: true, bubbles: true, dataTransfer: new DataTransfer() });
      document.querySelector("footer")!.dispatchEvent(drop);
      return drop.defaultPrevented;
    }),
  ).toBe(true);
});
