"use client";

import { useCallback, useRef, useState } from "react";
import {
  type Film, loadSample, type Pick, parseFilms, RESOLVE_BATCH, readExport, recommend, resolveFilms, type Title,
} from "@/lib/export";

/**
 * idle → reading → matching (one batchTick per finished TMDB batch) → packing → opening → revealed.
 * "opening" is the lid/reveal animation: LandingBox calls opened() when it's done (immediately under reduced
 * motion). An error at any step returns to idle with `error` set; the landing label shows it.
 * Once revealed, Match review fixes films one by one (fixMatch) and refresh() reruns both lists with them.
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
  pendingFixes: number; // fixes since the lists were last packed
  updating: boolean;
  updateError: string;
  updated: boolean; // the last update finished; cleared by the next fix
};

export type Fix = Title | "confirm" | "skip";

const INITIAL: UnboxdState = {
  phase: "idle", error: "", progress: null, batchTick: 0, isSample: false,
  films: null, picksIn: null, picksOut: null, outError: "", pendingFixes: 0, updating: false, updateError: "", updated: false,
};

function applyFix(f: Film, fix: Fix): Film {
  if (fix === "skip") {
    return { ...f, tmdb_id: null, tmdb_title: null, tmdb_year: null, tmdb_poster: null, media_type: null,
             match_confidence: "user", match_reason: "Manually skipped" };
  }
  if (fix === "confirm") return { ...f, match_confidence: "user", match_reason: "Manually confirmed" };
  return { ...f, tmdb_id: fix.id, tmdb_title: fix.title, tmdb_year: fix.year, tmdb_poster: fix.poster_path, media_type: fix.media_type,
           match_confidence: "user", match_reason: "Manually fixed" };
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useUnboxd() {
  const [state, setState] = useState<UnboxdState>(INITIAL);
  const run = useRef(0); // a newer run discards a pending one (including a background Boxd Out)
  const set = (patch: Partial<UnboxdState>) => setState((s) => ({ ...s, ...patch }));
  const latest = useRef(state);
  latest.current = state;

  /** Boxd Out loads in the background, excluding Boxd In's picks. */
  const packOut = (films: Film[], picksIn: Pick[], live: () => boolean) =>
    recommend(films, "out", picksIn.map((p) => p.tmdb_id)).then(
      (picksOut) => live() && set({ picksOut }),
      (err) => live() && set({ outError: message(err) }),
    );

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
      packOut(films, picksIn, live);
    } catch (err) {
      if (live()) setState({ ...INITIAL, isSample, error: message(err) });
    }
  }, []);

  return {
    ...state,
    upload: useCallback((file: File) => start(() => readExport(file), false), [start]),
    trySample: useCallback(() => start(loadSample, true), [start]),
    opened: useCallback(() => setState((s) => (s.phase === "opening" ? { ...s, phase: "revealed" } : s)), []),
    fixMatch: useCallback((film: Film, fix: Fix) => setState((s) => {
      if (!s.films?.includes(film)) return s;
      const fixed = applyFix(film, fix);
      // Only a different title changes the picks; confirming the current match doesn't.
      const changed = fixed.tmdb_id !== film.tmdb_id || fixed.media_type !== film.media_type;
      return {
        ...s,
        films: s.films.map((f) => (f === film ? fixed : f)),
        pendingFixes: s.pendingFixes + (changed ? 1 : 0),
        updated: changed ? false : s.updated,
      };
    }), []),
    refresh: useCallback(async () => {
      const { films, pendingFixes: included } = latest.current;
      if (!films) return;
      const current = ++run.current;
      const live = () => current === run.current;
      set({ updating: true, updateError: "", updated: false });
      try {
        const picksIn = await recommend(films, "in");
        if (!live()) return;
        // Fixes made while updating aren't in these lists yet, so they stay pending.
        setState((s) => ({ ...s, picksIn, picksOut: null, outError: "", updating: false, updated: true,
                           pendingFixes: s.pendingFixes - included }));
        packOut(films, picksIn, live);
      } catch (err) {
        if (live()) set({ updating: false, updateError: message(err) });
      }
    }, []),
    reset: useCallback(() => {
      run.current++;
      setState(INITIAL);
    }, []),
  };
}

export type Unboxd = ReturnType<typeof useUnboxd>;
