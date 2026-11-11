import type { Film } from "./export";

// Films are keyed on name + year, as unboxd/ingest.py does: the export's URIs point to log entries in diary.csv.
export const filmKey = (f: Pick<Film, "name" | "year">) => `${f.name}|${f.year ?? ""}`;

const MATCH_FIELDS = ["tmdb_id", "tmdb_title", "tmdb_year", "tmdb_poster", "media_type", "match_confidence", "match_reason",
  "candidates"] as const;

export type Change<T> = { film: Film; from: T; to: T };
export type Diff = {
  added: Film[];
  removed: Film[];
  rated: Change<number | null>[];
  liked: Change<boolean>[];
  rewatched: Change<number>[];
  logged: Change<boolean>[]; // watched, e.g. a watchlist film you've now seen
  listed: Change<boolean>[]; // on the watchlist
  dated: Change<string | null>[]; // last diary date
};

export const diffSize = (d: Diff) =>
  [d.added, d.removed, d.rated, d.liked, d.rewatched, d.logged, d.listed, d.dated].reduce((n, xs) => n + xs.length, 0);

/** What a newer export changes, compared with the saved films. */
export function diffFilms(saved: Film[], fresh: Film[]): Diff {
  const old = new Map(saved.map((f) => [filmKey(f), f]));
  const now = new Set(fresh.map(filmKey));
  const d: Diff = { added: [], removed: saved.filter((f) => !now.has(filmKey(f))), rated: [], liked: [], rewatched: [],
                    logged: [], listed: [], dated: [] };
  for (const f of fresh) {
    const was = old.get(filmKey(f));
    if (!was) {
      d.added.push(f);
      continue;
    }
    if (was.rating !== f.rating) d.rated.push({ film: f, from: was.rating, to: f.rating });
    if (was.liked !== f.liked) d.liked.push({ film: f, from: was.liked, to: f.liked });
    if (was.rewatch_count !== f.rewatch_count) d.rewatched.push({ film: f, from: was.rewatch_count, to: f.rewatch_count });
    if (was.watched !== f.watched) d.logged.push({ film: f, from: was.watched, to: f.watched });
    if (was.on_watchlist !== f.on_watchlist) d.listed.push({ film: f, from: was.on_watchlist, to: f.on_watchlist });
    const day = (d: string | null) => d?.slice(0, 10) ?? null; // older saves may carry a time
    if (day(was.last_watched) !== day(f.last_watched) && was.watched === f.watched)
      d.dated.push({ film: f, from: was.last_watched, to: f.last_watched });
  }
  return d;
}

/** The fresh films, each carrying its saved match (fixes included); `unmatched` are the ones still to look up. */
export function mergeUpdate(saved: Film[], fresh: Film[]): { films: Film[]; unmatched: Film[] } {
  const old = new Map(saved.map((f) => [filmKey(f), f]));
  const films = fresh.map((f) => {
    const was = old.get(filmKey(f));
    return was ? { ...f, ...Object.fromEntries(MATCH_FIELDS.map((k) => [k, was[k]])) } : f;
  });
  return { films, unmatched: films.filter((f) => !old.has(filmKey(f))) };
}
