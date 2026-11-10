"use client";

import { useState } from "react";
import { DataTable } from "./components/DataTable";
import { Footer } from "./components/Footer";
import { LandingBox } from "./components/LandingBox";
import { PickColumns } from "./components/PickColumns";
import { ResultsHeader } from "./components/ResultsHeader";
import { PANEL_ID, type Tab, Tabs } from "./components/Tabs";
import { useUnboxd } from "./useUnboxd";

export default function Home() {
  const u = useUnboxd();
  const [tab, setTab] = useState<Tab>("in");
  const revealed = u.phase === "revealed" && u.films && u.picksIn;

  return (
    <main className="page">
      {revealed ? (
        <div data-testid="results">
          <ResultsHeader films={u.films!} isSample={u.isSample} onReset={() => { setTab("in"); u.reset(); }} />
          <Tabs tab={tab} onChange={setTab} />
          <div id={PANEL_ID} role="tabpanel" aria-label={tab === "data" ? "Your data" : "Recommendations"}>
            {tab === "data" ? (
              <DataTable films={u.films!} />
            ) : (
              <PickColumns picksIn={u.picksIn!} picksOut={u.picksOut} outError={u.outError} tab={tab} />
            )}
          </div>
        </div>
      ) : (
        <LandingBox u={u} />
      )}
      <Footer />
    </main>
  );
}
