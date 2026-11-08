"""Maximal marginal relevance re-ranking."""

from __future__ import annotations

import numpy as np


def mmr(relevance: np.ndarray, sim: np.ndarray, k: int, lam: float = 0.7) -> list[int]:
    """Greedy MMR. relevance: (n,), sim: (n, n) item-item similarity. Returns indices."""
    n = len(relevance)
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
