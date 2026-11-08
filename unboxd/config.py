"""Central place for tunables. Tune these against the holdout evaluation."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


@dataclass(frozen=True)
class WeightConfig:
    gamma: float = 2.0  # shrink the middle: sign(w)*|w|^gamma
    neg_damp: float = 0.5  # lambda: multiply negative weights by this
    unrated_weight: float = 0.1  # watched but never rated
    min_ratings: int = 30  # below this, blend toward mean-centering


@dataclass(frozen=True)
class ExploreConfig:
    band_low: float = 0.40  # similarity percentile band for Boxd Out
    band_high: float = 0.75
    bayes_m: int = 500  # Bayesian-average prior strength (votes)
    min_votes: int = 300  # /discover vote_count.gte
    popularity_cap_pct: float = 0.99  # drop candidates above this popularity percentile
    disliked_facet_min_films: int = 3  # suppress facet if mean w' < 0 over >= this many films


@dataclass(frozen=True)
class Config:
    tmdb_token: str = field(default_factory=lambda: os.getenv("TMDB_READ_TOKEN", ""))
    cache_path: Path = DATA_DIR / "tmdb_cache.sqlite"
    weights: WeightConfig = field(default_factory=WeightConfig)
    explore: ExploreConfig = field(default_factory=ExploreConfig)
    top_k: int = 20
    mmr_lambda: float = 0.7  # relevance vs. diversity trade-off


CONFIG = Config()
