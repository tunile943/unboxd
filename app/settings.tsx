"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type DisplayMode = "system" | "light" | "dark";
export type MotionMode = "system" | "on" | "off"; // "on" = reduce motion
export type Settings = { display: DisplayMode; motion: MotionMode };

const KEY = "unboxd-settings";
const DEFAULTS: Settings = { display: "system", motion: "system" };

/** Runs in <head> before first paint so a saved theme never flashes. Mirrors apply() below. */
export const THEME_SCRIPT = `try{var s=JSON.parse(localStorage.getItem("${KEY}")||"{}"),d=document.documentElement;
if(s.display==="light"||s.display==="dark")d.dataset.theme=s.display;
if(s.motion==="on")d.dataset.motion="reduce";else if(s.motion==="off")d.dataset.motion="full";}catch(e){}`;

function apply({ display, motion }: Settings) {
  const root = document.documentElement;
  if (display === "system") delete root.dataset.theme;
  else root.dataset.theme = display;
  if (motion === "system") delete root.dataset.motion;
  else root.dataset.motion = motion === "on" ? "reduce" : "full";
}

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

type Ctx = Settings & { update: (patch: Partial<Settings>) => void; reducedMotion: boolean };
const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [osReduced, setOsReduced] = useState(false);

  useEffect(() => {
    setSettings(load());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOsReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setOsReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      apply(next);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const reducedMotion = settings.motion === "on" || (settings.motion === "system" && osReduced);
  return <SettingsContext.Provider value={{ ...settings, update, reducedMotion }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
