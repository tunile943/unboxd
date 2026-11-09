"""Taste profile per facet: sum(w'_i * x_i) / sum(|w'_i|). Dislikes subtract their features."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .features import FACETS, FacetMatrix, Key


@dataclass
class TasteProfile:
    vectors: dict[str, np.ndarray]  # facet -> profile vector


def build_profile(weights: dict[Key, float], facets: FacetMatrix) -> TasteProfile:
    pairs = [(facets.index[k], w) for k, w in weights.items() if k in facets.index and w and not np.isnan(w)]
    rows = [r for r, _ in pairs]
    w = np.array([w for _, w in pairs], dtype=float)
    denom = np.abs(w).sum()
    return TasteProfile({
        f: np.asarray(m[rows].T @ w).ravel() / denom if denom else np.zeros(m.shape[1])
        for f, m in facets.matrices.items()
    })


def similarity(profile: TasteProfile, facets: FacetMatrix, keys: list[Key],
               facet_weights: dict[str, float]) -> pd.DataFrame:
    """Cosine similarity of each film to the profile, per facet plus a weighted `total`."""
    idx = [facets.index[k] for k in keys]
    out = {}
    for f in FACETS:
        p = profile.vectors[f]
        norm = np.linalg.norm(p)
        out[f] = np.asarray(facets.matrices[f][idx] @ p).ravel() / norm if norm else np.zeros(len(idx))
    df = pd.DataFrame(out, index=pd.Index(keys, tupleize_cols=False))
    df["total"] = sum(facet_weights[f] * df[f] for f in FACETS) / sum(facet_weights.values())
    return df
