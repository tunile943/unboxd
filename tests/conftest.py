import json
from pathlib import Path

import pytest

FIXTURES = json.loads((Path(__file__).parent / "fixtures" / "tmdb_search.json").read_text())


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
