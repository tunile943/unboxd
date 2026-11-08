"""Thin TMDB v3 client with a SQLite response cache.

Docs: https://developer.themoviedb.org/reference/intro/getting-started
Attribution is required in the UI (see README).
"""

from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path
from typing import Any

import requests

from .config import CONFIG

BASE = "https://api.themoviedb.org/3"


class TMDBClient:
    def __init__(self, token: str | None = None, cache_path: Path | None = None,
                 ttl_seconds: int = 14 * 24 * 3600):
        self.token = token or CONFIG.tmdb_token
        if not self.token:
            raise RuntimeError("TMDB_READ_TOKEN is not set (see .env.example)")
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {self.token}",
                                     "accept": "application/json"})
        self.ttl = ttl_seconds
        path = cache_path or CONFIG.cache_path
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, v TEXT, t REAL)")

    def get(self, path: str, **params: Any) -> dict:
        key = path + "?" + json.dumps(params, sort_keys=True)
        row = self.db.execute("SELECT v, t FROM cache WHERE k = ?", (key,)).fetchone()
        if row and time.time() - row[1] < self.ttl:
            return json.loads(row[0])
        for attempt in range(3):
            resp = self.session.get(BASE + path, params=params, timeout=15)
            if resp.status_code == 429:
                time.sleep(float(resp.headers.get("Retry-After", 1 + attempt)))
                continue
            resp.raise_for_status()
            data = resp.json()
            self.db.execute("REPLACE INTO cache VALUES (?, ?, ?)",
                            (key, json.dumps(data), time.time()))
            self.db.commit()
            return data
        resp.raise_for_status()
        return {}

    # --- endpoints used by the pipeline ---------------------------------
    def search_movie(self, title: str, year: int | None = None) -> list[dict]:
        params = {"query": title}
        if year:
            params["year"] = int(year)
        return self.get("/search/movie", **params).get("results", [])

    def details(self, movie_id: int) -> dict:
        """Details + credits + keywords in one call."""
        return self.get(f"/movie/{movie_id}", append_to_response="credits,keywords")

    def recommendations(self, movie_id: int, page: int = 1) -> list[dict]:
        return self.get(f"/movie/{movie_id}/recommendations", page=page).get("results", [])

    def similar(self, movie_id: int, page: int = 1) -> list[dict]:
        return self.get(f"/movie/{movie_id}/similar", page=page).get("results", [])

    def discover(self, **filters: Any) -> list[dict]:
        """e.g. discover(sort_by='vote_average.desc', **{'vote_count.gte': 300, 'with_origin_country': 'JP'})"""
        return self.get("/discover/movie", **filters).get("results", [])
