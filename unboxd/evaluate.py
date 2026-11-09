"""Offline evaluation: can the recommender find your favorites again?

Leave-one-out: hide one seed film at a time (as if never watched), rerun, and
check whether it comes back in the candidate pool and in the top-k picks.
For Boxd Out, any liked film counts if it is itself novel against the rest of
your history: the outliers it should have led you to.
"""

from __future__ import annotations

import pandas as pd

from . import boxd_out
from .boxd_in import candidate_pool, recommend, select_seeds
from .config import ExploreConfig, RecommendConfig
from .features import build_facets, fetch_details
from .weights import compute_weights

COLUMNS = ["name", "in_pool", "in_top_k"]


def _held_out(films: pd.DataFrame, held: pd.DataFrame):
    for idx, film in held.iterrows():
        train = films.drop(idx)
        train["weight"] = compute_weights(train)
        yield film["name"], int(film["tmdb_id"]), train


def leave_one_out(films: pd.DataFrame, client, cfg: RecommendConfig, k: int = 50) -> pd.DataFrame:
    """One row per seed film: name, in_pool, in_top_k."""
    rows = [{"name": name, "in_pool": tmdb_id in set(candidate_pool(train, client, cfg)[0]["tmdb_id"]),
             "in_top_k": tmdb_id in set(recommend(train, client, cfg, k=k)["tmdb_id"])}
            for name, tmdb_id, train in _held_out(films, select_seeds(films, cfg))]
    return pd.DataFrame(rows, columns=COLUMNS)


def explore_leave_one_out(films: pd.DataFrame, client, cfg: ExploreConfig, rcfg: RecommendConfig,
                          k: int = 50, min_weight: float = 0.25) -> pd.DataFrame:
    """One row per novel liked film: name, novelty, in_pool (past the novelty floor), in_top_k."""
    liked = films[films["watched"] & (films["media_type"] == "movie") & films["tmdb_id"].notna()
                  & (films["weight"] >= min_weight)]
    rows = []
    for name, tmdb_id, train in _held_out(films, liked):
        key, exposure = ("movie", tmdb_id), boxd_out.exposure_keys(train)
        details = fetch_details(exposure + [key], client, rcfg.workers)
        nov = boxd_out.novelty(build_facets(details), exposure, [key], cfg)[0]
        if nov < cfg.novelty_min:
            continue
        cands, _ = boxd_out.scored_pool(train, client, cfg, rcfg)
        pool = set(cands.loc[cands["novelty"] >= cfg.novelty_min, "tmdb_id"]) if len(cands) else set()
        rows.append({"name": name, "novelty": nov, "in_pool": tmdb_id in pool,
                     "in_top_k": tmdb_id in set(boxd_out.recommend(train, client, cfg, rcfg, k=k)["tmdb_id"])})
    return pd.DataFrame(rows, columns=["name", "novelty", "in_pool", "in_top_k"])
