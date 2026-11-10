"use client";

// Owner: agent B. Desktop: one combined [Boxd In · Boxd Out] tab plus [Your data]; phones: three tabs.
export type Tab = "in" | "out" | "data";

export function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: [Tab, string][] = [["in", "Boxd In"], ["out", "Boxd Out"], ["data", "Your data"]];
  return (
    <div className="tabs" role="tablist" aria-label="Results">
      {tabs.map(([id, label]) => (
        <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}
