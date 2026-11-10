"""Offline evaluation: can the recommender find your favorites again?

Leave-one-out: hide one seed film at a time (as if never watched), rerun, and
check whether it comes back in the candidate pool and in the top-k picks.
For Boxd Out, any liked film counts if it is itself novel against the rest of
your history: the outliers it should have led you to.
"""

from __future__ import annotations

import pandas as pd

from . import boxd_out
from .boxd_in import candidate_pool, recommend
from .candidates import select_seeds
from .config import ExploreConfig, RecommendConfig
from .features import build_facets, facet_tokens, fetch_details
from .weights import compute_weights

COLUMNS = ["name", "in_pool", "in_top_k"]


def held_out(films: pd.DataFrame, held: pd.DataFrame, max_held: int | None = None):
    """(name, tmdb_id, the other films re-weighted) for each held film, or a fixed sample of `max_held`."""
    if max_held is not None and len(held) > max_held:
        held = held.sample(max_held, random_state=0)
    for idx, film in held.iterrows():
        train = films.drop(idx)
        train["weight"] = compute_weights(train)
        yield film["name"], int(film["tmdb_id"]), train


def leave_one_out(films: pd.DataFrame, client, cfg: RecommendConfig, k: int = 50,
                  max_held: int | None = None) -> pd.DataFrame:
    """One row per seed film (or a fixed sample of `max_held`): name, in_pool, in_top_k."""
    rows = [{"name": name, "in_pool": tmdb_id in set(candidate_pool(train, client, cfg)[0]["tmdb_id"]),
             "in_top_k": tmdb_id in set(recommend(train, client, cfg, k=k)["tmdb_id"])}
            for name, tmdb_id, train in held_out(films, select_seeds(films, cfg), max_held)]
    return pd.DataFrame(rows, columns=COLUMNS)


def explore_leave_one_out(films: pd.DataFrame, client, cfg: ExploreConfig, rcfg: RecommendConfig,
                          k: int = 50, min_weight: float = 0.25, max_held: int | None = None) -> pd.DataFrame:
    """One row per novel liked film: name, novelty, in_pool (past the novelty floor), in_top_k."""
    liked = films[films["watched"] & (films["media_type"] == "movie") & films["tmdb_id"].notna()
                  & (films["weight"] >= min_weight)]
    rows = []
    for name, tmdb_id, train in held_out(films, liked, max_held):
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


def list_metrics(picks: pd.DataFrame, client, also_in: set[int] = frozenset()) -> dict:
    """What a pick list looks like: rating, votes, spread across languages/decades/genres, bridges, overlap."""
    details = list(fetch_details([("movie", int(i)) for i in picks["tmdb_id"]], client).values())
    if not details:
        return {}
    tokens = [facet_tokens(d, "movie") for d in details]

    def distinct(facet, prefix):
        return len({t for x in tokens for t in x[facet] if t.startswith(prefix)})

    return {"rating": sum(d.get("vote_average", 0) for d in details) / len(details),
            "median_votes": float(pd.Series([d.get("vote_count", 0) for d in details]).median()),
            "novelty": picks["novelty"].mean() if "novelty" in picks else float("nan"),
            "languages": distinct("place", "lang:"), "decades": distinct("form", "decade:"),
            "genres": distinct("form", "genre:"), "english": sum("lang:en" in x["place"] for x in tokens),
            "bridged": int(picks["reason"].str.contains("you love").sum()),
            "overlap": len(also_in & set(picks["tmdb_id"]))}
