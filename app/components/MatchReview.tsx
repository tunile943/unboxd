"use client";

import { useEffect, useRef, useState } from "react";
import { type Film, lookupTitle, parseTmdbLink, searchTitles, type Title } from "@/lib/export";
import type { Fix } from "../useUnboxd";

const KIND = { movie: "Film", tv: "Limited series" };

function Option({ t, action, onPick }: { t: Title; action: string; onPick: () => void }) {
  return (
    <li>
      <button className="u-opt" type="button" onClick={onPick}>
        {t.poster_path ? (
          <img src={`https://image.tmdb.org/t/p/w92${t.poster_path}`} alt="" width={40} height={60} loading="lazy" />
        ) : (
          <span className="u-opt-ph" aria-hidden="true" />
        )}
        <span className="u-opt-t">
          <b>{t.title ?? "Untitled"}</b>
          <small>{[t.year, KIND[t.media_type]].filter(Boolean).join(" · ")}</small>
        </span>
        <span className="u-opt-go">{action}</span>
      </button>
      {/* Namesakes look alike here: the TMDB page shows cast and plot to tell them apart. */}
      <a className="u-opt-link" href={`https://www.themoviedb.org/${t.media_type}/${t.id}`} target="_blank" rel="noreferrer">
        TMDB ↗<span className="sr-only"> {t.title}{t.year ? ` (${t.year})` : ""}</span>
      </a>
    </li>
  );
}

type Search = { state: "idle" | "loading" | "done" | "error"; results: Title[] };

/** Match review: confirm the current match, pick a runner-up, search TMDB (or paste a TMDB link), or skip. */
export function MatchReview({ film, returnTo, onFix, onClose }:
  { film: Film; returnTo: HTMLElement | null; onFix: (fix: Fix) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(film.name);
  const [year, setYear] = useState(film.year ? String(film.year) : "");
  const [search, setSearch] = useState<Search>({ state: "idle", results: [] });

  useEffect(() => {
    const dlg = ref.current!;
    if (!dlg.open) dlg.showModal();
    if (!film.tmdb_id) input.current?.focus(); // nothing to confirm: start at search
    return () => returnTo?.focus();
  }, [returnTo, film.tmdb_id]);

  // Debounced; a pasted TMDB link looks that one title up instead.
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return setSearch({ state: "idle", results: [] });
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
  }, [q, year]);

  const pick = (fix: Fix) => {
    onFix(fix);
    ref.current?.close();
  };
  const current: Title | null = film.tmdb_id && film.media_type
    ? { id: film.tmdb_id, title: film.tmdb_title ?? null, year: film.tmdb_year ?? null, poster_path: film.tmdb_poster ?? null,
        media_type: film.media_type }
    : null;
  const others = (film.candidates ?? []).filter((c) => !(c.id === film.tmdb_id && c.media_type === film.media_type));
  const key = (t: { media_type?: string | null; id?: number | null }) => `${t.media_type}:${t.id}`; // ids repeat across movie/tv
  const shown = new Set([key({ media_type: film.media_type, id: film.tmdb_id }), ...others.map(key)]);
  const found = search.results.filter((c) => !shown.has(key(c)));

  return (
    <dialog ref={ref} className="u-drawer u-review" aria-labelledby="review-title" onClose={onClose}
            onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}>
      <div className="u-drawer-in">
        <header>
          <h2 id="review-title">Match review</h2>
          <button className="u-x" type="button" aria-label="Close" onClick={() => ref.current?.close()}>×</button>
        </header>
        <p className="u-diary">
          Your diary: <b>{film.name}</b>{film.year ? ` (${film.year})` : ""}
          {film.match_reason && <span className="u-reason">{film.match_reason}</span>}
        </p>

        {current && (
          <section aria-labelledby="rv-current">
            <h3 id="rv-current">Current match</h3>
            <ul className="u-opts"><Option t={current} action="This is right" onPick={() => pick("confirm")} /></ul>
          </section>
        )}
        {others.length > 0 && (
          <section aria-labelledby="rv-others">
            <h3 id="rv-others">Other matches</h3>
            <ul className="u-opts">{others.map((c) => <Option key={`${c.media_type}${c.id}`} t={c} action="Use this" onPick={() => pick(c)} />)}</ul>
          </section>
        )}

        <section aria-labelledby="rv-search" className="u-search">
          <h3 id="rv-search">Search TMDB</h3>
          <form role="search" onSubmit={(e) => e.preventDefault()}>
            <label>
              <span>Title or TMDB link</span>
              <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            </label>
            <label className="yr">
              <span>Year</span>
              <input inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} />
            </label>
          </form>
          <div aria-live="polite">
            {search.state === "loading" && <p className="fine">Searching…</p>}
            {search.state === "error" && <p className="fine">Search failed. Try again.</p>}
            {search.state === "done" && (
              <p className="fine">{found.length ? `${found.length} ${found.length === 1 ? "result" : "results"}` : "No other matches on TMDB."}</p>
            )}
          </div>
          {search.state === "done" && found.length > 0 && (
            <ul className="u-opts">{found.map((c) => <Option key={`${c.media_type}${c.id}`} t={c} action="Use this" onPick={() => pick(c)} />)}</ul>
          )}
        </section>

        <footer className="u-review-foot">
          <button className="btn ghost sm" type="button" onClick={() => pick("skip")}>Not on TMDB</button>
          <span className="fine">Leaves this film out of your recommendations.</span>
        </footer>
      </div>
    </dialog>
  );
}
