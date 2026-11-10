"use client";

import { useEffect, useId, useRef, useState } from "react";
import { type DisplayMode, type MotionMode, type Settings, useSettings } from "../settings";

const GROUPS: { key: keyof Settings; legend: string; options: [DisplayMode | MotionMode, string][] }[] = [
  { key: "display", legend: "Display mode", options: [["system", "System"], ["light", "Light"], ["dark", "Dark"]] },
  { key: "motion", legend: "Reduce motion", options: [["system", "System"], ["on", "On"], ["off", "Off"]] },
];

export function SettingsMenu() {
  const s = useSettings();
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const gear = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) gear.current?.focus();
  };

  useEffect(() => {
    if (!open || !pop.current) return;
    // Right-aligned under the gear; flip to left-aligned when the gear sits near the left edge.
    if (pop.current.getBoundingClientRect().left < 8) pop.current.classList.add("start");
    pop.current.querySelector<HTMLElement>("input:checked")?.focus();
    // After the click has moved focus: keep it if it landed on something else, otherwise return it to the gear.
    const onClick = (e: MouseEvent) => {
      if (wrap.current?.contains(e.target as Node)) return;
      const a = document.activeElement;
      close(!a || a === document.body);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab" && pop.current) {
      const f = [...pop.current.querySelectorAll<HTMLElement>("button, input:checked")];
      const [first, last] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className="settings" ref={wrap}>
      <button ref={gear} className="gear" type="button" aria-label="Settings" aria-haspopup="dialog"
              aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <svg className="gi" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <>
          <div className="set-scrim" data-testid="settings-scrim" onClick={() => close()} />
          <div ref={pop} className="set-pop" role="dialog" aria-modal="true" aria-labelledby={`${id}-h`}
               onKeyDown={onKeyDown}>
            <div className="set-h">
              <h2 id={`${id}-h`}>Settings</h2>
              <button className="set-x" type="button" aria-label="Close settings" onClick={() => close()}>×</button>
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
            <p className="fine">Settings are saved in this browser.</p>
          </div>
        </>
      )}
    </div>
  );
}
