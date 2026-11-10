"use client";

import { useEffect, useState } from "react";
import type { Pick } from "@/lib/export";
import type { ExtrasFor } from "../useExtras";
import { useMediaQuery } from "../useMediaQuery";
import { DetailsDrawer } from "./DetailsDrawer";
import { type OpenDetails, PickCard } from "./PickCard";
import type { Tab } from "./Tabs";

type Open = { pick: Pick; play: boolean; button: HTMLButtonElement };

// Desktop shows both columns, each scrolling on its own (focusable so keyboards can scroll them);
// phones show the one matching the selected tab. Details open in a drawer on desktop and inside the card on phones.
export function PickColumns({ picksIn, picksOut, outError, tab, extras, region }: {
  picksIn: Pick[]; picksOut: Pick[] | null; outError: string; tab: Tab; extras: ExtrasFor; region: string;
}) {
  const phone = useMediaQuery("(max-width: 640px)");
  const [open, setOpen] = useState<Open | null>(null);
  useEffect(() => setOpen(null), [phone]); // a drawer shouldn't pop open (or a card expand) on rotate or resize

  const onDetails: OpenDetails = (pick, { play, button }) =>
    setOpen((o) => (phone && o?.pick.tmdb_id === pick.tmdb_id && !play ? null : { pick, play, button }));

  const list = (picks: Pick[]) => (
    <ol className="u-picks">
      {picks.map((p, i) => (
        <PickCard key={p.tmdb_id} pick={p} index={i} extras={extras(p.tmdb_id)} region={region} phone={phone}
                  expanded={phone && open?.pick.tmdb_id === p.tmdb_id ? { play: open.play } : null} onDetails={onDetails} />
      ))}
    </ol>
  );

  return (
    <div className="u-split" data-tab={tab}>
      <section className="u-col in" aria-label="Boxd In" tabIndex={0}>
        <header><h2>Boxd In</h2><p>More of what you love.</p></header>
        {list(picksIn)}
      </section>
      <section className="u-col out" aria-label="Boxd Out" tabIndex={0}>
        <header><h2>Boxd Out</h2><p>Highly-rated movies beyond your rated genres/styles.</p></header>
        {outError ? (
          <p className="error" role="alert">Couldn&apos;t pack Boxd Out: {outError}</p>
        ) : picksOut ? (
          list(picksOut)
        ) : (
          <p className="u-packing" aria-live="polite">Packing…</p>
        )}
      </section>
      {!phone && open && (
        <DetailsDrawer pick={open.pick} extras={extras(open.pick.tmdb_id)} region={region} play={open.play}
                       returnTo={open.button} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
