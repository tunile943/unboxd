import type { Page } from "@playwright/test";
import fixture from "./fixtures/sample-api.json";

type Film = { name: string; year: number | null };
export const SAMPLE = fixture;

// A 1x1 grey PNG, so poster requests never leave the machine.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

export type MockOptions = {
  films?: Film[]; // what /api/films returns (default: the sample diary)
  delayMs?: number; // per API call, to make loading states observable
  fail?: "films" | "resolve" | "recommend" | "extras"; // answer that endpoint with a 500
};

/** Serve /api/* from the recorded sample responses. /api/resolve matches by name and year, so any subset works. */
export async function mockApi(page: Page, opts: MockOptions = {}) {
  const resolved = new Map(fixture.resolved.map((f) => [`${f.name}|${f.year}`, f]));
  const wait = () => new Promise((r) => setTimeout(r, opts.delayMs ?? 0));
  await page.route("**/image.tmdb.org/**", (route) => route.fulfill({ body: PIXEL, contentType: "image/png" }));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace("/api/", "");
    await wait();
    if (opts.fail === endpoint) return route.fulfill({ status: 500, body: `mock ${endpoint} failure` });
    const body = route.request().postDataJSON();
    if (endpoint === "films") return route.fulfill({ json: { films: opts.films ?? fixture.films } });
    if (endpoint === "resolve")
      return route.fulfill({
        json: { films: body.films.map((f: Film) => resolved.get(`${f.name}|${f.year}`) ?? { ...f, match_confidence: "none" }) },
      });
    if (endpoint === "extras") {
      // Recorded for the US; any other region has the same trailers and nothing to watch.
      const us = fixture.extras_us as Record<string, { trailer: unknown; providers: unknown }>;
      const none = { link: null, stream: [], rent: [], buy: [] };
      return route.fulfill({
        json: { extras: Object.fromEntries(body.films.map((f: { tmdb_id: number }) => {
          const e = us[f.tmdb_id] ?? { trailer: null, providers: none };
          return [f.tmdb_id, body.region === "US" ? e : { ...e, providers: none }];
        })) },
      });
    }
    if (endpoint === "recommend")
      return route.fulfill({ json: { picks: body.mode === "in" ? fixture.picks_in : fixture.picks_out } });
    return route.fulfill({ status: 404 });
  });
}

/** Saved settings, applied before the page loads (as a returning visitor would have them). */
export async function presetSettings(page: Page, settings: { display?: string; motion?: string }) {
  await page.addInitScript((s) => localStorage.setItem("unboxd-settings", JSON.stringify(s)), settings);
}

/** Open the app with the mocked API and load the sample diary; resolves once results are showing. */
export async function openSample(page: Page, opts: MockOptions = {}) {
  await mockApi(page, opts);
  await page.goto("/");
  await page.getByRole("button", { name: "Try with sample data" }).click();
  await page.getByTestId("results").waitFor();
}
