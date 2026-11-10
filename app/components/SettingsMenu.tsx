"use client";

import { type DisplayMode, type MotionMode, useSettings } from "../settings";

// Owner: agent C (settings). Skeleton: working controls in a <details>, no popover styling yet.
export function SettingsMenu() {
  const s = useSettings();
  return (
    <details className="settings">
      <summary aria-label="Settings">⚙</summary>
      <fieldset>
        <legend>Display mode</legend>
        {(["system", "light", "dark"] as DisplayMode[]).map((v) => (
          <label key={v}>
            <input type="radio" name="display" checked={s.display === v} onChange={() => s.update({ display: v })} /> {v}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Reduce motion</legend>
        {(["system", "on", "off"] as MotionMode[]).map((v) => (
          <label key={v}>
            <input type="radio" name="motion" checked={s.motion === v} onChange={() => s.update({ motion: v })} /> {v}
          </label>
        ))}
      </fieldset>
    </details>
  );
}
