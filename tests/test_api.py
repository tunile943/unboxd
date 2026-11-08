from fastapi.testclient import TestClient

from api.index import app

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
