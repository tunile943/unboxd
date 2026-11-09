"use client";

import { useState } from "react";
import { type Film, type Pick, parseFilms, RESOLVE_BATCH, readExport, recommend, resolveFilms } from "@/lib/export";

type Tab = "in" | "out" | "data";

export default function Home() {
  const [films, setFilms] = useState<Film[] | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [tab, setTab] = useState<Tab>("in");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [picksIn, setPicksIn] = useState<Pick[] | null>(null);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setFilms(null);
    setPicksIn(null);
    try {
      setStatus("Unzipping your export…");
      const files = await readExport(file);
      setStatus("Weighting your films…");
      const parsed = await parseFilms(files);
      setStatus("Matching films on TMDB…");
      setProgress({ done: 0, total: Math.ceil(parsed.length / RESOLVE_BATCH) });
      const resolved = await resolveFilms(parsed, (done, total) => setProgress({ done, total }));
      setFilms(resolved);
      setProgress(null);
      setStatus("Packing your Boxd In…");
      setPicksIn(await recommend(resolved, "in"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatus("");
      setProgress(null);
    }
  }

  const watched = films?.filter((f) => f.watched) ?? [];
  const rated = watched.filter((f) => f.rating !== null);
  const unsure = films?.filter((f) => f.match_confidence === "low") ?? [];
  const notFound = films?.filter((f) => f.match_confidence === "none") ?? [];

  return (
    <main>
      <h1>Unboxd</h1>
      <p className="muted">Letterboxd recommendations in two modes: stay in your box, or step out of it.</p>

      <label className="upload">
        <strong>Upload your Letterboxd export (.zip)</strong>
        <br />
        <span className="muted">Letterboxd → Settings → Data → Export your data</span>
        <br />
        <input type="file" accept=".zip" onChange={onUpload} style={{ marginTop: 12 }} />
      </label>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        The ZIP is unzipped in your browser. Only your film list and ratings are sent to the server,
        and nothing is stored.
      </p>

      {status && (
        <p>
          {status}
          {progress && ` batch ${progress.done}/${progress.total}`}
        </p>
      )}
      {progress && <progress value={progress.done} max={progress.total} style={{ width: "100%" }} />}
      {error && <p className="error">{error}</p>}

      {films && (
        <>
          <p>
            {watched.length} films watched, {rated.length} rated,{" "}
            {films.filter((f) => f.on_watchlist).length} on your watchlist.
            <br />
            {films.length - unsure.length - notFound.length} matched on TMDB ·{" "}
            {unsure.length + notFound.length} need review
          </p>

          <div className="tabs" role="tablist">
            {(
              [
                ["in", "Boxd In"],
                ["out", "Boxd Out"],
                ["data", "Your data"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          {tab === "in" && <PickList description="More of what you love." picks={picksIn} />}
          {tab === "out" && <p className="muted">Edge-of-taste picks: coming soon.</p>}
          {tab === "data" && (
            <>
              <NeedsReview unsure={unsure} notFound={notFound} />
              <FilmTable films={watched} />
            </>
          )}
        </>
      )}

      <footer className="muted">
        This product uses the TMDB API but is not endorsed or certified by TMDB. Not affiliated with
        Letterboxd.
      </footer>
    </main>
  );
}

const MATCH_MARK = { high: "✓", low: "?", none: "–" } as const;

function PickList({ description, picks }: { description: string; picks: Pick[] | null }) {
  return (
    <>
      <p className="muted">{description}</p>
      {picks === null ? (
        <p className="muted">Packing…</p>
      ) : (
        <ol className="picks">
          {picks.map((p) => (
            <li key={p.tmdb_id}>
              {p.poster_path ? (
                <img src={`https://image.tmdb.org/t/p/w92${p.poster_path}`} alt="" width={46} height={69} />
              ) : (
                <span className="poster-placeholder" />
              )}
              <div>
                <strong>{p.title}</strong> <span className="muted">{p.year}</span>
                {p.on_watchlist && <span className="badge">★ on your watchlist</span>}
                <br />
                <span className="muted">{p.reason}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function NeedsReview({ unsure, notFound }: { unsure: Film[]; notFound: Film[] }) {
  if (!unsure.length && !notFound.length) return null;
  const group = (title: string, films: Film[]) =>
    films.length > 0 && (
      <>
        <h3>
          {title} ({films.length})
        </h3>
        <ul>
          {films.map((f) => (
            <li key={`${f.name}-${f.year}`}>
              {f.name} <span className="muted">{f.year}</span>
              {f.tmdb_id && ` → ${f.tmdb_title} (${f.tmdb_year ?? "?"})`}
              <span className="muted"> · {f.match_reason}</span>
            </li>
          ))}
        </ul>
      </>
    );
  return (
    <details>
      <summary>Needs review ({unsure.length + notFound.length})</summary>
      <p className="muted">Unchecked films still count, using our best guess.</p>
      {group("Unsure", unsure)}
      {group("Not found", notFound)}
    </details>
  );
}

function FilmTable({ films }: { films: Film[] }) {
  const rows = [...films].sort((a, b) => (b.weight ?? -2) - (a.weight ?? -2)).slice(0, 100);
  return (
    <div className="table-wrap">
      <p className="muted">Top 100 by weight. w′ ranges from −1 (least favorite) to +1 (favorite).</p>
      <table>
        <thead>
          <tr>
            <th>Film</th>
            <th className="num">Rating</th>
            <th>Liked</th>
            <th className="num">Rewatches</th>
            <th className="num">w′</th>
            <th>Match</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={`${f.name}-${f.year}`}>
              <td>
                {f.name} <span className="muted">{f.year}</span>
              </td>
              <td className="num">{f.rating ?? "—"}</td>
              <td>{f.liked ? "♥" : ""}</td>
              <td className="num">{f.rewatch_count || ""}</td>
              <td className="num">{f.weight?.toFixed(2) ?? "—"}</td>
              <td title={f.match_reason ?? undefined}>
                {f.match_confidence ? MATCH_MARK[f.match_confidence] : ""}
                {f.media_type === "tv" && <span className="muted"> TV</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
