"""Offline evaluation on a time-based holdout.

- Holdout: last N diary entries with w' >= 0.5 (relative, not a fixed star cutoff).
- Boxd In: hit-rate@50.
- Boxd Out: serendipity hit-rate (held-out films far from the training profile:
  does explore rank them higher than exploit?) and new-facet coverage@20.
Use this to tune gamma, neg_damp, band edges and bayes_m in config.py.
"""

from __future__ import annotations

import pandas as pd


def split_holdout(films: pd.DataFrame, weights: pd.Series, n: int = 30,
                  min_weight: float = 0.5) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (train, holdout) by most recent `last_watched` among strong positives."""
    strong = films[(weights >= min_weight) & films["last_watched"].notna()]
    holdout_idx = strong.sort_values("last_watched").tail(n).index
    return films.drop(holdout_idx), films.loc[holdout_idx]


def hit_rate(recommended_ids: list[int], holdout_ids: set[int], k: int) -> float:
    if not holdout_ids:
        return 0.0
    return len(set(recommended_ids[:k]) & holdout_ids) / len(holdout_ids)
