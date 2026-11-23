"use client";

import type { Extras, Pick } from "@/lib/export";
import { useModal } from "../useModal";
import { FilmDetails } from "./FilmDetails";

/** Desktop details: a modal side panel. Escape, the × or a click outside closes it; focus goes back to the card. */
export function DetailsDrawer({ pick, extras, region, play, returnTo, onClose }: {
  pick: Pick; extras: Extras | null | undefined; region: string; play: boolean;
  returnTo: HTMLElement | null; onClose: () => void;
}) {
  const modal = useModal(onClose, returnTo);

  return (
    <dialog {...modal} className="u-drawer" aria-labelledby="drawer-title">
      <div className="u-drawer-in">
        <header>
          <h2 id="drawer-title">{pick.title} <span>{pick.year}</span></h2>
          <button className="u-x" type="button" aria-label="Close" onClick={() => modal.ref.current?.close()}>×</button>
        </header>
        <p className="u-why">{pick.reason}</p>
        <FilmDetails key={pick.tmdb_id} pick={pick} extras={extras} region={region} autoplay={play} />
      </div>
    </dialog>
  );
}
