"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type DisplayMode = "system" | "light" | "dark";
export type MotionMode = "system" | "on" | "off"; // "on" = reduce motion
export type Settings = { display: DisplayMode; motion: MotionMode; region: string }; // region "" = from the browser

const KEY = "unboxd-settings";
const DEFAULTS: Settings = { display: "system", motion: "system", region: "" };
const REGION = /^[A-Z]{2}$/;

/** The browser locale's region (en-GB → GB; a bare "en" is expanded to its likely region), else US. */
function detectRegion(): string {
  try {
    const r = new Intl.Locale(navigator.language).maximize().region ?? "";
    return REGION.test(r) ? r : "US";
  } catch {
    return "US";
  }
}

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
    const s = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      display: ["light", "dark"].includes(s.display) ? s.display : "system",
      motion: ["on", "off"].includes(s.motion) ? s.motion : "system",
      region: REGION.test(s.region) ? s.region : "",
    };
  } catch {
    return DEFAULTS;
  }
}

type Ctx = Settings & {
  update: (patch: Partial<Settings>) => void;
  reducedMotion: boolean;
  detectedRegion: string;
  watchRegion: string; // the chosen region, else the detected one
};
const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [osReduced, setOsReduced] = useState(false);
  const [detectedRegion, setDetectedRegion] = useState("US");

  useEffect(() => {
    setSettings(load());
    setDetectedRegion(detectRegion());
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
  const watchRegion = settings.region || detectedRegion;
  return (
    <SettingsContext.Provider value={{ ...settings, update, reducedMotion, detectedRegion, watchRegion }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
