from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from api.index import app
from conftest import FakeTMDB

client = TestClient(app)

FILES = {
    "watched.csv": "Date,Name,Year,Letterboxd URI\n"
                   "2024-01-01,Heat,1995,https://boxd.it/b\n"
                   "2024-01-02,Tokyo Story,1953,https://boxd.it/c\n",
    "ratings.csv": "Date,Name,Year,Letterboxd URI,Rating\n"
                   "2024-01-01,Heat,1995,https://boxd.it/b,4\n",
}


def test_health():
    assert client.get("/api/health").json()["ok"] is True


def test_parse_films():
    resp = client.post("/api/films", json={"files": FILES})
    assert resp.status_code == 200
    films = {f["name"]: f for f in resp.json()["films"]}
    assert films["Heat"]["rating"] == 4.0
    assert films["Tokyo Story"]["rating"] is None
    assert films["Tokyo Story"]["weight"] == 0.1  # watched, unrated


def test_rejects_unknown_files():
    resp = client.post("/api/films", json={"files": {"reviews.csv": "x"}})
    assert resp.status_code == 422


def test_resolve_batch_limit():
    films = [{"name": f"Film {i}", "year": 2000} for i in range(101)]
    assert client.post("/api/resolve", json={"films": films}).status_code == 422


@pytest.fixture
def api_with_fake_tmdb(monkeypatch):
    import api.index as api_index
    monkeypatch.setattr(api_index, "CONFIG", replace(api_index.CONFIG, tmdb_token="test"))
    monkeypatch.setattr(api_index, "tmdb_client", lambda: FakeTMDB())


def test_resolve_returns_matches(api_with_fake_tmdb):
    films = [{"name": "Heat", "year": 1995, "rating": 4.0},
             {"name": "Zzqx Nonexistent Film", "year": 2020},
             {"name": "Crash", "year": 2004}]
    resp = client.post("/api/resolve", json={"films": films})
    assert resp.status_code == 200
    heat, missing, crash = resp.json()["films"]
    assert (heat["tmdb_id"], heat["match_confidence"], heat["match_reason"]) == (949, "high", None)
    assert heat["media_type"] == "movie" and missing["media_type"] is None
    assert heat["rating"] == 4.0 and isinstance(heat["candidates"], list)
    assert (missing["tmdb_id"], missing["match_confidence"], missing["tmdb_year"]) == (None, "none", None)
    assert (crash["tmdb_id"], crash["tmdb_year"], crash["match_reason"]) == (1640, 2005, "Year differs by 1")
    assert {"id", "title", "year", "poster_path"} <= set(crash["candidates"][0])


def test_resolve_without_token(monkeypatch):
    import api.index as api_index
    monkeypatch.setattr(api_index, "CONFIG", replace(api_index.CONFIG, tmdb_token=""))
    assert client.post("/api/resolve", json={"films": [{"name": "Heat"}]}).status_code == 503
