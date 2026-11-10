"""How good a candidate is regardless of your taste: Bayesian rating, and franchises you dislike on balance."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

import numpy as np
import pandas as pd

from .config import RecommendConfig
from .features import Key


def prior_strength(released: pd.Series, cfg: RecommendConfig, m: int, today: str | None = None) -> pd.Series:
    """Bayesian prior strength per film: stronger for new releases, whose early ratings run high (and get brigaded)."""
    cutoff = (date.fromisoformat(today) if today else date.today()) - timedelta(days=cfg.new_release_days)
    return pd.Series(np.where(released > cutoff.isoformat(), m * cfg.new_release_m_mult, m), index=released.index)


def bayesian_rating(avg: pd.Series, votes: pd.Series, m) -> pd.Series:
    """Rating pulled toward the pool's mean when there are few votes: (v·R + m·C) / (v + m)."""
    prior = (avg * votes).sum() / max(votes.sum(), 1)
    return (votes * avg + m * prior) / (votes + m)


def franchise_opinions(weights: dict[Key, float], details: dict[Key, dict]) -> dict[int, float]:
    """Average w' of your rated films per TMDB collection (near-neutral films are left out, as in the profile)."""
    by_collection = defaultdict(list)
    for key, w in weights.items():
        collection = details.get(key, {}).get("belongs_to_collection")
        if key[0] == "movie" and collection:
            by_collection[collection["id"]].append(w)
    return {cid: sum(ws) / len(ws) for cid, ws in by_collection.items()}


def franchise_penalty(d: dict, opinions: dict[int, float], cfg: RecommendConfig) -> float:
    collection = d.get("belongs_to_collection")
    opinion = opinions.get(collection["id"]) if collection else None
    return cfg.franchise_weight * -opinion if opinion is not None and opinion <= -cfg.franchise_dead_zone else 0.0
