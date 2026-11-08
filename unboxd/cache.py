"""Swappable key-value cache for TMDB responses.

- Upstash Redis when UPSTASH_REDIS_REST_URL / _TOKEN (or Vercel's KV_REST_API_URL /
  _TOKEN) are set: shared across Vercel instances, survives redeploys.
- SQLite otherwise (local dev). On Vercel without Redis it falls back to /tmp,
  which is per-instance and temporary, so it works but is a weak cache.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Protocol


class Cache(Protocol):
    def get(self, key: str) -> Any | None: ...
    def set(self, key: str, value: Any, ttl: int) -> None: ...


class SQLiteCache:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute("CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, v TEXT, exp REAL)")

    def get(self, key: str) -> Any | None:
        row = self.db.execute("SELECT v, exp FROM cache WHERE k = ?", (key,)).fetchone()
        if row and row[1] > time.time():
            return json.loads(row[0])
        return None

    def set(self, key: str, value: Any, ttl: int) -> None:
        self.db.execute("REPLACE INTO cache VALUES (?, ?, ?)",
                        (key, json.dumps(value), time.time() + ttl))
        self.db.commit()


class RedisCache:
    def __init__(self, url: str, token: str, prefix: str = "unboxd:tmdb:"):
        from upstash_redis import Redis  # imported lazily: only needed in production

        self.r = Redis(url=url, token=token)
        self.prefix = prefix

    def get(self, key: str) -> Any | None:
        raw = self.r.get(self.prefix + key)
        return json.loads(raw) if raw else None

    def set(self, key: str, value: Any, ttl: int) -> None:
        self.r.set(self.prefix + key, json.dumps(value), ex=ttl)


def default_cache(local_path: Path) -> Cache:
    url = os.getenv("UPSTASH_REDIS_REST_URL") or os.getenv("KV_REST_API_URL")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN") or os.getenv("KV_REST_API_TOKEN")
    if url and token:
        return RedisCache(url, token)
    if os.getenv("VERCEL"):
        return SQLiteCache(Path("/tmp/unboxd_tmdb_cache.sqlite"))
    return SQLiteCache(local_path)
