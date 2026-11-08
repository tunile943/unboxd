"""Boxd In: comfort picks (exploit).

1. Candidates: TMDB /recommendations + /similar for films with w' > 0,
   each vote weighted by the seed film's w'.
2. Score = blend(normalized vote mass, weighted facet similarity to profile).
3. Drop watched films; MMR for light diversity.
4. Explanation: "Because you liked <top seed>".
"""

from __future__ import annotations

import pandas as pd

from .profile import TasteProfile
from .tmdb import TMDBClient


def gather_candidates(seeds: pd.Series, client: TMDBClient) -> pd.DataFrame:
    """`seeds`: w' indexed by tmdb_id. Returns tmdb_id, vote_mass, top_seed."""
    raise NotImplementedError


def recommend(films: pd.DataFrame, profile: TasteProfile, client: TMDBClient,
              k: int = 20) -> pd.DataFrame:
    """Return tmdb_id, title, score, reason."""
    raise NotImplementedError
