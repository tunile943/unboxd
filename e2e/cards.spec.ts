import { expect, type Page, test } from "@playwright/test";
import { mockApi, openSample, SAMPLE } from "./helpers";

const isPhone = (name: string) => name === "phone";
// Picked from the recorded fixture by what they show, so a re-recording with new picks still works.
type Offers = { stream: { name: string }[]; rent: unknown[]; buy: unknown[] };
const extras = SAMPLE.extras_us as Record<string, { trailer: unknown; providers: Offers }>;
const has = (p: { tmdb_id: number; overview: string | null }, test: (e: (typeof extras)[string]) => boolean) => {
  const e = extras[p.tmdb_id];
  return !!p.overview && !!e?.trailer && !!(e.providers as { link?: string | null }).link && test(e);
};
const need = <T,>(found: T | undefined, what: string): T => {
  if (!found) throw new Error(`e2e/fixtures/sample-api.json has no Boxd In pick that ${what}; re-record or adjust`);
  return found;
};
const logan = need(SAMPLE.picks_in.find((p) => has(p, (e) => e.providers.stream.length > 0)), "streams");
const incendies = need(SAMPLE.picks_in.find((p) => p !== logan && has(p, (e) => !e.providers.stream.length
  && e.providers.rent.length + e.providers.buy.length > 0)), "is rent-or-buy only");
const firstStream = extras[logan.tmdb_id].providers.stream[0].name;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const streamName = new RegExp(`^Stream ${escape(logan.title)} on ${escape(firstStream)}`);
const card = (page: Page, title: string) => page.locator(".u-card").filter({ has: page.getByRole("heading", { name: title }) });

test("cards show quick facts, a trailer button and where to watch", async ({ page }) => {
  await openSample(page);
  const c = card(page, logan.title);
  await expect(c.locator(".u-facts")).toHaveText(`${logan.runtime} min · ${logan.genres.join(", ")} · ${logan.director}`);
  await expect(c.getByRole("button", { name: "Trailer" })).toBeVisible();
  await expect(c.getByRole("link", { name: streamName })).toBeVisible();
  await expect(card(page, incendies.title).getByRole("link", { name: "Rent or buy" })).toBeVisible();
});

test("desktop: Details opens a drawer; Escape closes it and focus returns", async ({ page }, info) => {
  test.skip(isPhone(info.project.name));
  await openSample(page);
  const details = card(page, incendies.title).getByRole("button", { name: `Details about ${incendies.title}` });
  await details.click();
  const drawer = page.getByRole("dialog", { name: /Incendies/ });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(incendies.overview!)).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Where to watch · United States" })).toBeVisible();
  await expect(drawer.getByText("Availability by JustWatch")).toBeVisible();
  await expect(drawer.locator("iframe")).toHaveCount(0); // nothing from YouTube until Play
  await drawer.getByRole("button", { name: `Play ${incendies.title} trailer` }).click();
  await expect(drawer.locator("iframe")).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(details).toBeFocused();
});

test("desktop: the Trailer button opens the drawer already playing", async ({ page }, info) => {
  test.skip(isPhone(info.project.name));
  await openSample(page);
  await card(page, logan.title).getByRole("button", { name: "Trailer" }).click();
  await expect(page.getByRole("dialog").locator("iframe")).toHaveAttribute("title", `${logan.title} trailer`);
});

test("phone: details open inside the card, one card at a time", async ({ page }, info) => {
  test.skip(!isPhone(info.project.name));
  await openSample(page);
  const a = card(page, logan.title);
  const b = card(page, incendies.title);
  await a.getByRole("button", { name: `Details about ${logan.title}` }).click();
  await expect(a.getByRole("button", { name: `Less about ${logan.title}` })).toHaveAttribute("aria-expanded", "true");
  await expect(a.getByText(logan.overview!)).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 1000, height: 844 }); // rotate to a wide layout: details close, no drawer pops up
  await expect(a.getByText(logan.overview!)).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await b.getByRole("button", { name: `Details about ${incendies.title}` }).click();
  await expect(b.getByText(incendies.overview!)).toBeVisible();
  await expect(a.getByText(logan.overview!)).toHaveCount(0);
  for (const btn of await b.locator(".u-act, .u-avail").all()) {
    expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("changing the watch region refetches and is remembered", async ({ page }) => {
  await openSample(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Watch region").selectOption("GB");
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(card(page, logan.title).getByText("Not streaming in United Kingdom")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(card(page, logan.title).getByText("Not streaming in United Kingdom")).toBeVisible();
});

test("if extras fail, cards still work without trailer or providers", async ({ page }) => {
  await openSample(page, { fail: "extras" });
  const c = card(page, logan.title);
  await expect(c.locator(".u-avail")).toHaveCount(0);
  await expect(c.getByRole("button", { name: "Trailer" })).toHaveCount(0);
  await expect(c.getByRole("button", { name: `Details about ${logan.title}` })).toBeVisible();
});

test("desktop: clicking blank space inside the drawer keeps it open", async ({ page }, info) => {
  test.skip(isPhone(info.project.name));
  await openSample(page, { fail: "extras" }); // no trailer or providers: a short panel
  await card(page, incendies.title).getByRole("button", { name: `Details about ${incendies.title}` }).click();
  const drawer = page.getByRole("dialog");
  const box = (await drawer.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20);
  await expect(drawer).toBeVisible();
});

test("a failed extras call is retried when the region changes back", async ({ page }) => {
  let calls = 0;
  await mockApi(page);
  // Registered after mockApi, so it runs first: the first extras call fails.
  await page.route("**/api/extras", (route) => (++calls === 1 ? route.fulfill({ status: 500, body: "boom" }) : route.fallback()));
  await page.goto("/");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await expect(card(page, logan.title).locator(".u-avail")).toHaveCount(0);
  for (const r of ["GB", ""]) {
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Watch region").selectOption(r);
    await page.getByRole("button", { name: "Close settings" }).click();
  }
  await expect(card(page, logan.title).getByRole("link", { name: streamName })).toBeVisible();
});
