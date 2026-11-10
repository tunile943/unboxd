"use client";

import type { Film } from "@/lib/export";

// Owner: agent B. Skeleton carried over from the old page: needs-review list and the weight table.
export function DataTable({ films }: { films: Film[] }) {
  const unsure = films.filter((f) => f.match_confidence === "low");
  const notFound = films.filter((f) => f.match_confidence === "none");
  return (<><NeedsReview unsure={unsure} notFound={notFound} /><FilmTable films={films.filter((f) => f.watched)} /></>);
}

const MATCH_MARK = { high: "✓", low: "?", none: "–" } as const;

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
