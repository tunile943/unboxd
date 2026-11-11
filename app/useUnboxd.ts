"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Film, loadSample, type Pick, parseFilms, RESOLVE_BATCH, readExport, recommend, resolveFilms, type Title,
} from "@/lib/export";
import { clearSaved, loadSaved, onOtherTab, type Saved, save } from "@/lib/store";
import { type Diff, diffFilms, filmKey, mergeUpdate } from "@/lib/update";

/**
 * idle → reading → matching (one batchTick per finished TMDB batch) → packing → opening → revealed.
 * "opening" is the lid/reveal animation: LandingBox calls opened() when it's done (immediately under reduced
 * motion). An error at any step returns to idle with `error` set; the landing label shows it.
 * Once revealed, Match review fixes films one by one (fixMatch) and refresh() reruns both lists with them.
 * Your own data (never the sample) is saved in this browser: the page starts "restoring" and, if a save exists,
 * opens straight to the results. Update compares a newer export with it and looks up only new films.
 */
export type Phase = "restoring" | "idle" | "reading" | "matching" | "packing" | "opening" | "revealed";

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
  updatingText: string; // what the fix bar says while updating
  updatedText: string; // and once done
  savedAt: string | null; // when this export was uploaded or last updated (own data only)
  welcome: boolean; // restored from this browser on load
  preview: { fileName: string; fresh: Film[]; diff: Diff } | null; // an Update waiting for Apply
  cleared: { films: number; elsewhere: boolean } | null; // what Clear data removed, for the landing's note
};

export type Fix = Title | "confirm" | "skip";

const INITIAL: UnboxdState = {
  phase: "idle", error: "", progress: null, batchTick: 0, isSample: false,
  films: null, picksIn: null, picksOut: null, outError: "", pendingFixes: 0, updating: false, updateError: "", updated: false,
  updatingText: "", updatedText: "", savedAt: null, welcome: false, preview: null, cleared: null,
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
  const [state, setState] = useState<UnboxdState>({ ...INITIAL, phase: "restoring" });
  const run = useRef(0); // a newer run discards a pending one (including a background Boxd Out)
  const reading = useRef(0); // the same for reading an Update's file, which mustn't cancel Boxd Out
  const set = (patch: Partial<UnboxdState>) => setState((s) => ({ ...s, ...patch }));
  const latest = useRef(state);
  latest.current = state;
  const rev = useRef<string | undefined>(undefined); // the saved record this tab has; undefined: write regardless
  const persisted = useRef<unknown[]>([]); // what was last loaded or written, so it isn't written back

  const restore = (saved: Saved) => {
    rev.current = saved.rev;
    persisted.current = [saved.films, saved.picksIn, saved.picksOut, saved.savedAt];
  };

  /** Boxd Out loads in the background, excluding Boxd In's picks. */
  const packOut = (films: Film[], picksIn: Pick[], live: () => boolean) =>
    recommend(films, "out", picksIn.map((p) => p.tmdb_id)).then(
      (picksOut) => live() && set({ picksOut }),
      (err) => live() && set({ outError: message(err) }),
    );

  useEffect(() => {
    const current = run.current;
    const toIdle = () => setState((s) => (s.phase === "restoring" ? { ...s, phase: "idle" } : s));
    const timer = setTimeout(toIdle, 3000); // never stuck on "restoring"; a slower load still opens if nothing's started
    loadSaved().then((saved) => {
      clearTimeout(timer);
      if (current !== run.current || !["restoring", "idle"].includes(latest.current.phase)) return;
      if (!saved) return toIdle();
      restore(saved);
      setState({ ...INITIAL, phase: "revealed", films: saved.films, picksIn: saved.picksIn, picksOut: saved.picksOut,
                 savedAt: saved.savedAt, welcome: true });
      if (!saved.picksOut) packOut(saved.films, saved.picksIn, () => current === run.current); // saved before it was ready
    });
  }, []);

  /** Another tab saved or cleared: take its data, or go back to the start if it was cleared. */
  const sync = useCallback(async () => {
    const saved = await loadSaved();
    const s = latest.current;
    // Only a tab showing your saved data follows, and not when storage couldn't be read.
    if (saved === undefined || s.isSample || !s.savedAt || saved?.rev === rev.current) return;
    run.current++;
    reading.current++;
    if (!saved) {
      rev.current = undefined;
      return setState({ ...INITIAL, cleared: { films: s.films?.filter((f) => f.watched).length ?? 0, elsewhere: true } });
    }
    restore(saved);
    setState({ ...INITIAL, phase: "revealed", films: saved.films, picksIn: saved.picksIn, picksOut: saved.picksOut,
               savedAt: saved.savedAt, updated: true, updatedText: "Updated in another tab." });
  }, []); // a missing Boxd Out comes in the next message, once the tab that saved it has it
  useEffect(() => onOtherTab(sync), [sync]);

  // Save your own data whenever its films or picks change.
  const { films, picksIn, picksOut, isSample, savedAt } = state;
  useEffect(() => {
    if (isSample || !savedAt || !films || !picksIn) return;
    if ([films, picksIn, picksOut, savedAt].every((x, i) => x === persisted.current[i])) return;
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; // randomUUID needs https
    const record: Saved = { v: 1, rev: id, savedAt, films, picksIn, picksOut };
    const expect = rev.current;
    restore(record);
    save(record, expect).then((result) => {
      if (result === "stale") sync(); // another tab changed it first
      else if (result === "failed" && rev.current === record.rev) rev.current = expect; // nothing was written
    });
  }, [films, picksIn, picksOut, isSample, savedAt, sync]);

  const start = useCallback(async (getFiles: () => Promise<Record<string, string>>, isSample: boolean) => {
    const current = ++run.current;
    const live = () => current === run.current;
    rev.current = undefined; // a new upload replaces whatever is saved
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
      set({ picksIn, phase: "opening", savedAt: isSample ? null : new Date().toISOString() });
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
      set({ updating: true, updatingText: "Updating your picks…", updateError: "", updated: false });
      try {
        const picksIn = await recommend(films, "in");
        if (!live()) return;
        // Fixes made while updating aren't in these lists yet, so they stay pending.
        setState((s) => ({ ...s, picksIn, picksOut: null, outError: "", updating: false, updated: true,
                           updatedText: "Picks updated.", pendingFixes: s.pendingFixes - included }));
        packOut(films, picksIn, live);
      } catch (err) {
        if (live()) set({ updating: false, updateError: message(err) });
      }
    }, []),
    reset: useCallback(() => {
      run.current++;
      setState(INITIAL);
    }, []),
    dismissWelcome: useCallback(() => set({ welcome: false }), []),
    dismissError: useCallback(() => set({ updateError: "" }), []),
    /** Read a newer export and show what it changes; nothing is applied yet. */
    startUpdate: useCallback(async (file: File) => {
      const saved = latest.current.films;
      if (!saved) return;
      const current = ++reading.current;
      const runAtStart = run.current;
      const live = () => current === reading.current && runAtStart === run.current;
      set({ updating: true, updatingText: "Reading your export…", updateError: "", updated: false });
      try {
        const fresh = await parseFilms(await readExport(file));
        if (!live()) return;
        set({ updating: false, preview: { fileName: file.name, fresh, diff: diffFilms(saved, fresh) } });
      } catch (err) {
        if (live()) set({ updating: false, updateError: message(err) });
      }
    }, []),
    cancelUpdate: useCallback(() => set({ preview: null }), []),
    /** Keep saved matches (and fixes), look up only new films, then repack both lists. */
    applyUpdate: useCallback(async () => {
      const { films: saved, preview } = latest.current;
      if (!saved || !preview) return;
      const current = ++run.current;
      const live = () => current === run.current;
      const { films, unmatched } = mergeUpdate(saved, preview.fresh);
      const n = unmatched.length;
      const looking = (done: number, total: number) =>
        `Looking up ${n} new ${n === 1 ? "film" : "films"}…${total > 1 ? ` ${done}/${total}` : ""}`;
      set({ preview: null, updating: true, updateError: "", updated: false,
            updatingText: n ? looking(0, Math.ceil(n / RESOLVE_BATCH)) : "Updating your picks…" });
      try {
        const found = new Map((n ? await resolveFilms(unmatched, (d, t) => live() && set({ updatingText: looking(d, t) })) : [])
          .map((f) => [filmKey(f), f]));
        if (!live()) return;
        const merged = films.map((f) => found.get(filmKey(f)) ?? f);
        if (n) set({ updatingText: "Updating your picks…" });
        const picksIn = await recommend(merged, "in");
        if (!live()) return;
        setState((s) => ({
          ...s, films: merged, picksIn, picksOut: null, outError: "", updating: false, updated: true, pendingFixes: 0,
          savedAt: new Date().toISOString(),
          updatedText: `Updated: ${saved.filter((f) => f.watched).length} → ${merged.filter((f) => f.watched).length} films. Your picks are refreshed.`,
        }));
        packOut(merged, picksIn, live);
      } catch (err) {
        if (live()) set({ updating: false, updateError: message(err) }); // saved data is untouched
      }
    }, []),
    clearData: useCallback(async () => {
      const count = latest.current.films?.filter((f) => f.watched).length ?? 0;
      run.current++;
      set({ savedAt: null }); // no save can land after the delete
      await clearSaved();
      rev.current = undefined;
      setState({ ...INITIAL, cleared: { films: count, elsewhere: false } });
    }, []),
  };
}

export type Unboxd = ReturnType<typeof useUnboxd>;
