"""Resolve (name, year) from the export to a TMDB movie id.

Plan:
- search_movie(name, year); if empty, retry with year±1 (release-date drift).
- Score candidates on normalized title match + year distance + popularity.
- Mark confidence 'high' / 'low' / 'none'; low = several close candidates
  (remakes, same-name films) or a weak title match.
- Allow manual overrides (pasted TMDB URL) persisted in data/overrides.json.
"""

from __future__ import annotations

import pandas as pd

from .tmdb import TMDBClient


def resolve_films(films: pd.DataFrame, client: TMDBClient) -> pd.DataFrame:
    """Add columns: tmdb_id (Int64), match_confidence ('high'|'low'|'none')."""
    raise NotImplementedError
