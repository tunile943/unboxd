"""Taste profile per facet: sum(w'_i * x_i) / sum(|w'_i|).

Also tracks facet-value history for Boxd Out:
  never watched           -> boost
  few films, mean w' >= 0 -> mild boost
  >= N films, mean w' < 0 -> suppress
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from .features import FacetMatrix


@dataclass
class TasteProfile:
    vectors: dict[str, np.ndarray]  # facet -> profile vector
    facet_history: pd.DataFrame  # facet, token, n_films, mean_weight


def build_profile(weights: pd.Series, facets: FacetMatrix) -> TasteProfile:
    """`weights` indexed by tmdb_id."""
    raise NotImplementedError


def similarity(profile: TasteProfile, facets: FacetMatrix,
               facet_weights: dict[str, float] | None = None) -> pd.DataFrame:
    """Per-facet cosine similarity of every film to the profile, plus a weighted 'total' column."""
    raise NotImplementedError
