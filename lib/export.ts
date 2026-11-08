import JSZip from "jszip";

// Only these files are sent to the API. reviews.csv, comments, lists etc. stay in the browser.
export const EXPORT_FILES = [
  "watched.csv",
  "ratings.csv",
  "diary.csv",
  "likes/films.csv",
  "watchlist.csv",
] as const;

export type Film = {
  name: string;
  year: number | null;
  rating: number | null;
  liked: boolean;
  rewatch_count: number;
  watched: boolean;
  on_watchlist: boolean;
  last_watched: string | null;
  weight: number | null;
  tmdb_id?: number | null;
};

/** Unzip a Letterboxd export locally and return {export path: CSV text}. */
export async function readExport(file: File): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir);

  // If the user re-zipped the folder, everything sits under one top-level directory.
  const tops = new Set(entries.map((e) => e.name.split("/")[0]));
  const prefix = tops.size === 1 && entries.every((e) => e.name.includes("/")) ? [...tops][0] + "/" : "";

  // Exact paths only: exports also contain deleted/ and orphaned/ copies of some CSVs.
  const files: Record<string, string> = {};
  for (const entry of entries) {
    const path = entry.name.toLowerCase().slice(prefix.length);
    const match = EXPORT_FILES.find((f) => f === path);
    if (match) files[match] = await entry.async("string");
  }
  if (!files["watched.csv"] && !files["ratings.csv"]) {
    throw new Error("This doesn't look like a Letterboxd export (no watched.csv or ratings.csv).");
  }
  return files;
}

export async function parseFilms(files: Record<string, string>): Promise<Film[]> {
  const resp = await fetch("/api/films", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files }),
  });
  if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`);
  return (await resp.json()).films;
}
