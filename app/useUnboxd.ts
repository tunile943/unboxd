"use client";

import { useCallback, useRef, useState } from "react";
import { type Film, loadSample, type Pick, parseFilms, RESOLVE_BATCH, readExport, recommend, resolveFilms } from "@/lib/export";

/**
 * idle → reading → matching (one batchTick per finished TMDB batch) → packing → opening → revealed.
 * "opening" is the lid/reveal animation: LandingBox calls opened() when it's done (immediately under reduced
 * motion). An error at any step returns to idle with `error` set; the landing label shows it.
 */
export type Phase = "idle" | "reading" | "matching" | "packing" | "opening" | "revealed";

export type UnboxdState = {
  phase: Phase;
  error: string;
  progress: { done: number; total: number } | null;
  batchTick: number; // increments per finished matching batch: the jiggle trigger
  isSample: boolean;
  films: Film[] | null;
  picksIn: Pick[] | null;
  picksOut: Pick[] | null; // loads in the background after Boxd In
  outError: string;
};

const INITIAL: UnboxdState = {
  phase: "idle", error: "", progress: null, batchTick: 0, isSample: false,
  films: null, picksIn: null, picksOut: null, outError: "",
};

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useUnboxd() {
  const [state, setState] = useState<UnboxdState>(INITIAL);
  const run = useRef(0); // a newer run discards a pending one (including a background Boxd Out)
  const set = (patch: Partial<UnboxdState>) => setState((s) => ({ ...s, ...patch }));

  const start = useCallback(async (getFiles: () => Promise<Record<string, string>>, isSample: boolean) => {
    const current = ++run.current;
    const live = () => current === run.current;
    setState({ ...INITIAL, phase: "reading", isSample });
    try {
      const parsed = await parseFilms(await getFiles());
      if (!live()) return;
      set({ phase: "matching", progress: { done: 0, total: Math.ceil(parsed.length / RESOLVE_BATCH) } });
      const films = await resolveFilms(parsed, (done, total) => {
        if (live()) setState((s) => ({ ...s, progress: { done, total }, batchTick: s.batchTick + 1 }));
      });
      if (!live()) return;
      set({ films, phase: "packing" });
      const picksIn = await recommend(films, "in");
      if (!live()) return;
      set({ picksIn, phase: "opening" });
      recommend(films, "out", picksIn.map((p) => p.tmdb_id)).then(
        (picksOut) => live() && set({ picksOut }),
        (err) => live() && set({ outError: message(err) }),
      );
    } catch (err) {
      if (live()) setState({ ...INITIAL, isSample, error: message(err) });
    }
  }, []);

  return {
    ...state,
    upload: useCallback((file: File) => start(() => readExport(file), false), [start]),
    trySample: useCallback(() => start(loadSample, true), [start]),
    opened: useCallback(() => setState((s) => (s.phase === "opening" ? { ...s, phase: "revealed" } : s)), []),
    reset: useCallback(() => {
      run.current++;
      setState(INITIAL);
    }, []),
  };
}

export type Unboxd = ReturnType<typeof useUnboxd>;
