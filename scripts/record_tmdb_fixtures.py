"""Record real TMDB search responses as test fixtures (needs TMDB_READ_TOKEN).

Usage: python scripts/record_tmdb_fixtures.py
"""

import json
from pathlib import Path

from unboxd.tmdb import TMDBClient

CASES = [
    ("Heat", 1995),
    ("Suspiria", 1977),
    ("Suspiria", 2018),
    ("Parasite", 2019),
    ("Crash", 1996),
    ("Crash", 2004),
    ("Solaris", 1972),
    ("Solaris", 2002),
    ("Chungking Express", 1994),
    ("Amélie", 2001),
    ("La Jetée", 1962),
    ("Mission: Impossible", 1996),
    ("Zzqx Nonexistent Film", 2020),
]
TV_CASES = [("The Penguin", 2024), ("Watchmen", 2019), ("Secret Invasion", 2023)]
TV_KEEP = ("id", "name", "original_name", "first_air_date", "popularity", "vote_count", "poster_path")
KEEP = ("id", "title", "original_title", "release_date", "popularity", "vote_count", "poster_path")
OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "tmdb_search.json"


def key(query: str, year: int | None, kind: str = "movie") -> str:
    return f"{query}|{year}" if kind == "movie" else f"tv|{query}|{year}"


def main() -> None:
    client = TMDBClient()
    fixtures = {}
    for name, year in CASES:
        for y in (year, None):
            results = client.search_movie(name, y)
            fixtures[key(name, y)] = [{k: r.get(k) for k in KEEP} for r in results]
    for name, year in TV_CASES:
        for y in (year, None):
            fixtures[key(name, y)] = [{k: r.get(k) for k in KEEP} for r in client.search_movie(name, y)]
            fixtures[key(name, y, "tv")] = [{k: r.get(k) for k in TV_KEEP} for r in client.search_tv(name, y)]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fixtures, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {len(fixtures)} responses to {OUT}")


if __name__ == "__main__":
    main()
