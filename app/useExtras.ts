"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EXTRAS_BATCH, type Extras, fetchExtras, type Pick } from "@/lib/export";

/** undefined = still loading, null = failed (cards then just skip trailer and providers). */
export type ExtrasFor = (id: number) => Extras | null | undefined;

/** Fetches trailer + providers for each list as it arrives, and again per region. Results are kept per region;
 *  a failed batch shows as null and is retried the next time the lists or region change. */
export function useExtras(picksIn: Pick[] | null, picksOut: Pick[] | null, region: string): ExtrasFor {
  const [found, setFound] = useState<Record<string, Extras | null>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    const todo = [...(picksIn ?? []), ...(picksOut ?? [])].filter((p) => !requested.current.has(`${region}:${p.tmdb_id}`));
    if (!todo.length) return;
    for (let i = 0; i < todo.length; i += EXTRAS_BATCH) {
      const batch = todo.slice(i, i + EXTRAS_BATCH);
      const keys = batch.map((p) => `${region}:${p.tmdb_id}`);
      keys.forEach((k) => requested.current.add(k));
      fetchExtras(batch, region).then(
        (byId) => setFound((f) => ({ ...f, ...Object.fromEntries(batch.map((p, j) => [keys[j], byId[p.tmdb_id] ?? null])) })),
        () => {
          keys.forEach((k) => requested.current.delete(k));
          setFound((f) => ({ ...f, ...Object.fromEntries(keys.map((k) => [k, null])) }));
        },
      );
    }
  }, [picksIn, picksOut, region]);

  return useCallback((id: number) => found[`${region}:${id}`], [found, region]);
}
