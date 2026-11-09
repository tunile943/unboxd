from types import SimpleNamespace

import requests

from unboxd.cache import SQLiteCache
from unboxd.tmdb import TMDBClient


def test_deleted_id_reads_as_empty_and_is_cached(tmp_path):
    client = TMDBClient(token="test", cache=SQLiteCache(tmp_path / "c.sqlite"))
    calls = []

    def fake_get(url, params, timeout):
        calls.append(url)
        return SimpleNamespace(status_code=404, headers={})

    client.session.get = fake_get
    assert client.details(206216) == {} and client.details(206216) == {}
    assert len(calls) == 1


def test_timeouts_and_server_errors_are_retried(tmp_path, monkeypatch):
    monkeypatch.setattr("unboxd.tmdb.time.sleep", lambda s: None)
    client = TMDBClient(token="test", cache=SQLiteCache(tmp_path / "c.sqlite"))
    answers = [requests.Timeout(), SimpleNamespace(status_code=502, headers={}),
               SimpleNamespace(status_code=200, headers={}, json=lambda: {"id": 1}, raise_for_status=lambda: None)]

    def fake_get(url, params, timeout):
        a = answers.pop(0)
        if isinstance(a, Exception):
            raise a
        return a

    client.session.get = fake_get
    assert client.details(1) == {"id": 1} and not answers
