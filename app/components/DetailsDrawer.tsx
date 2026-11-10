"use client";

import { useEffect, useRef } from "react";
import type { Extras, Pick } from "@/lib/export";
import { FilmDetails } from "./FilmDetails";

/** Desktop details: a modal side panel. Escape, the × or a click outside closes it; focus goes back to the card. */
export function DetailsDrawer({ pick, extras, region, play, returnTo, onClose }: {
  pick: Pick; extras: Extras | null | undefined; region: string; play: boolean;
  returnTo: HTMLElement | null; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current!;
    if (!dlg.open) dlg.showModal();
    return () => returnTo?.focus();
  }, [returnTo]);

  return (
    <dialog ref={ref} className="u-drawer" aria-labelledby="drawer-title" onClose={onClose}
            onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}>
      <div className="u-drawer-in">
        <header>
          <h2 id="drawer-title">{pick.title} <span>{pick.year}</span></h2>
          <button className="u-x" type="button" aria-label="Close" onClick={() => ref.current?.close()}>×</button>
        </header>
        <p className="u-why">{pick.reason}</p>
        <FilmDetails key={pick.tmdb_id} pick={pick} extras={extras} region={region} autoplay={play} />
      </div>
    </dialog>
  );
}
