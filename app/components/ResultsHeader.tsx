"use client";

import { useRef } from "react";
import type { Film } from "@/lib/export";
import { needsReview } from "./DataTable";
import { Wordmark } from "./Logo";
import { SampleLabel } from "./SampleLabel";
import { SettingsMenu } from "./SettingsMenu";

export function ResultsHeader({ films, isSample, onReset, onReview }:
  { films: Film[]; isSample: boolean; onReset: () => void; onReview: () => void }) {
  const label = useRef<HTMLDialogElement>(null);
  const watched = films.filter((f) => f.watched);
  const rated = watched.filter((f) => f.rating !== null);
  const flagged = watched.filter(needsReview).length;
  const notice = flagged > 0 && (
    <button className="u-notice" type="button" onClick={onReview}>
      {flagged} {flagged === 1 ? "film needs" : "films need"} a check
    </button>
  );
  return (
    <header className="u-rhead">
      <Wordmark />
      {isSample ? (
        <div className="u-manage">
          <span className="u-sample">
            <b>Sample diary</b> · {watched.length} films · {rated.length} rated
            <button className="u-info" type="button" aria-label="Who is the sample diary?" aria-haspopup="dialog"
                    onClick={() => label.current?.showModal()}>i</button>
          </span>
          {notice}
          <button className="btn or sm" type="button" onClick={onReset}>Use your own export</button>
          <SampleLabel ref={label} />
        </div>
      ) : (
        <div className="u-manage">
          <span className="u-stamp"><b>{watched.length} films</b> · {rated.length} rated</span>
          {notice}
          <button className="btn ghost sm" type="button" onClick={onReset}>Start over</button>
        </div>
      )}
      <SettingsMenu />
    </header>
  );
}
