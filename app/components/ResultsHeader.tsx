"use client";

import { useRef } from "react";
import type { Film } from "@/lib/export";
import { Wordmark } from "./Logo";
import { SampleLabel } from "./SampleLabel";
import { SettingsMenu } from "./SettingsMenu";

export function ResultsHeader({ films, isSample, onReset }: { films: Film[]; isSample: boolean; onReset: () => void }) {
  const label = useRef<HTMLDialogElement>(null);
  const watched = films.filter((f) => f.watched);
  const rated = watched.filter((f) => f.rating !== null);
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
          <button className="btn or sm" type="button" onClick={onReset}>Use your own export</button>
          <SampleLabel ref={label} />
        </div>
      ) : (
        <div className="u-manage">
          <span className="u-stamp"><b>{watched.length} films</b> · {rated.length} rated</span>
          <button className="btn ghost sm" type="button" onClick={onReset}>Start over</button>
        </div>
      )}
      <SettingsMenu />
    </header>
  );
}
