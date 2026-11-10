"use client";

import { useState } from "react";
import type { Film } from "@/lib/export";
import type { Fix } from "../useUnboxd";
import { MatchReview } from "./MatchReview";

const MATCH = {
  high: ["ok", "✓", "Matched"],
  low: ["q", "?", "Unsure match"],
  none: ["no", "–", "Not found"],
  user: ["fix", "✓", "Manually fixed"],
} as const;

const PAGE = 100;

export const needsReview = (f: Film) => f.match_confidence === "low" || f.match_confidence === "none";
const reviewable = (f: Film) => needsReview(f) || f.match_confidence === "user"; // fixed rows stay in the filter

function stars(rating: number | null) {
  if (rating === null) return "—";
  return "★".repeat(Math.floor(rating)) + (rating % 1 ? "½" : "");
}

export function DataTable({ films, reviewFirst = false, onFix }:
  { films: Film[]; reviewFirst?: boolean; onFix: (film: Film, fix: Fix) => void }) {
  const [onlyReview, setOnlyReview] = useState(reviewFirst);
  const [reviewing, setReviewing] = useState<{ film: Film; button: HTMLButtonElement } | null>(null);
  const [shown, setShown] = useState(PAGE);
  const watched = films.filter((f) => f.watched);
  const reviewCount = watched.filter(needsReview).length;
  const fixedCount = watched.filter((f) => f.match_confidence === "user").length;
  const sorted = [...watched].sort((a, b) => (b.weight ?? -2) - (a.weight ?? -2));
  const all = onlyReview ? sorted.filter(reviewable) : sorted;
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
        <button className="u-chip" type="button" aria-pressed={onlyReview} disabled={!watched.some(reviewable) && !onlyReview}
                onClick={() => { setOnlyReview((v) => !v); setShown(PAGE); }}>
          Needs review ({reviewCount}{fixedCount ? ` · ${fixedCount} fixed` : ""})
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
              const [st, mark, matchLabel] = MATCH[f.match_confidence ?? "none"];
              const label = f.match_confidence === "user" ? f.match_reason ?? matchLabel : matchLabel;
              const w = f.weight;
              return (
                <tr key={`${f.name}-${f.year}-${i}`} data-st={st}>
                  <td className="stc">
                    <span className={`st ${st}`} role="img" aria-label={label} title={f.match_reason && f.match_confidence !== "user" ? `${label}: ${f.match_reason}` : label}>
                      {mark}
                    </span>
                  </td>
                  <td className="film">
                    {f.name}
                    {f.media_type === "tv" && <span className="muted"> · TV</span>}
                    {reviewable(f) && (
                      <button className="u-review-btn" type="button" aria-haspopup="dialog"
                              onClick={(e) => setReviewing({ film: f, button: e.currentTarget })}>
                        {needsReview(f) ? "Review" : "Change"}<span className="sr-only"> match for {f.name}</span>
                      </button>
                    )}
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
        {reviewing && (
          <MatchReview film={reviewing.film} returnTo={reviewing.button}
                       onFix={(fix) => onFix(reviewing.film, fix)} onClose={() => setReviewing(null)} />
        )}
        {left > 0 && (
          <button className="u-chip u-more" type="button" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, left)} more ({left} left)
          </button>
        )}
      </div>
    </div>
  );
}
