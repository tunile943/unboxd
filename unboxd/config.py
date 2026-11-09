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
class MatchConfig:
    high_title_sim: float = 0.9  # title similarity needed for 'high' (and to stop searching)
    high_max_year_diff: int = 1  # festival vs. release year is common
    min_title_sim: float = 0.8  # below this the best candidate is 'none'
    max_year_diff: int = 2  # beyond this it's a different film (e.g. a remake or a TV series)
    margin: float = 0.08  # best must beat runner-up by this for 'high' (~40x more votes for namesakes)
    year_factors: dict[int, float] = field(default_factory=lambda: {0: 1.0, 1: 0.9, 2: 0.6})
    far_year: float = 0.1  # year differs by 3+
    unknown_year: float = 0.8  # export or TMDB has no year
    popularity_weight: float = 0.2  # famous film beats an obscure namesake
    max_candidates: int = 4  # alternatives kept for "Pick another"
    workers: int = 8  # concurrent TMDB lookups per batch


@dataclass(frozen=True)
class RecommendConfig:
    seed_pct: float = 0.15  # top (and, for anti-seeds, bottom) share of rated films, ties included
    min_seeds: int = 10
    max_seeds: int = 100
    anti_min_seeds: int = 5
    anti_max_seeds: int = 50
    anti_weight: float = 0.0  # off: didn't help in leave-one-out; a dislike already lowers profile similarity
    discover_people: int = 5  # profile's top directors -> /discover
    discover_keywords: int = 5  # profile's top keywords -> /discover
    min_votes: int = 50  # quality floor for candidates
    max_candidates: int = 300
    rec_weight: float = 0.0  # TMDB recs nominate, the profile ranks (best in leave-one-out)
    facet_weights: dict[str, float] = field(
        default_factory=lambda: {"people": 0.3, "form": 0.25, "place": 0.15, "theme": 0.3})
    profile_min_abs_weight: float = 0.05  # near-neutral films barely move the profile
    franchise_weight: float = 1.0  # penalty per unit of net dislike for a TMDB collection
    franchise_dead_zone: float = 0.10  # net w' above -0.10 ("it was fine") isn't a dislike
    mmr_pool: int = 100
    workers: int = 8


@dataclass(frozen=True)
class Config:
    tmdb_token: str = field(default_factory=lambda: os.getenv("TMDB_READ_TOKEN", ""))
    cache_path: Path = DATA_DIR / "tmdb_cache.sqlite"
    weights: WeightConfig = field(default_factory=WeightConfig)
    explore: ExploreConfig = field(default_factory=ExploreConfig)
    match: MatchConfig = field(default_factory=MatchConfig)
    recommend: RecommendConfig = field(default_factory=RecommendConfig)
    top_k: int = 20
    mmr_lambda: float = 0.7  # relevance vs. diversity trade-off


CONFIG = Config()
