"""Record real TMDB responses as test fixtures (needs TMDB_READ_TOKEN): matching + one Boxd In run.

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
BOXD_IN_OUT = OUT.with_name("tmdb_boxd_in.json")
BOXD_IN_FILMS = [("Heat", 949, 5.0), ("Parasite", 496243, 4.5), ("Transformers", 1858, 1.0)]
RESULT_KEEP = ("id", "title", "release_date", "vote_count", "poster_path", "media_type")


def _trim_details(d: dict) -> dict:
    """Keep only what features.py reads."""
    def pick(items, *keys):
        return [{k: x.get(k) for k in keys} for x in items]

    out = {k: d[k] for k in ("release_date", "first_air_date", "origin_country", "original_language") if k in d}
    out["genres"] = pick(d.get("genres", []), "name")
    out["created_by"] = pick(d.get("created_by", []), "id", "name")
    if "credits" in d:
        out["credits"] = {
            "crew": pick([c for c in d["credits"]["crew"] if c["job"] in ("Director", "Director of Photography")],
                         "id", "name", "job"),
            "cast": pick(sorted(d["credits"]["cast"], key=lambda c: c["order"])[:5], "name", "order")}
    kws = d.get("keywords", {})
    out["keywords"] = {key: pick(kws[key], "id", "name") for key in ("keywords", "results") if key in kws}
    return out


class Recorder:
    """Wraps TMDBClient and stores trimmed responses under FakeTMDB's keys."""

    def __init__(self, client: TMDBClient):
        self.client, self.saved = client, {}

    def details(self, movie_id):
        d = self.client.details(movie_id)
        self.saved[f"md|{movie_id}"] = _trim_details(d)
        return d

    def tv_details(self, tv_id):
        d = self.client.tv_details(tv_id)
        self.saved[f"tvd|{tv_id}"] = _trim_details(d)
        return d

    def recommendations(self, movie_id, page=1):
        r = self.client.recommendations(movie_id, page)
        self.saved[f"rec|{movie_id}"] = [{k: x.get(k) for k in RESULT_KEEP} for x in r]
        return r

    def discover(self, **filters):
        r = self.client.discover(**filters)
        self.saved[f"disc|{json.dumps(filters, sort_keys=True)}"] = [{k: x.get(k) for k in RESULT_KEEP} for x in r]
        return r


def record_boxd_in(client: TMDBClient) -> None:
    import pandas as pd

    from unboxd.boxd_in import recommend
    from unboxd.config import RecommendConfig
    from unboxd.weights import compute_weights

    films = pd.DataFrame([{"name": n, "year": None, "rating": r, "liked": False, "rewatch_count": 0,
                           "watched": True, "on_watchlist": False, "last_watched": pd.NaT,
                           "tmdb_id": i, "media_type": "movie"} for n, i, r in BOXD_IN_FILMS])
    films["weight"] = compute_weights(films)
    recorder = Recorder(client)
    recommend(films, recorder, RecommendConfig(min_seeds=2))
    BOXD_IN_OUT.write_text(json.dumps(recorder.saved, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {len(recorder.saved)} responses to {BOXD_IN_OUT}")


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
    record_boxd_in(client)


if __name__ == "__main__":
    main()
