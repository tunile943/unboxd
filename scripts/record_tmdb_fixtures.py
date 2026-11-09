"""Record real TMDB responses as test fixtures (needs TMDB_READ_TOKEN).

Usage: python scripts/record_tmdb_fixtures.py
"""

import json
from pathlib import Path

from unboxd.config import MatchConfig
from unboxd.resolve import _tv_as_movie, normalize_title, title_similarity
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
    ("The Penguin", 2024),  # limited series
    ("Watchmen", 2019),  # limited series; also a 2009 film
    ("Secret Invasion", 2023),  # limited series
    ("Samuel", 2024),  # one ended season; also a 2022 film
    ("Possible Love", 2026),  # film; an ongoing series shares the name
    ("Breaking Bad", 2008),  # multi-season series: must not match
]
MOVIE_KEEP = ("id", "title", "original_title", "release_date", "popularity", "vote_count", "poster_path")
TV_KEEP = ("id", "name", "original_name", "first_air_date", "popularity", "vote_count", "poster_path")
OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "tmdb_search.json"


def main() -> None:
    client, cfg = TMDBClient(), MatchConfig()
    fixtures = {}
    for name, year in CASES:
        norm = normalize_title(name)
        for y in (year, None):
            fixtures[f"{name}|{y}"] = [{k: r.get(k) for k in MOVIE_KEEP} for r in client.search_movie(name, y)]
            tv = client.search_tv(name, y)
            fixtures[f"tv|{name}|{y}"] = [{k: r.get(k) for k in TV_KEEP} for r in tv]
            for r in tv:
                if title_similarity(norm, _tv_as_movie(r)) >= cfg.min_title_sim:
                    d = client.tv_details(r["id"])
                    fixtures[f"tvd|{r['id']}"] = {k: d.get(k) for k in ("type", "number_of_seasons", "status")}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(fixtures, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {len(fixtures)} responses to {OUT}")


if __name__ == "__main__":
    main()
