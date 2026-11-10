"use client";

import type { Pick } from "@/lib/export";
import type { Tab } from "./Tabs";

// Owner: agent B. Desktop shows both columns; phones show the one matching the selected tab.
export function PickColumns({ picksIn, picksOut, outError, tab }:
  { picksIn: Pick[]; picksOut: Pick[] | null; outError: string; tab: Tab }) {
  return (
    <div className="split" data-tab={tab}>
      <section className="col in" aria-label="Boxd In">
        <header><h2>Boxd In</h2><p>More of what you love.</p></header>
        <PickList picks={picksIn} />
      </section>
      <section className="col out" aria-label="Boxd Out">
        <header><h2>Boxd Out</h2><p>Highly-rated movies beyond your rated genres/styles.</p></header>
        {outError ? <p className="error">{outError}</p> : picksOut ? <PickList picks={picksOut} /> : <p className="muted">Packing…</p>}
      </section>
    </div>
  );
}

function PickList({ picks }: { picks: Pick[] }) {
  return (
    <ol className="picks">
      {picks.map((p) => (
        <li key={p.tmdb_id} className="card">
          {p.poster_path ? (
            <img src={`https://image.tmdb.org/t/p/w154${p.poster_path}`} alt="" width={52} height={78} loading="lazy" />
          ) : (
            <span className="poster">{p.title}</span>
          )}
          <div>
            <h3>{p.title} <span>{p.year}</span></h3>
            <p>{p.reason}</p>
            {p.on_watchlist && <span className="badge">★ on your watchlist</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
