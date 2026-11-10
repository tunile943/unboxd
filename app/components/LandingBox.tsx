"use client";

import { useEffect, useRef, useState } from "react";
import { useSettings } from "../settings";
import type { Unboxd } from "../useUnboxd";
import { Wordmark } from "./Logo";
import { SettingsMenu } from "./SettingsMenu";

const PRIVACY =
  "Your export is stored only in this browser. Film lists are sent to our server to match them on TMDB, but we do not retain them.";

// One shake per finished batch: a left-right, b right-left, c double shiver, d hop with a tilt.
const JIGS = [["a", ".5s"], ["b", ".5s"], ["c", ".45s"], ["d", ".55s"]] as const;

function restart(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth; // reflow so the same animation plays again
  el.classList.add(cls);
}

export function LandingBox({ u }: { u: Unboxd }) {
  const { reducedMotion } = useSettings();
  const box = useRef<HTMLDivElement>(null);
  const lastJig = useRef(-1);
  const pivotLeft = useRef(false);
  const retry = useRef<() => void>(u.trySample);
  const batchTimes = useRef<number[]>([]);
  const [reveal, setReveal] = useState<"" | "open" | "leave">("");
  const [dragging, setDragging] = useState(false);
  const [eta, setEta] = useState<number | null>(null);
  const busy = u.phase !== "idle";

  const upload = (file: File) => {
    retry.current = () => u.upload(file);
    u.upload(file);
  };
  const sample = () => {
    retry.current = u.trySample;
    u.trySample();
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (u.phase === "reading" && !reducedMotion) restart(el, "growing");
    if (u.phase === "idle") {
      el.classList.remove("growing", "jiggle");
      delete el.dataset.jig;
      setReveal("");
    }
    if (u.phase === "matching") {
      batchTimes.current = [performance.now()];
      setEta(null);
    }
  }, [u.phase, reducedMotion]);

  useEffect(() => {
    const el = box.current;
    if (!el || u.batchTick === 0) return;
    const times = batchTimes.current;
    times.push(performance.now());
    if (u.progress && times.length > 1) {
      const perBatch = (times[times.length - 1] - times[0]) / (times.length - 1);
      setEta(Math.round(((u.progress.total - u.progress.done) * perBatch) / 1000));
    }
    if (reducedMotion) return;
    let n;
    do n = Math.floor(Math.random() * JIGS.length);
    while (n === lastJig.current);
    lastJig.current = n;
    pivotLeft.current = !pivotLeft.current;
    el.style.setProperty("--jig-anim", `u-jig-${JIGS[n][0]}`);
    el.style.setProperty("--jig-dur", JIGS[n][1]);
    el.style.setProperty("--jig", `${(1.2 + Math.random() * 1.4).toFixed(2)}deg`);
    el.style.setProperty("--jig-origin", pivotLeft.current ? "15% 100%" : "85% 100%");
    el.dataset.jig = JIGS[n][0];
    restart(el, "jiggle");
  }, [u.batchTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lid lifts (~.3s), from 250ms the box slides out (~.45s), then the results take over and rise in.
  useEffect(() => {
    if (u.phase !== "opening") return;
    if (reducedMotion) return u.opened();
    box.current?.classList.remove("growing", "jiggle");
    setReveal("open");
    const leave = setTimeout(() => setReveal("leave"), 250);
    const done = setTimeout(u.opened, 700);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, [u.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !busy) upload(file);
  };

  // A file dropped beside the box (or while busy) must not make the browser open it and leave the page.
  useEffect(() => {
    const block = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  const p = u.progress;
  const title =
    u.phase === "reading"
      ? u.isSample ? "Opening the sample diary…" : "Opening your export…"
      : u.phase === "matching"
        ? `Matching films on TMDB… ${p ? `${p.done}/${p.total} batches` : ""}`
        : u.phase === "packing" ? "Packing your Boxd In…" : "Unpacking…";
  const pct = u.phase === "reading" ? 0 : u.phase === "matching" && p ? (p.done / p.total) * 100 : 100;

  return (
    <section className={`landing${busy ? " is-loading" : ""}`} data-testid="landing">
      <header className="landing-nav">
        <Wordmark />
        <SettingsMenu />
      </header>
      <div className="hero">
        <div className="hero-copy">
          <p className="kicker">A Letterboxd recommender</p>
          <h1 className="title" id="landing-title" tabIndex={-1}>Two boxes of films, carefully packed from your ratings.</h1>
          <dl className="modes">
            <div className="mode in"><dt>Boxd In</dt><dd>More of what you love.</dd></div>
            <div className="mode out"><dt>Boxd Out</dt><dd>Highly-rated movies beyond your rated genres/styles.</dd></div>
          </dl>
        </div>
        <div
          ref={box}
          className="kbox"
          data-testid="box"
          data-phase={u.phase}
          data-reveal={reveal || undefined}
          data-drag={dragging || undefined}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          <div className="lid" aria-hidden="true"><span className="hold" /></div>
          <div className="ship">
            <div className="ship-top" aria-hidden="true"><i /><b /></div>
            <p className="sr-only" role="status" aria-live="polite">{busy ? title : ""}</p>
            {busy ? (
              <div className="prog">
                <h2>{title}</h2>
                <div className="bar" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                  <i style={{ width: `${pct}%` }} />
                </div>
                {u.phase === "matching" && p && (
                  <div className="row">
                    <span><b>{p.done}</b> of <b>{p.total}</b> batches matched</span>
                    {eta !== null && <span>{p.done >= p.total ? "done" : `about ${Math.max(1, eta)} s left`}</span>}
                  </div>
                )}
                <p className="fine">
                  {u.isSample
                    ? "The sample diary is a small demo, so this only takes a moment."
                    : "Your export was read in this browser. Your films and ratings are sent for matching."}
                </p>
              </div>
            ) : (
              <>
                {u.error && (
                  <div className="err" role="alert">
                    <h2>Couldn&apos;t pack your box</h2>
                    <p>{u.error}</p>
                    <div><button className="btn sm" type="button" onClick={() => retry.current()}>Retry</button></div>
                  </div>
                )}
                <div className="drop">
                  <strong>Drop letterboxd-export.zip in the box</strong>
                  <div className="btns">
                    <label className="btn or">
                      Choose ZIP
                      <input
                        type="file"
                        accept=".zip"
                        className="sr-only"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) upload(file);
                        }}
                      />
                    </label>
                    <button className="btn ghost" type="button" onClick={sample}>
                      Try with sample data
                    </button>
                  </div>
                  <small>On Letterboxd: Settings → Data → Export your data</small>
                </div>
              </>
            )}
            <div className="priv">
              <div>
                <span>All data lives in-browser.<sup>*</sup></span>
                <span className="info" title={PRIVACY} aria-hidden="true">i</span>
              </div>
              <p id="priv-note"><sup>*</sup> {PRIVACY}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
