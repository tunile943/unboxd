import { expect, type Page, test } from "@playwright/test";
import { openSample, SAMPLE } from "./helpers";

// Two flagged films on top of the sample: an unsure match with runner-ups, and one TMDB didn't find.
const base = SAMPLE.films[0];
const unsure = { ...base, name: "Obsession", year: 2025 };
const lost = { ...base, name: "A Film Nobody Has Heard Of", year: 1999 };
const unsureMatch = {
  ...unsure, tmdb_id: 1339713, tmdb_title: "Obsession", tmdb_year: 2026, tmdb_poster: null, media_type: "movie",
  match_confidence: "low", match_reason: "Year differs by 1",
  candidates: [{ id: 1502633, title: "Obsession", year: 2025, poster_path: null, media_type: "movie" }],
};

const open = (page: Page) =>
  openSample(page, { films: [...SAMPLE.films, unsure, lost], resolved: [unsureMatch] });
const row = (page: Page, name: string) => page.getByRole("row").filter({ hasText: name });
const review = (page: Page, name: string) => row(page, name).getByRole("button", { name: `Review match for ${name}` });

async function updatePicks(page: Page) {
  const sent = page.waitForRequest((r) => r.url().endsWith("/api/recommend") && r.postDataJSON().mode === "in");
  await page.getByRole("button", { name: "Update picks" }).focus();
  await page.keyboard.press("Enter");
  return (await sent).postDataJSON().films as { name: string; tmdb_id: number | null; match_confidence: string }[];
}

test("the header notice opens Your data filtered to films that need a check", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "2 films need a check" }).click();
  await expect(page.getByRole("tab", { name: "Your data" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: /^Needs review/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(2);
});

test("picking another match fixes the row and Update picks sends it", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "2 films need a check" }).click();
  await review(page, "Obsession").click();
  const dlg = page.getByRole("dialog", { name: "Match review" });
  await expect(dlg.getByRole("region", { name: "We matched it to" })).toContainText("2026 · 1 year off your diary");
  await dlg.getByRole("region", { name: "Not it? Pick the right one" }).getByRole("button", { name: "Choose Obsession (2025)" }).click();

  await expect(dlg).toHaveCount(0);
  await expect(row(page, "Obsession").getByRole("button", { name: "Change match for Obsession" })).toBeFocused();
  await expect(row(page, "Obsession").getByRole("img", { name: "Manually fixed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "1 film needs a check" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "1 match fixed" })).toBeVisible();

  const films = await updatePicks(page);
  expect(films.find((f) => f.name === "Obsession")).toMatchObject({ tmdb_id: 1502633, match_confidence: "user" });
  await expect(page.getByRole("button", { name: "Update picks" })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Picks updated.");
  await expect(page.locator(".u-fixbar")).toContainText("Picks updated.");
  await expect(page.locator(".u-fixbar")).toBeFocused();
});

test("search finds a film by title or by a pasted TMDB link", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: "Your data" }).click();
  await page.getByRole("button", { name: /^Needs review/ }).click();
  await review(page, lost.name).click();
  const dlg = page.getByRole("dialog", { name: "Match review" });
  const box = dlg.getByRole("searchbox", { name: "Title or TMDB link" });
  await expect(box).toHaveValue(lost.name);
  await expect(dlg.getByText("No other matches on TMDB.")).toBeVisible();

  await box.fill("https://www.themoviedb.org/movie/666277-past-lives");
  await expect(dlg.getByRole("button", { name: /^Choose Past Lives/ })).toBeVisible();
  await box.fill("arriv");
  await dlg.getByRole("button", { name: "Choose Arrival (2016)" }).click();
  await expect(row(page, lost.name).getByRole("img", { name: "Manually fixed" })).toBeVisible();
});

test("Not on TMDB leaves the film out; Escape closes without changes", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "2 films need a check" }).click();
  await review(page, "Obsession").click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(review(page, "Obsession")).toBeFocused();
  await expect(page.getByRole("button", { name: "Update picks" })).toHaveCount(0);

  await review(page, "Obsession").click();
  await page.getByRole("button", { name: "Not on TMDB" }).click();
  await expect(row(page, "Obsession").getByRole("img", { name: "Manually skipped" })).toBeVisible();
  const films = await updatePicks(page);
  expect(films.find((f) => f.name === "Obsession")).toMatchObject({ tmdb_id: null, match_confidence: "user" });
});

test("phone: the picker is full-screen with large targets", async ({ page }, info) => {
  test.skip(info.project.name !== "phone");
  await open(page);
  await page.getByRole("button", { name: "2 films need a check" }).click();
  await review(page, "Obsession").click();
  const dlg = page.getByRole("dialog", { name: "Match review" });
  expect(Math.round((await dlg.boundingBox())!.width)).toBe(page.viewportSize()!.width);
  for (const b of await dlg.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("confirming the current match isn't a pending fix", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "2 films need a check" }).click();
  await review(page, "Obsession").click();
  await page.getByRole("button", { name: "Yes, this is the one" }).click();
  await expect(row(page, "Obsession").getByRole("img", { name: "Manually confirmed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Needs review (1 · 1 fixed)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update picks" })).toHaveCount(0);
});

test("the header notice turns the filter back on", async ({ page }) => {
  await open(page);
  const notice = page.getByRole("button", { name: "2 films need a check" });
  await notice.click();
  const chip = page.getByRole("button", { name: /^Needs review/ });
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "false");
  await notice.click();
  await expect(page.getByRole("button", { name: /^Needs review/ })).toHaveAttribute("aria-pressed", "true");
});


test("search stays folded while there's a match to confirm, and searches only once opened", async ({ page }) => {
  await open(page);
  let searches = 0;
  page.on("request", (r) => r.url().includes("/api/search") && searches++);
  await page.getByRole("button", { name: "2 films need a check" }).click();
  await review(page, "Obsession").click();
  const dlg = page.getByRole("dialog", { name: "Match review" });
  const disclosure = dlg.getByRole("button", { name: /^Search TMDB/ });
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(dlg.getByRole("searchbox")).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(searches).toBe(0);

  await disclosure.click();
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await dlg.getByRole("searchbox", { name: "Title or TMDB link" }).fill("Past Lives");
  await expect(dlg.getByRole("button", { name: /^Choose Past Lives/ })).toBeVisible();
  expect(searches).toBeGreaterThan(0);

  await dlg.getByRole("button", { name: "Close" }).click(); // Escape in a search box clears it first; reopening keeps it
  await review(page, "Obsession").click();
  await expect(dlg.getByRole("searchbox", { name: "Title or TMDB link" })).toHaveValue("Past Lives");
});

test("a film with nothing to choose from opens straight into search", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "2 films need a check" }).click();
  await review(page, lost.name).click();
  const dlg = page.getByRole("dialog", { name: "Match review" });
  await expect(dlg.getByRole("button", { name: /^Search TMDB/ })).toHaveAttribute("aria-expanded", "true");
  await expect(dlg.getByRole("searchbox", { name: "Title or TMDB link" })).toBeFocused();
});
