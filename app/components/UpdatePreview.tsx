"use client";

import { useEffect, useRef } from "react";
import type { Film } from "@/lib/export";
import { formatDay } from "@/lib/store";
import { type Diff, diffSize } from "@/lib/update";

const SHOWN = 6;
const named = (f: Film) => `${f.name}${f.year ? ` (${f.year})` : ""}`;
const stars = (r: number | null) => (r === null ? "unrated" : String(r));

function rows(d: Diff): { mark: string; text: string; kind: string }[] {
  return [
    ...d.added.map((f) => ({ mark: "+", text: named(f), kind: "new" })),
    ...d.rated.map((c) => ({ mark: "★", text: `${named(c.film)}: ${stars(c.from)} → ${stars(c.to)}`, kind: "rating" })),
    ...d.liked.map((c) => ({ mark: "♥", text: `${named(c.film)}: ${c.to ? "liked" : "no longer liked"}`, kind: "like" })),
    ...d.rewatched.map((c) => ({ mark: "↻", text: `${named(c.film)}: ${c.from} → ${c.to} rewatches`, kind: "rewatch" })),
    ...d.logged.map((c) => ({ mark: "✓", text: `${named(c.film)}: ${c.to ? "now watched" : "no longer logged as watched"}`, kind: "watched" })),
    ...d.listed.map((c) => ({ mark: "☆", text: `${named(c.film)}: ${c.to ? "added to" : "removed from"} your watchlist`, kind: "watchlist" })),
    ...d.dated.map((c) => ({ mark: "•", text: `${named(c.film)}: watched again ${c.to ?? ""}`.trim(), kind: "diary" })),
    ...d.removed.map((f) => ({ mark: "−", text: named(f), kind: "removed" })),
  ];
}

const count = (n: number, one: string, many: string) => (n ? [`${n} ${n === 1 ? one : many}`] : []);

/** Update: what a newer export changes, before anything is applied. */
export function UpdatePreview({ preview, savedAt, returnTo, onApply, onCancel }: {
  preview: { fileName: string; diff: Diff }; savedAt: string | null; returnTo: HTMLElement | null;
  onApply: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { diff } = preview;
  const changes = rows(diff);
  const addedWatched = diff.added.filter((f) => f.watched).length;
  const summary = [
    ...count(addedWatched, "new film", "new films").map((s) => `+${s}`),
    ...count(diff.added.length - addedWatched, "watchlist addition", "watchlist additions").map((s) => `+${s}`),
    ...count(diff.rated.length, "rating change", "rating changes"),
    ...count(diff.liked.length, "like change", "like changes"),
    ...count(diff.rewatched.length, "rewatch change", "rewatch changes"),
    ...count(diff.logged.length + diff.listed.length + diff.dated.length, "diary or watchlist change", "diary or watchlist changes"),
    ...count(diff.removed.length, "removed", "removed"),
  ];

  useEffect(() => {
    const dlg = ref.current!;
    if (!dlg.open) dlg.showModal();
    return () => returnTo?.focus();
  }, [returnTo]);

  const apply = () => {
    ref.current?.close();
    onApply();
  };

  return (
    <dialog ref={ref} className="u-drawer u-update" aria-labelledby="update-title" onClose={onCancel}
            onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}>
      <div className="u-drawer-in">
        <header>
          <h2 id="update-title">Update from a newer export</h2>
          <button className="u-x" type="button" aria-label="Close" onClick={() => ref.current?.close()}>×</button>
        </header>
        <p className="u-up-file">File: <b>{preview.fileName}</b></p>
        {diffSize(diff) ? (
          <>
            <ul className="u-up-counts">{summary.map((s) => <li key={s}>{s}</li>)}</ul>
            <p className="fine">
              {diff.added.length
                ? `Only the ${diff.added.length} new ${diff.added.length === 1 ? "title" : "titles"} will be looked up on TMDB.`
                : "Nothing new to look up on TMDB."} Your match fixes are kept.
            </p>
            <ul className="u-up-rows">
              {changes.slice(0, SHOWN).map((r, i) => (
                <li key={i} data-kind={r.kind}><span aria-hidden="true">{r.mark}</span> {r.text}<span className="sr-only">, {r.kind}</span></li>
              ))}
            </ul>
            {changes.length > SHOWN && <p className="fine">and {changes.length - SHOWN} more</p>}
            <div className="u-up-actions">
              <button className="btn or" type="button" onClick={apply}>Apply update</button>
              <button className="btn ghost" type="button" onClick={() => ref.current?.close()}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <p>Nothing has changed{savedAt ? ` since ${formatDay(savedAt)}` : ""}.</p>
            <div className="u-up-actions">
              <button className="btn ghost" type="button" onClick={() => ref.current?.close()}>Close</button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
