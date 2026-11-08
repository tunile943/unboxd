"""Unboxd API: a single Vercel Python function (FastAPI, stateless).

The browser unzips the export, sends only the CSVs listed in EXPORT_FILES,
and keeps the results; every request carries everything it needs.

Local dev:  uvicorn api.index:app --reload --port 8000
"""

from __future__ import annotations

import math
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from unboxd.config import CONFIG
from unboxd.ingest import EXPORT_FILES, load_csvs
from unboxd.weights import compute_weights

MAX_CSV_BYTES = 4_000_000  # Vercel rejects request bodies over 4.5 MB
MAX_RESOLVE_BATCH = 100  # keep each /resolve call well under the 300s limit

app = FastAPI(title="Unboxd API", docs_url="/api/docs", openapi_url="/api/openapi.json")


class ExportPayload(BaseModel):
    files: dict[str, str] = Field(description="Export path (e.g. 'likes/films.csv') -> CSV text")

    @field_validator("files")
    @classmethod
    def only_known_files(cls, v: dict[str, str]) -> dict[str, str]:
        unknown = set(k.lower() for k in v) - set(EXPORT_FILES)
        if unknown:
            raise ValueError(f"unexpected files: {sorted(unknown)}")
        if sum(len(t.encode()) for t in v.values()) > MAX_CSV_BYTES:
            raise ValueError("export too large")
        return v


class Film(BaseModel):
    name: str
    year: int | None = None
    rating: float | None = None
    liked: bool = False
    rewatch_count: int = 0
    watched: bool = True
    on_watchlist: bool = False
    last_watched: str | None = None
    weight: float | None = None
    tmdb_id: int | None = None


class ResolveRequest(BaseModel):
    films: list[Film] = Field(max_length=MAX_RESOLVE_BATCH)


class RecommendRequest(BaseModel):
    mode: Literal["in", "out"]
    films: list[Film]
    k: int = Field(default=CONFIG.top_k, ge=1, le=50)


def _clean(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return v


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "tmdb_configured": bool(CONFIG.tmdb_token)}


@app.post("/api/films")
def parse_films(payload: ExportPayload) -> dict:
    """Parse export CSVs and attach w' weights. Nothing is stored."""
    films = load_csvs(payload.files)
    films["weight"] = compute_weights(films, CONFIG.weights)
    films["last_watched"] = films["last_watched"].dt.strftime("%Y-%m-%d")
    records = [{k: _clean(v) for k, v in row.items()}
               for row in films.astype(object).to_dict(orient="records")]
    return {"films": records}


@app.post("/api/resolve")
def resolve(req: ResolveRequest) -> dict:
    """Attach tmdb_id + match_confidence to one batch of films."""
    raise HTTPException(501, "resolve not implemented yet (unboxd/resolve.py)")


@app.post("/api/recommend")
def recommend(req: RecommendRequest) -> dict:
    """Boxd In (mode='in') or Boxd Out (mode='out')."""
    raise HTTPException(501, f"Boxd {'In' if req.mode == 'in' else 'Out'} not implemented yet")
