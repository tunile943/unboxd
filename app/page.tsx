"use client";

import { useEffect, useRef, useState } from "react";
import { DataTable } from "./components/DataTable";
import { Footer } from "./components/Footer";
import { LandingBox } from "./components/LandingBox";
import { PickColumns } from "./components/PickColumns";
import { ResultsHeader } from "./components/ResultsHeader";
import { UpdatePreview } from "./components/UpdatePreview";
import { PANEL_ID, type Tab, Tabs } from "./components/Tabs";
import { useSettings } from "./settings";
import { useExtras } from "./useExtras";
import { formatDay } from "@/lib/store";
import { useUnboxd } from "./useUnboxd";

export default function Home() {
  const u = useUnboxd();
  const { watchRegion } = useSettings();
  const extras = useExtras(u.picksIn, u.picksOut, watchRegion);
  const [tab, setTab] = useState<Tab>("in");
  const [reviewOpens, setReviewOpens] = useState(0); // >0: Your data opens filtered; each notice click remounts it
  const showTab = (t: Tab) => {
    setReviewOpens(0);
    setTab(t);
  };
  const fixStatus = u.updating ? u.updatingText
    : u.updateError ? `Couldn't update: ${u.updateError}`
    : u.pendingFixes ? `${u.pendingFixes} ${u.pendingFixes === 1 ? "match fixed" : "matches fixed"}`
    : u.updated ? u.updatedText : "";
  const revealed = !!(u.phase === "revealed" && u.films && u.picksIn);
  const heading = useRef<HTMLHeadingElement>(null);
  const fixbar = useRef<HTMLDivElement>(null);
  // When an update finishes its button goes away: keep focus in the bar rather than dropping it to the page.
  useEffect(() => {
    const a = document.activeElement;
    if (u.updated && (a === document.body || fixbar.current?.contains(a))) fixbar.current?.focus();
  }, [u.updated]);
  const wasRevealed = useRef(false);
  const updateButton = useRef<HTMLButtonElement>(null);

  // The view swaps under the user's focus (the clicked button unmounts): move focus to the new view's heading.
  useEffect(() => {
    if (revealed) heading.current?.focus();
    else if (wasRevealed.current) document.getElementById("landing-title")?.focus();
    wasRevealed.current = revealed;
  }, [revealed]);

  return (
    <div className="page">
      <main className="page-main">
        {u.phase === "restoring" ? null : revealed ? (
          <div data-testid="results" className="fade-in">
            <h1 ref={heading} tabIndex={-1} className="sr-only">
              {u.isSample ? "Recommendations for the sample diary" : "Your recommendations"}
            </h1>
            <ResultsHeader films={u.films!} isSample={u.isSample} savedAt={u.savedAt} busy={u.updating}
                           updateButton={updateButton} onUpdate={u.startUpdate} onClear={u.clearData}
                           onReset={() => { showTab("in"); u.reset(); }}
                           onReview={() => { setTab("data"); setReviewOpens((n) => n + 1); }} />
            {u.welcome && (
              <div className="u-welcome">
                <p>
                  <b>Welcome back.</b> {u.films!.filter((f) => f.watched).length} films loaded from this browser.
                  {u.savedAt && <> Last updated {formatDay(u.savedAt)}.</>}
                </p>
                <button className="u-x" type="button" aria-label="Dismiss" onClick={() => { u.dismissWelcome(); heading.current?.focus(); }}>×</button>
              </div>
            )}
            {u.preview && (
              <UpdatePreview preview={u.preview} savedAt={u.savedAt} returnTo={updateButton.current}
                             onApply={u.applyUpdate} onCancel={u.cancelUpdate} />
            )}
            <p className="sr-only" role="status">{fixStatus}</p>
            <Tabs tab={tab} onChange={showTab} />
            {fixStatus && (
              <div className="u-fixbar" ref={fixbar} tabIndex={-1}>
                <span aria-hidden="true">{fixStatus}</span>
                {/* Stays mounted while updating so keyboard focus isn't lost. */}
                {u.updateError && !u.pendingFixes && !u.updating && (
                  <button className="btn ghost sm" type="button" onClick={u.dismissError}>Dismiss</button>
                )}
                {(u.pendingFixes > 0 || u.updating) && (
                  <button className="btn or sm" type="button" aria-disabled={u.updating}
                          onClick={() => !u.updating && u.refresh()}>
                    {u.updating ? "Updating…" : "Update picks"}
                  </button>
                )}
              </div>
            )}
            <div id={PANEL_ID} role="tabpanel" aria-label={tab === "data" ? "Your data" : "Recommendations"}>
              {tab === "data" ? (
                <DataTable key={reviewOpens} films={u.films!} reviewFirst={reviewOpens > 0} onFix={u.fixMatch} />
              ) : (
                <PickColumns picksIn={u.picksIn!} picksOut={u.picksOut} outError={u.outError} tab={tab}
                             extras={extras} region={watchRegion} />
              )}
            </div>
          </div>
        ) : (
          <LandingBox u={u} />
        )}
      </main>
      <Footer />
    </div>
  );
}
