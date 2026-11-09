"""Thin TMDB v3 client with a pluggable response cache (see cache.py).

Docs: https://developer.themoviedb.org/reference/intro/getting-started
Attribution is required in the UI (see README).
"""

from __future__ import annotations

import json
import time
from typing import Any

import requests

from .cache import Cache, default_cache
from .config import CONFIG

BASE = "https://api.themoviedb.org/3"


class TMDBAuthError(RuntimeError):
    """The token was rejected (401). Not retryable; fix TMDB_READ_TOKEN."""


class TMDBClient:
    def __init__(self, token: str | None = None, cache: Cache | None = None,
                 ttl_seconds: int = 14 * 24 * 3600):
        self.token = token or CONFIG.tmdb_token
        if not self.token:
            raise RuntimeError("TMDB_READ_TOKEN is not set (see .env.example)")
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {self.token}",
                                     "accept": "application/json"})
        self.ttl = ttl_seconds
        self.cache = cache or default_cache(CONFIG.cache_path)

    def get(self, path: str, **params: Any) -> dict:
        key = path + "?" + json.dumps(params, sort_keys=True)
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        for attempt in range(3):
            resp = self.session.get(BASE + path, params=params, timeout=15)
            if resp.status_code == 429:
                time.sleep(float(resp.headers.get("Retry-After", 1 + attempt)))
                continue
            if resp.status_code == 401:
                raise TMDBAuthError("TMDB rejected the token (401); check TMDB_READ_TOKEN")
            resp.raise_for_status()
            data = resp.json()
            self.cache.set(key, data, self.ttl)
            return data
        resp.raise_for_status()
        return {}

    # --- endpoints used by the pipeline ---------------------------------
    def search_movie(self, title: str, year: int | None = None) -> list[dict]:
        """`year` matches any release that year, not just the primary one."""
        params: dict[str, Any] = {"query": title}
        if year:
            params["year"] = int(year)
        return self.get("/search/movie", **params).get("results", [])

    def search_tv(self, title: str, year: int | None = None) -> list[dict]:
        """Raw TV results: `name`, `original_name`, `first_air_date` instead of the movie fields."""
        params: dict[str, Any] = {"query": title}
        if year:
            params["first_air_date_year"] = int(year)
        return self.get("/search/tv", **params).get("results", [])

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
