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


def test_recommend_in(monkeypatch):
    import api.index as api_index
    from test_boxd_in import recommend_setup
    df, fake = recommend_setup()
    monkeypatch.setattr(api_index, "CONFIG", replace(api_index.CONFIG, tmdb_token="test",
                                                     recommend=replace(api_index.CONFIG.recommend, seed_pct=1.0)))
    monkeypatch.setattr(api_index, "tmdb_client", lambda: fake)
    films = df.assign(last_watched=None).astype(object).where(df.notna(), None).to_dict(orient="records")
    resp = client.post("/api/recommend", json={"mode": "in", "films": films, "k": 3})
    assert resp.status_code == 200
    picks = resp.json()["picks"]
    assert 0 < len(picks) <= 3 and {"tmdb_id", "title", "reason", "on_watchlist", "poster_path"} <= set(picks[0])
    assert isinstance(picks[0]["genres"], list) and "director" in picks[0] and "vote_average" in picks[0]


def test_recommend_out(monkeypatch):
    import api.index as api_index
    from test_boxd_out import CFG, RCFG, world
    df, fake = world()
    monkeypatch.setattr(api_index, "CONFIG", replace(api_index.CONFIG, tmdb_token="test", explore=CFG, recommend=RCFG))
    monkeypatch.setattr(api_index, "tmdb_client", lambda: fake)
    films = df.assign(last_watched=None).astype(object).where(df.notna(), None).to_dict(orient="records")
    resp = client.post("/api/recommend", json={"mode": "out", "films": films, "k": 3})
    assert resp.status_code == 200
    picks = resp.json()["picks"]
    assert picks[0]["tmdb_id"] == 100 and {"reason", "novelty", "bridge", "on_watchlist"} <= set(picks[0])
    assert isinstance(picks[0]["cast"], list) and "language" in picks[0]


@pytest.mark.parametrize("mode", ["in", "out"])
def test_recommend_without_token(monkeypatch, mode):
    import api.index as api_index
    monkeypatch.setattr(api_index, "CONFIG", replace(api_index.CONFIG, tmdb_token=""))
    assert client.post("/api/recommend", json={"mode": mode, "films": []}).status_code == 503


def test_extras(monkeypatch):
    import api.index as api_index
    fake = FakeTMDB({"vid|7": [{"site": "YouTube", "type": "Trailer", "key": "abc", "name": "Trailer"}],
                     "wp|7": {"GB": {"link": "https://tmdb/7", "flatrate": [
                         {"provider_id": 8, "provider_name": "Netflix", "logo_path": "/n.png"}]}}})
    monkeypatch.setattr(api_index, "CONFIG", replace(api_index.CONFIG, tmdb_token="test"))
    monkeypatch.setattr(api_index, "tmdb_client", lambda: fake)
    resp = client.post("/api/extras", json={"films": [{"tmdb_id": 7, "language": "fr"}], "region": "GB"})
    got = resp.json()["extras"]["7"]
    assert got["trailer"]["key"] == "abc" and got["providers"]["stream"][0]["name"] == "Netflix"
    assert ("vid", 7, "fr") in fake.calls


@pytest.mark.parametrize("body", [{"films": [{"tmdb_id": i} for i in range(51)]},
                                  {"films": [], "region": "usa"}])
def test_extras_rejects_bad_requests(body):
    assert client.post("/api/extras", json=body).status_code == 422
