"""Offline evaluation: can the recommender find your favorites again?

Leave-one-out: hide one seed film at a time (as if never watched), rerun, and
check whether it comes back in the candidate pool and in the top-k picks.
"""

from __future__ import annotations

import pandas as pd

from .boxd_in import candidate_pool, recommend, select_seeds
from .config import RecommendConfig
from .weights import compute_weights


def leave_one_out(films: pd.DataFrame, client, cfg: RecommendConfig, k: int = 50) -> pd.DataFrame:
    """One row per seed film: name, in_pool, in_top_k."""
    rows = []
    for idx, film in select_seeds(films, cfg).iterrows():
        train = films.drop(idx)
        train["weight"] = compute_weights(train)
        tmdb_id = int(film["tmdb_id"])
        rows.append({
            "name": film["name"],
            "in_pool": tmdb_id in set(candidate_pool(train, client, cfg)[0]["tmdb_id"]),
            "in_top_k": tmdb_id in set(recommend(train, client, cfg, k=k)["tmdb_id"]),
        })
    return pd.DataFrame(rows, columns=["name", "in_pool", "in_top_k"])
