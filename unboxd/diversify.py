"""Maximal marginal relevance re-ranking."""

from __future__ import annotations

import numpy as np


def mmr(relevance: np.ndarray, sim: np.ndarray, k: int, lam: float = 0.7) -> list[int]:
    """Greedy MMR. relevance: (n,), sim: (n, n) item-item similarity in [0, 1]. Returns indices.

    Relevance is rescaled to [0, 1] within the pool first, so `lam` weighs it against similarity on the
    same scale (raw scores often differ by only ~0.1, which let a similarity penalty of up to 1 dominate)."""
    n = len(relevance)
    span = relevance.max() - relevance.min() if n else 0
    relevance = (relevance - relevance.min()) / span if span > 0 else np.zeros(n)
    selected: list[int] = []
    remaining = list(range(n))
    while remaining and len(selected) < k:
        if selected:
            penalty = sim[np.ix_(remaining, selected)].max(axis=1)
        else:
            penalty = np.zeros(len(remaining))
        scores = lam * relevance[remaining] - (1 - lam) * penalty
        best = remaining[int(np.argmax(scores))]
        selected.append(best)
        remaining.remove(best)
    return selected
