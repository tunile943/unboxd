"use client";

import { useEffect, useId, useRef, useState } from "react";
import { type Film, lookupTitle, parseTmdbLink, searchTitles, type Title } from "@/lib/export";
import type { Fix } from "../useUnboxd";

const KIND = { movie: "Film", tv: "Limited series" };
const tmdbUrl = (t: Title) => `https://www.themoviedb.org/${t.media_type}/${t.id}`;
const poster = (t: Title, w: number) => `https://image.tmdb.org/t/p/w${w}${t.poster_path}`;

// What was typed in each film's search, so reopening its picker picks up where you left off (this session only).
const typed = new Map<string, { q: string; year: string }>();

function Poster({ t, big = false }: { t: Title; big?: boolean }) {
  return t.poster_path
    ? <img className="u-rv-ps" src={poster(t, big ? 154 : 92)} alt="" width={big ? 72 : 40} height={big ? 108 : 60} loading="lazy" />
    : <span className="u-rv-ps" aria-hidden="true" />;
}

/** A runner-up or search result: smaller and plainer than the current match. */
function Alternative({ t, diaryYear, onPick }: { t: Title; diaryYear: number | null; onPick: () => void }) {
  const sameYear = diaryYear !== null && t.year === diaryYear;
  return (
    <li className="u-alt">
      <Poster t={t} />
      <span className="u-alt-t">
        <b>{t.title ?? "Untitled"}</b>
        <small>
          {t.year && <span className={sameYear ? "u-yr-ok" : undefined}>{t.year}{sameYear && <> ✓<span className="sr-only">, same year as your diary</span></>}</span>}
          {t.year && " · "}{KIND[t.media_type]} · {/* namesakes look alike: TMDB's page has cast and plot */}
          <a href={tmdbUrl(t)} target="_blank" rel="noreferrer">TMDB ↗<span className="sr-only"> {t.title}</span></a>
        </small>
      </span>
      <button className="u-choose" type="button" onClick={onPick}>
        Choose<span className="sr-only"> {t.title}{t.year ? ` (${t.year})` : ""}</span>
      </button>
    </li>
  );
}

type Search = { state: "idle" | "loading" | "done" | "error"; results: Title[] };

/**
 * Match review: the current match first and largest, then the runner-ups matching found, then (folded unless there's
 * nothing else to choose from) a TMDB search that also takes a pasted TMDB link, and "Not on TMDB".
 */
export function MatchReview({ film, returnTo, onFix, onClose }:
  { film: Film; returnTo: HTMLElement | null; onFix: (fix: Fix) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const memo = `${film.name}|${film.year}`;
  const current: Title | null = film.tmdb_id && film.media_type
    ? { id: film.tmdb_id, title: film.tmdb_title ?? null, year: film.tmdb_year ?? null, poster_path: film.tmdb_poster ?? null,
        media_type: film.media_type }
    : null;
  const others = (film.candidates ?? []).filter((c) => !(c.id === film.tmdb_id && c.media_type === film.media_type));
  const [open, setOpen] = useState(() => typed.has(memo) || (!current && !others.length));
  const [q, setQ] = useState(typed.get(memo)?.q ?? film.name);
  const [year, setYear] = useState(typed.get(memo)?.year ?? (film.year ? String(film.year) : ""));
  const [search, setSearch] = useState<Search>({ state: "idle", results: [] });

  useEffect(() => {
    const dlg = ref.current!;
    if (!dlg.open) dlg.showModal();
    if (!current && !others.length) input.current?.focus(); // nothing to choose from: start at search
    return () => returnTo?.focus();
  }, [returnTo]); // on open only

  useEffect(() => {
    if (open) typed.set(memo, { q, year });
  }, [open, memo, q, year]);

  // Only while open (a routine confirm costs no TMDB call). Debounced; a pasted TMDB link looks that one title up.
  useEffect(() => {
    const text = q.trim();
    if (!open || text.length < 2) return setSearch({ state: "idle", results: [] });
    let live = true;
    setSearch({ state: "loading", results: [] }); // old results go at once, so they can't be picked mid-typing
    const timer = setTimeout(() => {
      const link = parseTmdbLink(text);
      const y = Number(year) >= 1870 && Number(year) <= 2100 ? Number(year) : null; // else the year is ignored
      (link ? lookupTitle(link.media_type, link.id).then((t) => (t ? [t] : [])) : searchTitles(text, y)).then(
        (results) => live && setSearch({ state: "done", results }),
        () => live && setSearch({ state: "error", results: [] }),
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, q, year]);

  const pick = (fix: Fix) => {
    onFix(fix);
    ref.current?.close();
  };
  const key = (t: { media_type?: string | null; id?: number | null }) => `${t.media_type}:${t.id}`; // ids repeat across movie/tv
  const shown = new Set([key({ media_type: film.media_type, id: film.tmdb_id }), ...others.map(key)]);
  const found = search.results.filter((c) => !shown.has(key(c)));
  const yearsOff = current?.year && film.year ? Math.abs(current.year - film.year) : 0;
  const flag = yearsOff ? `${current!.year} · ${yearsOff} ${yearsOff === 1 ? "year" : "years"} off your diary`
    : film.match_confidence === "user" ? null : film.match_reason;

  return (
    <dialog ref={ref} className="u-drawer u-review" aria-labelledby={`${id}-t`} onClose={onClose}
            onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}>
      <div className="u-drawer-in">
        <header>
          <h2 id={`${id}-t`}>Match review</h2>
          <button className="u-x" type="button" aria-label="Close" onClick={() => ref.current?.close()}>×</button>
        </header>

        <div>
          <p className="u-rv-lbl">Your diary</p>
          <p className="u-rv-diary"><b>{film.name}</b>{film.year && <span>{film.year}</span>}</p>
        </div>

        {current && (
          <section aria-labelledby={`${id}-c`}>
            <p className="u-rv-lbl" id={`${id}-c`}>{film.match_confidence === "user" ? "Matched to" : "We matched it to"}</p>
            <div className="u-rv-hero">
              <Poster t={current} big />
              <div>
                <h3>{current.title ?? "Untitled"}</h3>
                {flag && <span className="u-rv-flag">{flag}</span>}
                <p className="u-rv-meta">
                  {!yearsOff && current.year && `${current.year} · `}{KIND[current.media_type]} · <a href={tmdbUrl(current)} target="_blank" rel="noreferrer">See on TMDB ↗</a>
                </p>
                <button className="u-rv-yes" type="button" onClick={() => pick("confirm")}>Yes, this is the one</button>
              </div>
            </div>
          </section>
        )}

        {others.length > 0 && (
          <section aria-labelledby={`${id}-o`}>
            <p className="u-rv-or" id={`${id}-o`}>{current ? "Not it? Pick the right one" : "Pick the right one"}</p>
            <ul className="u-alts">
              {others.map((c) => <Alternative key={key(c)} t={c} diaryYear={film.year} onPick={() => pick(c)} />)}
            </ul>
          </section>
        )}

        <div className={`u-rv-search${open ? " open" : ""}`}>
          <button className="u-rv-disc" type="button" aria-expanded={open} aria-controls={`${id}-s`}
                  onClick={() => setOpen((o) => !o)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <span>Search TMDB {!open && <small>· or paste a TMDB link</small>}</span>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d={open ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} /></svg>
          </button>
          {open && (
            <div id={`${id}-s`} className="u-rv-sbody">
              <form role="search" onSubmit={(e) => e.preventDefault()}>
                <label>
                  <span>Title or TMDB link</span>
                  <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
                </label>
                <label>
                  <span>Year</span>
                  <input inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
                </label>
              </form>
              <p className="fine" aria-live="polite">
                {search.state === "loading" ? "Searching…"
                  : search.state === "error" ? "Search failed. Try again."
                  : search.state === "done" ? (found.length
                    ? `${found.length} more ${found.length === 1 ? "result" : "results"}${current || others.length ? ", not listed above" : ""}`
                    : "No other matches on TMDB.")
                  : ""}
              </p>
              {search.state === "done" && found.length > 0 && (
                <ul className="u-alts">
                  {found.map((c) => <Alternative key={key(c)} t={c} diaryYear={film.year} onPick={() => pick(c)} />)}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className="u-review-foot">
          <span className="fine">Can&apos;t find it anywhere?</span>
          <button className="u-choose" type="button" onClick={() => pick("skip")}>Not on TMDB</button>
        </footer>
      </div>
    </dialog>
  );
}
