"use client";

import type { Pick } from "@/lib/export";
import type { Tab } from "./Tabs";

// Desktop shows both columns; phones show the one matching the selected tab.
export function PickColumns({ picksIn, picksOut, outError, tab }:
  { picksIn: Pick[]; picksOut: Pick[] | null; outError: string; tab: Tab }) {
  return (
    <div className="u-split" data-tab={tab}>
      <section className="u-col in" aria-label="Boxd In">
        <header><h2>Boxd In</h2><p>More of what you love.</p></header>
        <PickList picks={picksIn} />
      </section>
      <section className="u-col out" aria-label="Boxd Out">
        <header><h2>Boxd Out</h2><p>Highly-rated movies beyond your rated genres/styles.</p></header>
        {outError ? (
          <p className="error" role="alert">Couldn&apos;t pack Boxd Out: {outError}</p>
        ) : picksOut ? (
          <PickList picks={picksOut} />
        ) : (
          <p className="u-packing" aria-live="polite">Packing…</p>
        )}
      </section>
    </div>
  );
}

function PickList({ picks }: { picks: Pick[] }) {
  return (
    <ol className="u-picks">
      {picks.map((p, i) => (
        <li key={p.tmdb_id} className="u-card" style={{ "--d": `${0.08 + Math.min(i, 8) * 0.05}s` } as React.CSSProperties}>
          {p.poster_path ? (
            <img className="poster" src={`https://image.tmdb.org/t/p/w154${p.poster_path}`} alt="" width={52} height={78} loading="lazy" />
          ) : (
            <span className="poster" style={{ "--c": `var(--po${(i % 6) + 1})` } as React.CSSProperties}>{p.title}</span>
          )}
          <div>
            <h3>{p.title} <span>{p.year}</span></h3>
            <p>{p.reason}</p>
            {(p.on_watchlist || p.bridge_label || p.new_label) && (
              <div className="u-stk">
                {p.on_watchlist && <span className="badge">★ on your watchlist</span>}
                {p.bridge_label && <span className="sticker">{p.bridge_label}</span>}
                {p.new_label && <span className="sticker new">new: {p.new_label}</span>}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
