"""Match a real export against TMDB and write files for proofreading.

Usage: python scripts/match_report.py <export.zip> [--cold]
  --cold  use an empty cache, to time batches like a first-time visitor

Writes data/match_review.csv (every low/none film) and data/match_spotcheck.csv
(30 random high matches). data/ is git-ignored.
"""

import sys
import tempfile
import time
from pathlib import Path

import pandas as pd

from unboxd.cache import SQLiteCache
from unboxd.ingest import load_export
from unboxd.resolve import resolve_films
from unboxd.tmdb import TMDBClient

BATCH = 100
DATA = Path(__file__).resolve().parent.parent / "data"


def main(path: str, cold: bool) -> None:
    films = load_export(path)
    cache = SQLiteCache(Path(tempfile.mkdtemp()) / "cold.sqlite") if cold else None
    client = TMDBClient(cache=cache)

    parts, times = [], []
    for i in range(0, len(films), BATCH):
        start = time.perf_counter()
        parts.append(resolve_films(films.iloc[i:i + BATCH], client))
        times.append(time.perf_counter() - start)
        print(f"batch {len(times)}: {times[-1]:.1f}s", flush=True)
    out = pd.concat(parts)

    counts = out["match_confidence"].value_counts()
    print(f"\n{len(out)} films: " + ", ".join(f"{k} {counts.get(k, 0)}" for k in ("high", "low", "none")))
    print(f"high: {counts.get('high', 0) / len(out):.1%}; slowest batch {max(times):.1f}s")
    print(f"media types: {out['media_type'].value_counts().to_dict()}")
    print("\nreasons:\n" + out["match_reason"].value_counts().to_string())

    cols = ["name", "year", "watched", "tmdb_id", "tmdb_title", "tmdb_year", "media_type",
            "match_confidence", "match_reason"]
    review = out[out["match_confidence"] != "high"][cols]
    review.assign(alternatives=out["candidates"].map(
        lambda cs: "; ".join(f"{c['title']} ({c['year']}) #{c['id']}" for c in cs[:3]))).to_csv(
        DATA / "match_review.csv", index=False)
    high = out[out["match_confidence"] == "high"]
    high.sample(min(30, len(high)), random_state=0)[cols].to_csv(DATA / "match_spotcheck.csv", index=False)
    print(f"\nwrote {DATA / 'match_review.csv'} and {DATA / 'match_spotcheck.csv'}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--cold"]
    if len(args) != 1:
        sys.exit(__doc__)
    main(args[0], "--cold" in sys.argv)
