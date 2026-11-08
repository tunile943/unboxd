"""Boxd Out: well-rated films at the edge of your taste (explore).

1. Wider pool: two-hop TMDB recs (minus one-hop) + /discover sorted by rating
   (vote_count >= min_votes) filtered to never-tried facets.
2. Keep candidates with total similarity in the [band_low, band_high] percentile band.
3. score = quality * novelty * bridge * facet_history_multiplier
     quality = Bayesian average: (v*R + m*C) / (v + m)
     novelty = 1 - max similarity to any single watched film
     bridge  = max(facet_sims) - mean(facet_sims)
4. Drop top popularity percentile, drop watched, MMR.
5. Explanation from the strongest facet: "Same DoP as X, but a genre you've never logged."
"""

from __future__ import annotations

import pandas as pd

from .config import ExploreConfig
from .profile import TasteProfile
from .tmdb import TMDBClient


def bayesian_quality(vote_average: pd.Series, vote_count: pd.Series, m: int) -> pd.Series:
    c = (vote_average * vote_count).sum() / max(vote_count.sum(), 1)
    return (vote_count * vote_average + m * c) / (vote_count + m)


def gather_candidates(films: pd.DataFrame, profile: TasteProfile,
                      client: TMDBClient, cfg: ExploreConfig) -> pd.DataFrame:
    raise NotImplementedError


def recommend(films: pd.DataFrame, profile: TasteProfile, client: TMDBClient,
              cfg: ExploreConfig, k: int = 20) -> pd.DataFrame:
    """Return tmdb_id, title, score, reason."""
    raise NotImplementedError
