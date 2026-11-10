"use client";

import { BoxMark } from "./Logo";

// Desktop: one combined [Boxd In · Boxd Out] tab plus [Your data]; phones: three tabs. CSS shows one tablist.
export type Tab = "in" | "out" | "data";

export const PANEL_ID = "results-panel";

type Item = { id: string; value: Tab; selected: boolean; label: React.ReactNode; mode?: Tab; className?: string };

function TabList({ items, onChange, className }: { items: Item[]; onChange: (t: Tab) => void; className: string }) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const i = tabs.indexOf(e.target as HTMLButtonElement);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (i < 0 || next === undefined) return;
    e.preventDefault();
    const j = (next + tabs.length) % tabs.length;
    tabs[j].focus();
    onChange(items[j].value);
  };
  return (
    <div className={className}>
      <div role="tablist" aria-label="Results" onKeyDown={onKeyDown}>
        {items.map((t) => (
          <button key={t.id} id={t.id} role="tab" type="button" className={t.className} data-mode={t.mode}
                  aria-selected={t.selected} aria-controls={PANEL_ID} tabIndex={t.selected ? 0 : -1}
                  onClick={() => onChange(t.value)}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const picks = tab !== "data";
  return (
    <>
      <TabList className="tabs-d" onChange={onChange} items={[
        { id: "tab-picks", value: picks ? tab : "in", selected: picks, className: "combo",
          label: <><span className="i">Boxd In</span><BoxMark small /><span className="o">Boxd Out</span></> },
        { id: "tab-data-d", value: "data", selected: !picks, label: "Your data" },
      ]} />
      <TabList className="tabs-m" onChange={onChange} items={[
        { id: "tab-in", value: "in", mode: "in", selected: tab === "in", label: "Boxd In" },
        { id: "tab-out", value: "out", mode: "out", selected: tab === "out", label: "Boxd Out" },
        { id: "tab-data", value: "data", mode: "data", selected: tab === "data", label: "Your data" },
      ]} />
    </>
  );
}
