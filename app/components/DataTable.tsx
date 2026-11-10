"use client";

import { useState } from "react";
import type { Film } from "@/lib/export";

const MATCH = {
  high: ["ok", "✓", "Matched"],
  low: ["q", "?", "Unsure match"],
  none: ["no", "–", "Not found"],
} as const;

const PAGE = 100;

const needsReview = (f: Film) => f.match_confidence === "low" || f.match_confidence === "none";

function stars(rating: number | null) {
  if (rating === null) return "—";
  return "★".repeat(Math.floor(rating)) + (rating % 1 ? "½" : "");
}

export function DataTable({ films }: { films: Film[] }) {
  const [onlyReview, setOnlyReview] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const watched = films.filter((f) => f.watched);
  const reviewCount = watched.filter(needsReview).length;
  const sorted = [...watched].sort((a, b) => (b.weight ?? -2) - (a.weight ?? -2));
  const all = onlyReview ? sorted.filter(needsReview) : sorted;
  const rows = all.slice(0, shown);
  const left = all.length - rows.length;

  return (
    <div className="u-dataview">
      <div className="u-sub">
        <h2>Your films by taste weight</h2>
        <span className="u-stamp">
          {onlyReview ? "Films that need a check." : `${all.length} watched.`} w′ runs from −1 to +1. It combines your rating, likes and rewatches.
        </span>
      </div>
      <div className="u-chips">
        <button className="u-chip" type="button" aria-pressed={onlyReview} disabled={!reviewCount && !onlyReview}
                onClick={() => { setOnlyReview((v) => !v); setShown(PAGE); }}>
          Needs review ({reviewCount})
        </button>
        <span className="u-stamp">Match: ✓ matched · ? unsure · – not found</span>
      </div>
      <div className="u-data-wrap">
        <table className="u-data">
          <thead>
            <tr>
              <th><span className="long">Match</span></th>
              <th>Film</th>
              <th className="yr">Year</th>
              <th><span className="long">Taste weight </span>w′</th>
              <th className="num"><span className="long">Rating</span><span className="short" aria-hidden="true">★</span></th>
              <th><span className="long">Liked</span><span className="short" aria-hidden="true">♥</span></th>
              <th className="num"><span className="long">Rewatches</span><span className="short" aria-hidden="true">↻</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => {
              const [st, mark, label] = MATCH[f.match_confidence ?? "none"];
              const w = f.weight;
              return (
                <tr key={`${f.name}-${f.year}-${f.tmdb_id ?? i}`} data-st={st}>
                  <td className="stc">
                    <span className={`st ${st}`} role="img" aria-label={label} title={f.match_reason ? `${label}: ${f.match_reason}` : label}>
                      {mark}
                    </span>
                  </td>
                  <td className="film">
                    {f.name}
                    {f.media_type === "tv" && <span className="muted"> · TV</span>}
                  </td>
                  <td className="yr">{f.year ?? "—"}</td>
                  {w === null ? (
                    <td className="muted">—</td>
                  ) : (
                    <td>
                      <span className={`wbar${w < 0 ? " n" : ""}`} aria-hidden="true">
                        <i style={{ "--w": Math.min(Math.abs(w), 1) } as React.CSSProperties} />
                      </span>
                      <span className={w < 0 ? "neg" : "pos"}>{(w < 0 ? "−" : "+") + Math.abs(w).toFixed(2)}</span>
                    </td>
                  )}
                  <td className="num">
                    <span aria-hidden="true">{stars(f.rating)}</span>
                    <span className="sr-only">{f.rating === null ? "Not rated" : `${f.rating} stars`}</span>
                  </td>
                  <td className="heart">{f.liked ? <span role="img" aria-label="Liked">♥</span> : ""}</td>
                  <td className="num">{f.rewatch_count}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td colSpan={7} className="muted">Nothing to show.</td></tr>
            )}
          </tbody>
        </table>
        {left > 0 && (
          <button className="u-chip u-more" type="button" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, left)} more ({left} left)
          </button>
        )}
      </div>
    </div>
  );
}
