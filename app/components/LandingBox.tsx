"use client";

import { useEffect } from "react";
import type { Unboxd } from "../useUnboxd";

// Owner: agent A (landing + loading). Skeleton: real copy and states, no styling or animation yet.
const STATUS = {
  reading: "Opening your export…",
  matching: "Matching films on TMDB…",
  packing: "Packing your Boxd In…",
  opening: "Unpacking…",
} as const;

export function LandingBox({ u }: { u: Unboxd }) {
  const busy = u.phase !== "idle";
  // Skeleton: no reveal animation yet, so open straight away.
  useEffect(() => {
    if (u.phase === "opening") u.opened();
  }, [u.phase, u.opened]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="landing" data-testid="landing">
      <div className="landing-copy">
        <p className="kicker">A Letterboxd recommender</p>
        <h1 className="title">Two boxes of films, carefully packed from your ratings.</h1>
        <dl className="modes">
          <div className="mode in"><dt>Boxd In</dt><dd>More of what you love.</dd></div>
          <div className="mode out"><dt>Boxd Out</dt><dd>Highly-rated movies beyond your rated genres/styles.</dd></div>
        </dl>
      </div>
      <div className="box" data-phase={u.phase} data-batch={u.batchTick}>
        <div className="ship">
          {busy ? (
            <div className="prog" aria-live="polite">
              <h2>{u.isSample && u.phase === "reading" ? "Opening the sample diary…" : STATUS[u.phase as keyof typeof STATUS]}</h2>
              {u.progress && (
                <progress value={u.progress.done} max={u.progress.total}>
                  {u.progress.done}/{u.progress.total}
                </progress>
              )}
            </div>
          ) : (
            <div className="drop">
              <strong>Drop letterboxd-export.zip in the box</strong>
              <label className="btn or">
                Choose ZIP
                <input
                  type="file"
                  accept=".zip"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) u.upload(file);
                  }}
                />
              </label>
              <button className="btn ghost" type="button" onClick={u.trySample}>
                Try with sample data
              </button>
              <small>On Letterboxd: Settings → Data → Export your data</small>
              {u.error && <p className="error" role="alert">{u.error}</p>}
            </div>
          )}
          <div className="priv">
            <p><b>All data lives in-browser.*</b></p>
            <p className="muted">
              * Your export is stored only in this browser. Film lists are sent to our server to match them on TMDB,
              but we do not retain them.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
