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
    min_votes: int = 300  # "highly rated" needs enough votes to trust the rating
    bayes_m: int = 500  # Bayesian-average prior strength (votes)
    unexplored_share: float = 0.05  # a genre/language/decade in under 5% of your films is unexplored
    genres: tuple[str, ...] = ("Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama",
                               "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance",
                               "Science Fiction", "Thriller", "War", "Western")
    languages: tuple[str, ...] = ("fr", "ja", "ko", "es", "it", "de", "zh", "hi", "pt", "sv", "da", "fa", "ru")
    decades: tuple[int, ...] = (1950, 1960, 1970, 1980, 1990, 2000)
    bridge_keywords: int = 10  # profile's top keywords, OR-ed into each unexplored /discover query
    max_candidates: int = 300  # discover picks kept (by Bayesian rating) before fetching details
    novelty_min: float = 0.6  # drop candidates too close to what you already watch (0.5 let The Dark Knight in)
    quality_weight: float = 1.0
    novelty_weight: float = 0.5
    bridge_weight: float = 0.25  # rescaled so the best novel candidate has 1; 0.5 lets familiar films back in
    bridge_reason_top: int = 30  # reasons only name a person/theme among the profile's top 30
    # novelty: unlike your history in form (genre, decade) and, less, place (country, language)
    novelty_facets: dict[str, float] = field(
        default_factory=lambda: {"people": 0.0, "form": 0.75, "place": 0.25, "theme": 0.0})
    # bridge: like your taste in people and themes
    bridge_facets: dict[str, float] = field(
        default_factory=lambda: {"people": 0.4, "form": 0.0, "place": 0.0, "theme": 0.6})
    # equal weights so the list spreads across languages, decades and genres
    mmr_facets: dict[str, float] = field(
        default_factory=lambda: {"people": 0.25, "form": 0.25, "place": 0.25, "theme": 0.25})
    mmr_pool: int = 100
    mmr_lambda: float = 0.5  # relevance (rescaled to 0-1 in the pool) vs. diversity; lower spread languages more


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
    # Tried and removed (see git history): anti-seeds, blending in TMDB recommendation strength, and a bonus
    # for agreement between seeds. None helped leave-one-out; the last favored blockbusters.
    seed_pct: float = 0.15  # top share of rated films, ties included
    min_seeds: int = 10
    max_seeds: int = 100
    discover_people: int = 5  # profile's top directors -> /discover
    discover_keywords: int = 5  # profile's top keywords -> /discover
    min_votes: int = 300  # quality floor for candidates (drops thin spin-offs; no leave-one-out loss vs. 50)
    exclude_genres: tuple[str, ...] = ("TV Movie",)  # TV specials and spin-offs, often with inflated ratings
    max_candidates: int = 300  # cap on TMDB-recommended candidates; discover picks are always kept
    # place is ~1.0 for most US/English films, so it doesn't tell candidates apart
    facet_weights: dict[str, float] = field(
        default_factory=lambda: {"people": 0.35, "form": 0.2, "place": 0.0, "theme": 0.45})
    quality_weight: float = 0.6  # Bayesian TMDB rating (/10); 1.0 drifts toward famous classics
    quality_m: int = 500  # Bayesian prior strength, in votes
    new_release_days: int = 365  # released within this many days counts as new
    new_release_m_mult: float = 2.0  # prior strength × this for new releases: early ratings run high (and get brigaded)
    lone_seed_penalty: float = 0.03  # nominated by a single seed and no discover query; 0.05+ cost leave-one-out
    reliability_weight: float = 0.2  # discount for films nominated only by seeds with few TMDB votes
    reliable_seed_votes: int = 500  # a seed with this many votes has a trusted recommendation list (1000 lost Bugonia)
    profile_min_abs_weight: float = 0.05  # near-neutral films barely move the profile
    franchise_weight: float = 1.0  # penalty per unit of net dislike for a TMDB collection
    franchise_dead_zone: float = 0.10  # net w' above -0.10 ("it was fine") isn't a dislike
    form_decade: bool = True  # decade tokens in Boxd In's form facet (Boxd Out's novelty always uses them)
    min_shared_keywords: int = 0  # keyword-only picks must share this many keywords with the profile (0 = off)
    # Picks found only by a keyword search (no seed, no director) need this many votes: a single shared keyword plus a
    # few hundred fan votes let in kids' TV spin-offs. Free in leave-one-out and MovieLens. Tried and kept off:
    # form weight 0.10/0.05 or no decade token (lost recent favorites: 7 -> 4/20), requiring 2 shared keywords (-2).
    discover_min_votes: int = 1000
    mmr_pool: int = 100
    mmr_lambda: float = 0.6  # relevance (rescaled to 0-1 in the pool) vs. diversity; best in leave-one-out
    workers: int = 8


@dataclass(frozen=True)
class Config:
    tmdb_token: str = field(default_factory=lambda: os.getenv("TMDB_READ_TOKEN", ""))
    cache_path: Path = DATA_DIR / "tmdb_cache.sqlite"
    weights: WeightConfig = field(default_factory=WeightConfig)
    explore: ExploreConfig = field(default_factory=ExploreConfig)
    match: MatchConfig = field(default_factory=MatchConfig)
    recommend: RecommendConfig = field(default_factory=RecommendConfig)


CONFIG = Config()
