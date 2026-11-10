"""Boxd In: more of what you love.

Candidates come from TMDB recommendations of your top films plus /discover results
for your profile's favorite directors and keywords. They're ranked by similarity to
your taste profile plus a Bayesian TMDB rating, minus penalties for franchises you
dislike on balance, thinly-backed nominations and lone-seed picks, then diversified (MMR).
"""

from __future__ import annotations

import pandas as pd

from .candidates import (drop_genres, gather_candidates, name_ids, profile_inputs, select_seeds, top_tokens,
                         verify_crew, watchlist_ids)
from .config import RecommendConfig
from .diversify import mmr
from .features import FacetMatrix, Key, build_facets, fetch_details, item_similarity
from .profile import TasteProfile, build_profile, similarity
from .quality import bayesian_rating, franchise_opinions, franchise_penalty, prior_strength

PICK_COLUMNS = ["tmdb_id", "title", "year", "poster_path", "score", "strength", "similarity",
                "reason", "on_watchlist"]


def discover_queries(profile: TasteProfile, facets: FacetMatrix, details: dict[Key, dict],
                     cfg: RecommendConfig) -> list[tuple[str, dict]]:
    """(reason, /discover filters) for the profile's top directors and keywords."""
    people, keywords = name_ids(details)
    queries = [(f"From {name}, a director you love", {"with_crew": people[name]})
               for name in top_tokens(profile, facets, "people", "director:", cfg.discover_people) if name in people]
    queries += [(f"More “{kw}” films, a theme you love", {"with_keywords": keywords[kw]})
                for kw in top_tokens(profile, facets, "theme", "kw:", cfg.discover_keywords) if kw in keywords]
    return [(reason, {**f, "sort_by": "vote_count.desc"}) for reason, f in queries]


def seed_credibility(seed_ids: list[int], details: dict[Key, dict], cfg: RecommendConfig) -> float:
    """How far to trust a nomination: the most-voted recommending seed, as a share of reliable_seed_votes.
    Discover-only picks (no seeds) are fully trusted."""
    if not seed_ids:
        return 1.0
    votes = max(details.get(("movie", i), {}).get("vote_count") or 0 for i in seed_ids)
    return min(1.0, votes / cfg.reliable_seed_votes)


def _reason(because: list[str], via: list[str]) -> str:
    return "Because you liked " + " and ".join(because[:2]) if because else via[0]


def candidate_pool(films: pd.DataFrame, client, cfg: RecommendConfig):
    """Candidates plus what scoring needs: (candidates, profile weights, details so far)."""
    watched, weights, details = profile_inputs(films, client, cfg)
    facets = build_facets(details)
    queries = discover_queries(build_profile(weights, facets), facets, details, cfg)
    return gather_candidates(select_seeds(films, cfg), queries, watched, client, cfg), weights, details


def recommend(films: pd.DataFrame, client, cfg: RecommendConfig | None = None,
              k: int = 20, mmr_lambda: float | None = None) -> pd.DataFrame:
    cfg = cfg or RecommendConfig()
    cands, weights, details = candidate_pool(films, client, cfg)
    if cands.empty:
        return pd.DataFrame(columns=PICK_COLUMNS)

    cand_keys = [("movie", int(i)) for i in cands["tmdb_id"]]
    details |= fetch_details([key for key in cand_keys if key not in details], client, cfg.workers)
    cands = verify_crew(drop_genres(cands, details, cfg.exclude_genres), details)
    if cands.empty:
        return pd.DataFrame(columns=PICK_COLUMNS)
    cand_keys = [("movie", int(i)) for i in cands["tmdb_id"]]
    facets = build_facets(details)

    sim = similarity(build_profile(weights, facets), facets, cand_keys, cfg.facet_weights)
    cands["similarity"] = sim["total"].to_numpy()
    opinions = franchise_opinions(weights, details)
    cands["franchise_penalty"] = [franchise_penalty(details[key], opinions, cfg) for key in cand_keys]
    m = prior_strength(cands["released"], cfg, cfg.quality_m)
    cands["quality"] = bayesian_rating(cands["vote_average"], cands["vote_count"], m) / 10
    cands["credibility"] = [seed_credibility(ids, details, cfg) for ids in cands["because_ids"]]
    lone = (cands["because"].map(len) == 1) & ~cands["via"].map(bool)
    cands["score"] = (cands["similarity"] + cfg.quality_weight * cands["quality"] - cands["franchise_penalty"]
                      - cfg.reliability_weight * (1 - cands["credibility"]) - cfg.lone_seed_penalty * lone)

    pool = cands.nlargest(cfg.mmr_pool, "score")
    pool_keys = [("movie", int(i)) for i in pool["tmdb_id"]]
    order = mmr(pool["score"].to_numpy(), item_similarity(facets, pool_keys, cfg.facet_weights), k,
                mmr_lambda if mmr_lambda is not None else cfg.mmr_lambda)
    picks = pool.iloc[order]
    return picks.assign(reason=[_reason(b, v) for b, v in zip(picks["because"], picks["via"])],
                        on_watchlist=picks["tmdb_id"].isin(watchlist_ids(films)))[PICK_COLUMNS].reset_index(drop=True)
