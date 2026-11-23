"use client";

import { useEffect, useId, useRef, useState } from "react";
import { regionName } from "@/lib/regions";
import { type DisplayMode, type MotionMode, useSettings } from "../settings";
import { useModal } from "../useModal";

const REGIONS = ["US", "CA", "GB", "IE", "AU", "NZ", "IN", "DE", "AT", "CH", "FR", "BE", "NL", "ES", "IT", "PT", "SE", "NO",
  "DK", "FI", "PL", "BR", "MX", "AR", "JP", "KR", "SG", "ZA"];

const GROUPS: { key: "display" | "motion"; legend: string; options: [DisplayMode | MotionMode, string][] }[] = [
  { key: "display", legend: "Display mode", options: [["system", "System"], ["light", "Light"], ["dark", "Dark"]] },
  { key: "motion", legend: "Reduce motion", options: [["system", "System"], ["on", "On"], ["off", "Off"]] },
];

export function SettingsMenu() {
  const [opens, setOpens] = useState(0); // 0: closed; each click counts, so a click while it's closing reopens it
  const gear = useRef<HTMLButtonElement>(null);
  return (
    <div className="settings">
      <button ref={gear} className="gear" type="button" aria-label="Settings" aria-haspopup="dialog"
              aria-expanded={opens > 0} onClick={() => setOpens((n) => n + 1)}>
        <svg className="gi" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {opens > 0 && <SettingsDialog opens={opens} returnTo={gear.current} onClosed={() => setOpens(0)} />}
    </div>
  );
}

/** Desktop: a panel under the gear (bottom sheet where anchor positioning is missing). Phones: a bottom sheet. */
function SettingsDialog({ opens, returnTo, onClosed }: { opens: number; returnTo: HTMLElement | null; onClosed: () => void }) {
  const s = useSettings();
  const id = useId();
  const modal = useModal(onClosed, returnTo, opens);

  useEffect(() => {
    modal.ref.current?.querySelector<HTMLElement>("input:checked")?.focus();
  }, [opens]); // on each open

  return (
    <dialog {...modal} className="set-pop" aria-labelledby={`${id}-h`}>
      <div className="set-in">
        <div className="set-h">
          <h2 id={`${id}-h`}>Settings</h2>
          <button className="set-x" type="button" aria-label="Close settings" onClick={() => modal.ref.current?.close()}>×</button>
        </div>
        {GROUPS.map((g) => (
          <fieldset key={g.key}>
            <legend>{g.legend}</legend>
            <div className="seg">
              {g.options.map(([value, label]) => (
                <label key={value}>
                  <input type="radio" name={`${id}-${g.key}`} value={value} checked={s[g.key] === value}
                         onChange={() => s.update({ [g.key]: value })} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {g.key === "motion" && (
              <p className="fine">On replaces the box jiggle, lid lift and list rise with a crossfade.</p>
            )}
          </fieldset>
        ))}
        <div className="set-field">
          <label htmlFor={`${id}-region`}>Watch region</label>
          <select id={`${id}-region`} className="set-select" value={s.region}
                  onChange={(e) => s.update({ region: e.target.value })}>
            <option value="">Automatic ({regionName(s.detectedRegion)})</option>
            {[...new Set([...REGIONS, s.detectedRegion, ...(s.region ? [s.region] : [])])].sort((a, b) => regionName(a).localeCompare(regionName(b)))
              .map((r) => <option key={r} value={r}>{regionName(r)}</option>)}
          </select>
          <p className="fine">Where-to-watch listings follow this region.</p>
        </div>
        <p className="fine">Settings are saved in this browser.</p>
      </div>
    </dialog>
  );
}
