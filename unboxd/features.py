"""Per-facet feature vectors from TMDB details.

Facets (kept separate so Boxd Out can compute a bridge score):
  people: director, writer, cinematographer (DoP), composer, top-5 cast
  form:   genres, runtime bucket, decade
  place:  origin country, original language
  theme:  TMDB keywords

Each facet -> TF-IDF over tokens like "director:Wong Kar-wai", L2-normalized.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd
from scipy.sparse import csr_matrix

FACETS = ("people", "form", "place", "theme")


@dataclass
class FacetMatrix:
    tmdb_ids: list[int]
    matrices: dict[str, csr_matrix]  # facet -> (n_films x n_tokens)
    vocab: dict[str, list[str]]  # facet -> token names, for explanations


def facet_tokens(details: dict) -> dict[str, list[str]]:
    """Turn one TMDB details payload into tokens per facet."""
    raise NotImplementedError


def build_facets(details_by_id: dict[int, dict]) -> FacetMatrix:
    """Fit TF-IDF per facet over all known films (watched + candidates)."""
    raise NotImplementedError
