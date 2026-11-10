import JSZip from "jszip";

// Only these files are sent to the API. reviews.csv, comments, lists etc. stay in the browser.
export const EXPORT_FILES = [
  "watched.csv",
  "ratings.csv",
  "diary.csv",
  "likes/films.csv",
  "watchlist.csv",
] as const;

export type Film = {
  name: string;
  year: number | null;
  rating: number | null;
  liked: boolean;
  rewatch_count: number;
  watched: boolean;
  on_watchlist: boolean;
  last_watched: string | null;
  weight: number | null;
  tmdb_id?: number | null;
  tmdb_title?: string | null;
  tmdb_year?: number | null;
  tmdb_poster?: string | null;
  media_type?: "movie" | "tv" | null;
  match_confidence?: "high" | "low" | "none" | "user" | null; // user = set in Match review
  match_reason?: string | null;
  candidates?: Title[];
};

/** A TMDB movie or limited series, as matching and search return it. */
export type Title = {
  id: number;
  title: string | null;
  year: number | null;
  poster_path: string | null;
  media_type: "movie" | "tv";
};

export type Pick = {
  tmdb_id: number;
  title: string;
  year: number;
  poster_path: string | null;
  reason: string;
  on_watchlist: boolean;
  // Boxd Out only: what's new for you ("Korean", "War", "1960s") and the loved person or theme bridging to it.
  new_label?: string | null;
  bridge_label?: string | null;
  // Card facts, from the details the ranking already fetched.
  runtime: number | null;
  genres: string[];
  director: string | null;
  cast: string[];
  overview: string | null;
  language: string | null;
  vote_average: number;
  vote_count: number;
};

export type Offer = { name: string; logo: string | null };
export type Extras = {
  trailer: { key: string; name: string } | null;
  providers: { link: string | null; stream: Offer[]; rent: Offer[]; buy: Offer[] };
};

export const EXTRAS_BATCH = 50;

export const RESOLVE_BATCH = 100;

/** Unzip a Letterboxd export locally and return {export path: CSV text}. */
export async function readExport(file: File): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir);

  // If the user re-zipped the folder, everything sits under one top-level directory.
  const tops = new Set(entries.map((e) => e.name.split("/")[0]));
  const prefix = tops.size === 1 && entries.every((e) => e.name.includes("/")) ? [...tops][0] + "/" : "";

  // Exact paths only: exports also contain deleted/ and orphaned/ copies of some CSVs.
  const files: Record<string, string> = {};
  for (const entry of entries) {
    const path = entry.name.toLowerCase().slice(prefix.length);
    const match = EXPORT_FILES.find((f) => f === path);
    if (match) files[match] = await entry.async("string");
  }
  if (!files["watched.csv"] && !files["ratings.csv"]) {
    throw new Error("This doesn't look like a Letterboxd export (no watched.csv or ratings.csv).");
  }
  return files;
}

/** The curated sample diary in public/sample/, in the same shape as readExport. */
export async function loadSample(): Promise<Record<string, string>> {
  const texts = await Promise.all(
    EXPORT_FILES.map(async (f) => {
      const resp = await fetch(`/sample/${f}`);
      if (!resp.ok) throw new Error(`Couldn't load the sample diary (${f}: ${resp.status}).`);
      return [f, await resp.text()] as const;
    }),
  );
  return Object.fromEntries(texts);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

export async function parseFilms(files: Record<string, string>): Promise<Film[]> {
  return (await post<{ films: Film[] }>("/api/films", { files })).films;
}

/** Match films to TMDB in batches (each call must finish within Vercel's time limit). */
export async function resolveFilms(
  films: Film[],
  onProgress: (done: number, total: number) => void = () => {},
): Promise<Film[]> {
  const total = Math.ceil(films.length / RESOLVE_BATCH);
  const out: Film[] = [];
  for (let i = 0; i < total; i++) {
    const batch = films.slice(i * RESOLVE_BATCH, (i + 1) * RESOLVE_BATCH);
    let result: { films: Film[] };
    try {
      result = await post("/api/resolve", { films: batch });
    } catch {
      result = await post("/api/resolve", { films: batch }); // one retry, then surface the error
    }
    out.push(...result.films);
    onProgress(i + 1, total);
  }
  return out;
}

export async function recommend(films: Film[], mode: "in" | "out", exclude: number[] = []): Promise<Pick[]> {
  const slim = films.map(({ candidates, ...f }) => f); // alternatives aren't needed and bloat the request
  return (await post<{ picks: Pick[] }>("/api/recommend", { mode, films: slim, exclude })).picks;
}

/** Trailer and where-to-watch in one region for up to EXTRAS_BATCH picks, keyed by TMDB id. */
export async function fetchExtras(picks: Pick[], region: string): Promise<Record<string, Extras>> {
  const films = picks.map((p) => ({ tmdb_id: p.tmdb_id, language: p.language }));
  return (await post<{ extras: Record<string, Extras> }>("/api/extras", { films, region })).extras;
}

async function get<T>(path: string): Promise<T> {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

/** TMDB movies and limited series for a typed title, best first. */
export async function searchTitles(q: string, year: number | null): Promise<Title[]> {
  const params = new URLSearchParams({ q, ...(year ? { year: String(year) } : {}) });
  return (await get<{ results: Title[] }>(`/api/search?${params}`)).results;
}

/** A pasted TMDB link (themoviedb.org/movie/123-name or /tv/123), else null. */
export function parseTmdbLink(text: string): { media_type: "movie" | "tv"; id: number } | null {
  const m = text.match(/themoviedb\.org\/(?:[a-z-]+\/)?(movie|tv)\/(\d+)/i);
  return m ? { media_type: m[1].toLowerCase() as "movie" | "tv", id: Number(m[2]) } : null;
}

export async function lookupTitle(media_type: "movie" | "tv", id: number): Promise<Title | null> {
  try {
    return await get<Title>(`/api/title/${media_type}/${id}`);
  } catch (err) {
    if (err instanceof Error && err.message.includes(" 404:")) return null;
    throw err;
  }
}
