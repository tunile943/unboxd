"use client";

import { useRef } from "react";
import type { Film } from "@/lib/export";
import { Wordmark } from "./Logo";
import { SampleLabel } from "./SampleLabel";
import { SettingsMenu } from "./SettingsMenu";

// Owner: agent B (results). Skeleton.
export function ResultsHeader({ films, isSample, onReset }: { films: Film[]; isSample: boolean; onReset: () => void }) {
  const label = useRef<HTMLDialogElement>(null);
  const watched = films.filter((f) => f.watched);
  const rated = watched.filter((f) => f.rating !== null);
  return (
    <header className="rhead">
      <Wordmark />
      {isSample ? (
        <div className="sample-strip">
          <span><b>Sample diary</b> · {watched.length} films · {rated.length} rated</span>
          <button className="info" type="button" aria-label="Who is the sample diary?" aria-haspopup="dialog"
                  onClick={() => label.current?.showModal()}>i</button>
          <button className="link" type="button" onClick={onReset}>Use your own export</button>
          <SampleLabel ref={label} />
        </div>
      ) : (
        <div className="manage">
          <span className="stamp"><b>{watched.length} films</b> · {rated.length} rated</span>
          <button className="btn ghost sm" type="button" onClick={onReset}>Start over</button>
        </div>
      )}
      <SettingsMenu />
    </header>
  );
}
