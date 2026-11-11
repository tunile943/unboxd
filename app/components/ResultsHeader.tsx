"use client";

import { useRef, useState } from "react";
import type { Film } from "@/lib/export";
import { formatDay } from "@/lib/store";
import { needsReview } from "./DataTable";
import { Wordmark } from "./Logo";
import { SampleLabel } from "./SampleLabel";
import { SettingsMenu } from "./SettingsMenu";

export function ResultsHeader({ films, isSample, savedAt, busy, updateButton, onUpdate, onClear, onReset, onReview }: {
  films: Film[]; isSample: boolean; savedAt: string | null; busy: boolean;
  updateButton: React.RefObject<HTMLButtonElement | null>;
  onUpdate: (file: File) => void; onClear: () => void; onReset: () => void; onReview: () => void;
}) {
  const label = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const clearButton = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const watched = films.filter((f) => f.watched);
  const rated = watched.filter((f) => f.rating !== null);
  const flagged = watched.filter(needsReview).length;
  const notice = flagged > 0 && (
    <button className="u-notice" type="button" onClick={onReview}>
      {flagged} {flagged === 1 ? "film needs" : "films need"} a check
    </button>
  );
  const keep = () => {
    setConfirming(false);
    requestAnimationFrame(() => clearButton.current?.focus());
  };
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
      ) : confirming ? (
        <div className="u-confirm" role="group" aria-labelledby="clear-q"
             onKeyDown={(e) => e.key === "Escape" && keep()}>
          <p>
            <b id="clear-q">Clear your data from this browser?</b> This removes your films, matches and fixes from this
            browser and returns to the start page.
          </p>
          <div className="u-confirm-actions">
            <button className="btn danger sm" type="button" onClick={onClear}>Clear browser data</button>
            <button className="btn ghost sm" type="button" autoFocus onClick={keep}>Keep my data</button>
          </div>
        </div>
      ) : (
        <div className="u-manage">
          <span className="u-stamp">
            {savedAt && <>Last updated: <b>{formatDay(savedAt)}</b> · </>}<b>{watched.length} films</b>
          </span>
          {notice}
          <input ref={file} type="file" accept=".zip,application/zip" hidden tabIndex={-1}
                 onChange={(e) => {
                   const f = e.target.files?.[0];
                   e.target.value = ""; // the same file can be chosen again
                   if (f) onUpdate(f);
                 }} />
          <button ref={updateButton} className="btn ghost sm" type="button" aria-disabled={busy}
                  onClick={() => !busy && file.current?.click()}>Update</button>
          <button ref={clearButton} className="btn danger-ghost sm" type="button" onClick={() => setConfirming(true)}>
            Clear data
          </button>
        </div>
      )}
      <SettingsMenu />
    </header>
  );
}
