import json
from pathlib import Path

import pandas as pd
import pytest

FIXTURE_DIR = Path(__file__).parent / "fixtures"
FIXTURES = json.loads((FIXTURE_DIR / "tmdb_search.json").read_text())
BOXD_IN_FIXTURES = json.loads((FIXTURE_DIR / "tmdb_boxd_in.json").read_text())


class FakeTMDB:
    """Serves recorded (or hand-made) search results and records every call."""

    def __init__(self, responses: dict[str, list[dict]] | None = None, fail: set[str] = frozenset(),
                 error: Exception | None = None):
        self.responses = FIXTURES if responses is None else responses
        self.fail, self.error = fail, error
        self.calls: list[tuple] = []

    def search_movie(self, title, year=None):
        self.calls.append((title, year))
        if title in self.fail:
            raise self.error
        return self.responses.get(f"{title}|{year}", [])

    def search_tv(self, title, year=None):
        self.calls.append(("tv", title, year))
        if title in self.fail:
            raise self.error
        return self.responses.get(f"tv|{title}|{year}", [])

    def tv_details(self, tv_id):
        self.calls.append(("tvd", tv_id))
        return self.responses.get(f"tvd|{tv_id}", {})

    def details(self, movie_id):
        self.calls.append(("md", movie_id))
        return self.responses.get(f"md|{movie_id}", {})

    def recommendations(self, movie_id, page=1):
        self.calls.append(("rec", movie_id))
        return self.responses.get(f"rec|{movie_id}", [])

    def discover(self, **filters):
        self.calls.append(("disc", filters))
        return self.responses.get(f"disc|{json.dumps(filters, sort_keys=True)}", [])


def movie(director="", genres=(), keywords=(), cast=(), year=2000, country="US", lang="en"):
    """Hand-built /movie details with only the fields features.py reads."""
    return {"release_date": f"{year}-01-01", "origin_country": [country], "original_language": lang,
            "genres": [{"name": g} for g in genres],
            "credits": {"crew": [{"id": 1, "name": director, "job": "Director"}] if director else [],
                        "cast": [{"name": c, "order": i} for i, c in enumerate(cast)]},
            "keywords": {"keywords": [{"id": i, "name": k} for i, k in enumerate(keywords)]}}


def films(*rows):
    """A films table like ingest + resolve produce, with defaults for the columns a test doesn't care about."""
    defaults = {"year": 2000, "rating": 3.0, "liked": False, "rewatch_count": 0, "watched": True,
                "on_watchlist": False, "last_watched": pd.NaT, "media_type": "movie"}
    df = pd.DataFrame([{**defaults, **r} for r in rows])
    df["last_watched"] = pd.to_datetime(df["last_watched"])
    return df


def rec(id, title="", year=2000, votes=500):
    return {"id": id, "title": title or f"Film {id}", "release_date": f"{year}-01-01",
            "vote_count": votes, "media_type": "movie"}


@pytest.fixture
def fake_tmdb():
    return FakeTMDB()


def pytest_configure(config):
    config.addinivalue_line("markers", "live: hits the real TMDB API (run with -m live)")


def pytest_collection_modifyitems(config, items):
    if "live" in (config.getoption("-m") or ""):
        return
    skip = pytest.mark.skip(reason="live test; run with -m live")
    for item in items:
        if "live" in item.keywords:
            item.add_marker(skip)
