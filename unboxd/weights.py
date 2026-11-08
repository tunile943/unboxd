"""Per-film taste weight w' in [-1, 1], robust to each user's rating curve.

1. Order by rating, tie-break by liked, then rewatch count.
2. Midrank percentile p = (below + 0.5 * equal) / n.
3. w = 2p - 1.
4. Shrink the middle: w' = sign(w) * |w|**gamma.
5. Dampen dislikes: negative w' *= neg_damp.
Watched-but-unrated films get a fixed weight; unwatched (watchlist) films get NaN.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import WeightConfig


def _midrank_percentile(key: pd.Series) -> pd.Series:
    n = len(key)
    # average rank of a tie group = below + (equal + 1) / 2; subtract 0.5 -> below + equal/2
    return (key.rank(method="average") - 0.5) / n


def _mean_centered(ratings: pd.Series) -> pd.Series:
    dev = ratings - ratings.mean()
    scale = dev.abs().max()
    return dev / scale if scale and scale > 0 else dev * 0.0


def compute_weights(films: pd.DataFrame, cfg: WeightConfig | None = None) -> pd.Series:
    """Return w' aligned to `films.index`.

    Expects columns: rating (float/NaN), liked (bool), rewatch_count (int),
    and optionally watched (bool; defaults to True).
    """
    cfg = cfg or WeightConfig()
    out = pd.Series(np.nan, index=films.index, name="weight")

    watched = films["watched"] if "watched" in films else pd.Series(True, index=films.index)
    rated_mask = watched & films["rating"].notna()
    rated = films[rated_mask]
    n = len(rated)

    if n:
        # Composite key: rating dominates (0.5 steps), then liked, then rewatches.
        key = (
            rated["rating"].astype(float) * 1000
            + rated["liked"].astype(int) * 100
            + rated["rewatch_count"].clip(upper=99)
        )
        w = 2 * _midrank_percentile(key) - 1

        if n < cfg.min_ratings:
            alpha = n / cfg.min_ratings
            w = alpha * w + (1 - alpha) * _mean_centered(rated["rating"].astype(float))

        w = np.sign(w) * np.abs(w) ** cfg.gamma
        w = w.where(w >= 0, w * cfg.neg_damp)
        out.loc[rated.index] = w

    out.loc[watched & films["rating"].isna()] = cfg.unrated_weight
    return out
