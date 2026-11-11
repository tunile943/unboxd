import { expect, type Page, test } from "@playwright/test";
import JSZip from "jszip";
import { mockApi, type MockOptions, SAMPLE } from "./helpers";

// Your own export: the ZIP's content doesn't matter (the API is mocked), it only has to look like an export.
async function zip(): Promise<Buffer> {
  const z = new JSZip();
  z.file("watched.csv", "Date,Name,Year,Letterboxd URI\n2024-01-01,Arrival,2016,https://boxd.it/x\n");
  return z.generateAsync({ type: "nodebuffer" });
}

type Film = (typeof SAMPLE.films)[number];
const watched = SAMPLE.films.filter((f) => f.watched);
const BASE = watched.slice(0, 30);
const count = (films: Film[]) => films.filter((f) => f.watched).length;

async function upload(page: Page, opts: MockOptions) {
  await mockApi(page, opts);
  await page.goto("/");
  await page.getByTestId("box").locator('input[type="file"]').setInputFiles({ name: "letterboxd-export.zip", mimeType: "application/zip", buffer: await zip() });
  await expect(page.getByTestId("results")).toBeVisible();
}

/** Choose a newer export with Update (the mocked /api/films now answers with `films`). */
async function update(page: Page, films: Film[]) {
  await page.unrouteAll();
  await mockApi(page, { films });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await (await chooser).setFiles({ name: "letterboxd-export-new.zip", mimeType: "application/zip", buffer: await zip() });
  return page.getByRole("dialog", { name: "Update from a newer export" });
}

function track(page: Page) {
  const seen: string[] = [];
  page.on("request", (r) => r.url().includes("/api/") && seen.push(new URL(r.url()).pathname));
  return seen;
}

test("only the columns Unboxd needs are uploaded", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => r.url().endsWith("/api/films") && sent.push(r.postData() ?? ""));
  await upload(page, { films: BASE });
  expect(sent).toHaveLength(1);
  expect(JSON.parse(sent[0]).files["watched.csv"]).toBe("Name,Year\nArrival,2016\n");
});

test("your export is saved: a reload goes straight to the results", async ({ page }) => {
  await upload(page, { films: BASE });
  await expect(page.getByText(/^Last updated:/)).toBeVisible();
  const seen = track(page);
  await page.reload();
  await expect(page.getByText("Welcome back.")).toBeVisible();
  await expect(page.getByText(`${count(BASE)} films loaded from this browser.`, { exact: false })).toBeVisible();
  await expect(page.getByTestId("landing")).toHaveCount(0);
  expect(seen.filter((p) => /\/api\/(films|resolve|recommend)$/.test(p))).toEqual([]);
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Welcome back.")).toHaveCount(0);
});

test("the sample is never saved", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(page.getByTestId("results")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("box")).toBeVisible();
});

test("a match fix is saved and survives an update", async ({ page }) => {
  const unsure = { ...BASE[0], name: "Obsession", year: 2025 };
  const match = { ...unsure, tmdb_id: 1339713, tmdb_title: "Obsession", tmdb_year: 2026, tmdb_poster: null, media_type: "movie",
    match_confidence: "low", match_reason: "Year differs by 1",
    candidates: [{ id: 1502633, title: "Obsession", year: 2025, poster_path: null, media_type: "movie" }] };
  await upload(page, { films: [...BASE, unsure], resolved: [match] });
  await page.getByRole("button", { name: "1 film needs a check" }).click();
  await page.getByRole("button", { name: "Review match for Obsession" }).click();
  await page.getByRole("button", { name: "Choose Obsession (2025)" }).click();
  await page.reload();
  await page.getByRole("tab", { name: "Your data" }).click();
  const row = page.getByRole("row").filter({ hasText: "Obsession" });
  await expect(row.getByRole("img", { name: "Manually fixed" })).toBeVisible();

  const same = await update(page, [...BASE, unsure]); // the same export again
  await expect(same.getByText(/^Nothing has changed since/)).toBeVisible();
  await same.getByRole("button", { name: "Close", exact: true }).first().click();

  const added = watched[30];
  const resolved: string[] = [];
  page.on("request", (r) => r.url().endsWith("/api/resolve") && resolved.push(...r.postDataJSON().films.map((f: Film) => f.name)));
  const dlg = await update(page, [...BASE, unsure, added]); // a newer export with one more film
  await dlg.getByRole("button", { name: "Apply update" }).click();
  await expect(page.getByText(/^Updated: /).first()).toBeVisible();
  expect(resolved).toEqual([added.name]);
  await expect(row.getByRole("img", { name: "Manually fixed" })).toBeVisible();
});

test("Update previews the changes, then looks up only new films", async ({ page }) => {
  await upload(page, { films: BASE });
  const added = watched.slice(30, 32);
  const rerated = { ...BASE[0], rating: BASE[0].rating === 5 ? 3 : 5 } as Film;
  const fresh = [rerated, ...BASE.slice(1, -1), ...added]; // BASE's last film is gone
  const dlg = await update(page, fresh);
  await expect(dlg.getByRole("listitem").filter({ hasText: "+2 new films" })).toBeVisible();
  await expect(dlg.getByRole("listitem").filter({ hasText: "1 rating change" })).toBeVisible();
  await expect(dlg.getByRole("listitem").filter({ hasText: "1 removed" })).toBeVisible();
  await expect(dlg.getByText(`${rerated.name}`, { exact: false }).first()).toBeVisible();

  const resolved: string[][] = [];
  page.on("request", (r) => r.url().endsWith("/api/resolve") && resolved.push(r.postDataJSON().films.map((f: Film) => f.name)));
  await dlg.getByRole("button", { name: "Apply update" }).click();
  await expect(page.getByText(`Updated: ${count(BASE)} → ${count(fresh)} films. Your picks are refreshed.`).first()).toBeVisible();
  expect(resolved.flat().sort()).toEqual(added.map((f) => f.name).sort());
  await expect(page.locator(".u-stamp")).toContainText(`${count(fresh)} films`);
});

test("Cancel leaves everything as it was", async ({ page }) => {
  await upload(page, { films: BASE });
  const dlg = await update(page, watched.slice(0, 32));
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator(".u-stamp")).toContainText(`${count(BASE)} films`);
  await page.reload();
  await expect(page.locator(".u-stamp")).toContainText(`${count(BASE)} films`);
});

test("Clear data asks first, then returns to the start page for good", async ({ page }, info) => {
  await upload(page, { films: BASE });
  await page.getByRole("button", { name: "Clear data" }).click();
  await page.getByRole("button", { name: "Keep my data" }).click();
  await expect(page.getByRole("button", { name: "Clear data" })).toBeFocused();

  await page.getByRole("button", { name: "Clear data" }).click();
  const yes = page.getByRole("button", { name: "Clear browser data" });
  if (info.project.name === "phone") expect((await yes.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await yes.click();
  await expect(page.getByTestId("box").getByRole("status"))
    .toHaveText(`Browser data cleared. ${count(BASE)} films and their matches were removed from this browser.`);
  await page.reload();
  await expect(page.getByTestId("box")).toBeVisible();
  await expect(page.getByText("Welcome back.")).toHaveCount(0);
});

test("without IndexedDB the app still works, it just doesn't remember", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "indexedDB", { value: undefined }));
  await upload(page, { films: BASE });
  await page.reload();
  await expect(page.getByTestId("box")).toBeVisible();
});

test("Update notices a watchlist film you've now watched", async ({ page }) => {
  const listed = SAMPLE.films.find((f) => !f.watched && f.on_watchlist)!;
  await upload(page, { films: [...BASE, listed] });
  const dlg = await update(page, [...BASE, { ...listed, watched: true, on_watchlist: false } as Film]);
  await expect(dlg.getByText(`${listed.name} (${listed.year}): now watched`)).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Apply update" })).toBeVisible();
});

test("the Clear data question starts on Keep my data, and Escape keeps it", async ({ page }) => {
  await upload(page, { films: BASE });
  await page.getByRole("button", { name: "Clear data" }).click();
  await expect(page.getByRole("button", { name: "Keep my data" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Clear data" })).toBeFocused();
  await page.reload();
  await expect(page.getByText("Welcome back.")).toBeVisible();
});

test("a failed Update can be dismissed", async ({ page }) => {
  await upload(page, { films: BASE });
  await page.unrouteAll();
  await mockApi(page, { fail: "films" });
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await (await chooser).setFiles({ name: "x.zip", mimeType: "application/zip", buffer: await zip() });
  await expect(page.locator(".u-fixbar")).toContainText("Couldn't update");
  await page.locator(".u-fixbar").getByRole("button", { name: "Dismiss" }).click();
  await expect(page.locator(".u-fixbar")).toHaveCount(0);
});

// Two pages in one browser context share storage, like two tabs.
async function twoTabs(page: Page, opts: MockOptions) {
  await upload(page, opts);
  const other = await page.context().newPage();
  await mockApi(other, opts);
  await other.goto("/");
  await expect(other.getByText("Welcome back.")).toBeVisible();
  return other;
}

const OBSESSION = { ...BASE[0], name: "Obsession", year: 2025 };
const UNSURE = { ...OBSESSION, tmdb_id: 1339713, tmdb_title: "Obsession", tmdb_year: 2026, tmdb_poster: null, media_type: "movie",
  match_confidence: "low", match_reason: "Year differs by 1",
  candidates: [{ id: 1502633, title: "Obsession", year: 2025, poster_path: null, media_type: "movie" }] };

async function fixObsession(page: Page) {
  await page.getByRole("button", { name: "1 film needs a check" }).click();
  await page.getByRole("button", { name: "Review match for Obsession" }).click();
  await page.getByRole("button", { name: "Choose Obsession (2025)" }).click();
}

test("Clear data in one tab sends the other tab back to the start", async ({ page }) => {
  const other = await twoTabs(page, { films: BASE });
  await page.getByRole("button", { name: "Clear data" }).click();
  await page.getByRole("button", { name: "Clear browser data" }).click();
  await expect(other.getByTestId("box").getByRole("status"))
    .toHaveText(`Browser data cleared in another tab. ${count(BASE)} films and their matches were removed from this browser.`);
  await other.reload();
  await expect(other.getByTestId("box")).toBeVisible();
});

test("a match fix in one tab shows up in the other", async ({ page }) => {
  const other = await twoTabs(page, { films: [...BASE, OBSESSION], resolved: [UNSURE] });
  await fixObsession(page);
  await expect(other.locator(".u-fixbar")).toHaveText("Updated in another tab.");
  await other.getByRole("tab", { name: "Your data" }).click();
  await expect(other.getByRole("row").filter({ hasText: "Obsession" }).getByRole("img", { name: "Manually fixed" })).toBeVisible();
});

test("without tab messages, a stale tab still can't bring cleared data back", async ({ page }) => {
  await page.context().addInitScript(() => Object.defineProperty(window, "BroadcastChannel", { value: undefined }));
  const other = await twoTabs(page, { films: [...BASE, OBSESSION], resolved: [UNSURE] });
  await page.getByRole("button", { name: "Clear data" }).click();
  await page.getByRole("button", { name: "Clear browser data" }).click();
  await expect(other.getByTestId("results")).toBeVisible(); // it wasn't told
  await fixObsession(other); // its save is refused, so it finds out
  await expect(other.getByTestId("box").getByRole("status")).toContainText("Browser data cleared in another tab.");
  await page.reload();
  await expect(page.getByTestId("box")).toBeVisible();
});
