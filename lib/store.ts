import type { Film, Pick } from "./export";

/** Your own data, kept in this browser (IndexedDB) so a return visit skips the upload. Never the sample. */
export type Saved = { v: 1; rev: string; savedAt: string; films: Film[]; picksIn: Pick[]; picksOut: Pick[] | null };

const DB = "unboxd";
const STORE = "kv";
const KEY = "saved";

// Every call settles: a blocked or private-mode IndexedDB just means nothing is saved.
function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => () => T, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => resolve(fallback);
      open.onblocked = () => resolve(fallback);
      open.onsuccess = () => {
        try {
          const tx = open.result.transaction(STORE, mode);
          const result = fn(tx.objectStore(STORE));
          tx.oncomplete = () => resolve(result()); // committed, not just requested
          tx.onabort = tx.onerror = () => resolve(fallback);
        } catch {
          resolve(fallback);
        } finally {
          open.result.close();
        }
      };
    } catch {
      resolve(fallback);
    }
  });
}

// Tells this site's other open tabs that the saved data changed. Not every browser has it; the rev check covers that.
let channel: BroadcastChannel | null | undefined;
const tabs = () => (channel === undefined ? (channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("unboxd")) : channel);
export function onOtherTab(fn: () => void) {
  const c = tabs();
  c?.addEventListener("message", fn);
  return () => c?.removeEventListener("message", fn);
}

/** null: nothing saved. undefined: this browser's storage couldn't be read. */
export async function loadSaved(): Promise<Saved | null | undefined> {
  const saved = await withStore<Saved | null | undefined>("readonly", (s) => {
    const r = s.get(KEY);
    return () => r.result ?? null;
  }, undefined);
  if (saved && saved.v !== 1) {
    await clearSaved();
    return null;
  }
  return saved;
}

/**
 * Writes only if the stored record is still the one this tab last loaded or wrote (`expect`), so a stale tab can't
 * undo another tab's change or bring back cleared data. A new upload passes no `expect` and always writes.
 */
export async function save(saved: Saved, expect?: string): Promise<"saved" | "stale" | "failed"> {
  const result = await withStore<"saved" | "stale" | "failed">("readwrite", (s) => {
    let result: "saved" | "stale" = "stale";
    const r = s.get(KEY);
    r.onsuccess = () => {
      if (expect === undefined || r.result?.rev === expect) {
        s.put(saved, KEY);
        result = "saved";
      }
    };
    return () => result;
  }, "failed");
  if (result === "saved") tabs()?.postMessage("saved");
  return result;
}

export async function clearSaved() {
  await withStore("readwrite", (s) => {
    s.delete(KEY);
    return () => null;
  }, null);
  tabs()?.postMessage("cleared");
}

export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
