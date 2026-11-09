"""Unboxd API: a single Vercel Python function (FastAPI, stateless).

The browser unzips the export, sends only the CSVs listed in EXPORT_FILES,
and keeps the results; every request carries everything it needs.

Local dev:  uvicorn api.index:app --reload --port 8000
"""

from __future__ import annotations

from functools import cache
from typing import Any, Literal

import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from unboxd import boxd_in, boxd_out
from unboxd.config import CONFIG
from unboxd.ingest import EXPORT_FILES, load_csvs
from unboxd.resolve import resolve_films
from unboxd.tmdb import TMDBAuthError, TMDBClient
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
    tmdb_title: str | None = None
    tmdb_year: int | None = None
    media_type: Literal["movie", "tv"] | None = None
    match_confidence: Literal["high", "low", "none"] | None = None
    match_reason: str | None = None
    candidates: list[dict[str, Any]] = []


class ResolveRequest(BaseModel):
    films: list[Film] = Field(max_length=MAX_RESOLVE_BATCH)


class RecommendRequest(BaseModel):
    mode: Literal["in", "out"]
    films: list[Film]
    k: int = Field(default=CONFIG.top_k, ge=1, le=50)
    exclude: list[int] = Field(default=[], max_length=100, description="TMDB ids to skip, e.g. Boxd In picks")


def _clean(v: Any) -> Any:
    if isinstance(v, (list, dict)):
        return v
    if v is None or pd.isna(v):
        return None
    return v.item() if hasattr(v, "item") else v  # numpy scalar -> Python


def records(df: pd.DataFrame) -> list[dict]:
    return [{k: _clean(v) for k, v in row.items()}
            for row in df.astype(object).to_dict(orient="records")]


def _frame(films: list[Film]) -> pd.DataFrame:
    df = pd.DataFrame([f.model_dump() for f in films], columns=list(Film.model_fields))
    df["year"] = df["year"].astype("Int64")
    df["last_watched"] = pd.to_datetime(df["last_watched"])
    return df


@cache
def tmdb_client() -> TMDBClient:
    return TMDBClient()


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "tmdb_configured": bool(CONFIG.tmdb_token)}


@app.post("/api/films")
def parse_films(payload: ExportPayload) -> dict:
    """Parse export CSVs and attach w' weights. Nothing is stored."""
    films = load_csvs(payload.files)
    films["weight"] = compute_weights(films, CONFIG.weights)
    films["last_watched"] = films["last_watched"].dt.strftime("%Y-%m-%d")
    return {"films": records(films)}


@app.post("/api/resolve")
def resolve(req: ResolveRequest) -> dict:
    """Match one batch of films to TMDB."""
    if not CONFIG.tmdb_token:
        raise HTTPException(503, "TMDB token not configured")
    try:
        out = resolve_films(_frame(req.films), tmdb_client(), CONFIG.match)
    except TMDBAuthError as e:
        raise HTTPException(502, str(e)) from e
    return {"films": records(out)}


@app.post("/api/recommend")
def recommend(req: RecommendRequest) -> dict:
    """Boxd In (mode='in') or Boxd Out (mode='out')."""
    if not CONFIG.tmdb_token:
        raise HTTPException(503, "TMDB token not configured")
    films = _frame(req.films)
    try:
        if req.mode == "in":
            picks = boxd_in.recommend(films, tmdb_client(), CONFIG.recommend, k=req.k, mmr_lambda=CONFIG.mmr_lambda)
        else:
            picks = boxd_out.recommend(films, tmdb_client(), CONFIG.explore, CONFIG.recommend, k=req.k,
                                       mmr_lambda=CONFIG.mmr_lambda, exclude=frozenset(req.exclude))
    except TMDBAuthError as e:
        raise HTTPException(502, str(e)) from e
    return {"picks": records(picks)}
