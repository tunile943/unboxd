"use client";

import { useState } from "react";
import { type Film, parseFilms, readExport } from "@/lib/export";

type Tab = "in" | "out" | "data";

export default function Home() {
  const [films, setFilms] = useState<Film[] | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [tab, setTab] = useState<Tab>("in");

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setFilms(null);
    try {
      setStatus("Unzipping your export…");
      const files = await readExport(file);
      setStatus("Weighting your films…");
      setFilms(await parseFilms(files));
      setStatus("");
    } catch (err) {
      setStatus("");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const watched = films?.filter((f) => f.watched) ?? [];
  const rated = watched.filter((f) => f.rating !== null);

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

      {status && <p>{status}</p>}
      {error && <p className="error">{error}</p>}

      {films && (
        <>
          <p>
            {watched.length} films watched, {rated.length} rated,{" "}
            {films.filter((f) => f.on_watchlist).length} on your watchlist.
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

          {tab === "in" && <p className="muted">Comfort picks: coming soon.</p>}
          {tab === "out" && <p className="muted">Edge-of-taste picks: coming soon.</p>}
          {tab === "data" && <FilmTable films={watched} />}
        </>
      )}

      <footer className="muted">
        This product uses the TMDB API but is not endorsed or certified by TMDB. Not affiliated with
        Letterboxd.
      </footer>
    </main>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
