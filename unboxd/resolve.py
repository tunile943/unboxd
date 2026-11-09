"""Match export films (name, year) to TMDB movies, with a confidence level.

Candidates are scored as title_sim * year_factor + a small popularity tie-breaker.
high = strong title, same year, clear margin over the runner-up; low = best guess
with a reason; none = nothing close. Manual fixes happen in the browser.
"""

from __future__ import annotations

import math
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from difflib import SequenceMatcher
from typing import Any, Protocol

import pandas as pd
import requests

from .config import MatchConfig

MATCH_COLUMNS = ["tmdb_id", "tmdb_title", "tmdb_year", "match_confidence",
                 "match_reason", "candidates"]


class SearchClient(Protocol):
    def search_movie(self, title: str, year: int | None = None) -> list[dict]: ...


def normalize_title(s: str) -> str:
    """Lowercase, strip accents and punctuation, '&' -> 'and', drop a leading article."""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower().replace("&", " and ")
    s = re.sub(r"[\W_]+", " ", s).strip()
    return re.sub(r"^(the|a|an) ", "", s)


def candidate_year(cand: dict) -> int | None:
    date = cand.get("release_date") or ""
    return int(date[:4]) if len(date) >= 4 and date[:4].isdigit() else None


def title_similarity(norm_name: str, cand: dict) -> float:
    """Best similarity of an already-normalized name to the candidate's title or original title."""
    best = 0.0
    for key in ("title", "original_title"):
        other = normalize_title(cand.get(key) or "")
        if not other:
            continue
        if other == norm_name:
            return 1.0
        best = max(best, SequenceMatcher(None, norm_name, other).ratio())
    return best


def year_factor(want: int | None, got: int | None, cfg: MatchConfig) -> float:
    if want is None or got is None:
        return cfg.unknown_year
    return cfg.year_factors.get(abs(want - got), cfg.far_year)


def score(title_sim: float, yf: float, cand: dict, cfg: MatchConfig) -> float:
    votes = cand.get("vote_count") or 0
    return title_sim * yf + cfg.popularity_weight * min(math.log10(1 + votes) / 4, 1.0)


def _brief(cand: dict) -> dict:
    return {"id": cand["id"], "title": cand.get("title"),
            "year": candidate_year(cand), "poster_path": cand.get("poster_path")}


def _no_match(reason: str, candidates: list[dict] | None = None) -> dict:
    return {"tmdb_id": None, "tmdb_title": None, "tmdb_year": None,
            "match_confidence": "none", "match_reason": reason,
            "candidates": candidates or []}


def _search(name: str, year: int | None, norm: str, client: SearchClient,
            cfg: MatchConfig) -> list[dict]:
    # Letterboxd's year is sometimes a festival premiere, not TMDB's primary release
    # (e.g. Crash: 2004 vs 2005), so search any release that year, then without a year.
    seen: dict[int, dict] = {}
    for y in ([year, None] if year else [None]):
        results = client.search_movie(name, y)
        for cand in results:
            seen.setdefault(cand["id"], cand)
        if any(title_similarity(norm, c) >= cfg.high_title_sim for c in results):
            break
    return list(seen.values())


def match_film(name: str, year: int | None, client: SearchClient,
               cfg: MatchConfig | None = None) -> dict:
    """Match one film. Returns a dict with the MATCH_COLUMNS keys."""
    cfg = cfg or MatchConfig()
    norm = normalize_title(name)
    try:
        cands = _search(name, year, norm, client, cfg)
    except requests.RequestException:  # TMDBAuthError isn't one, so it aborts the batch
        return _no_match("Lookup failed")
    if not cands:
        return _no_match("No results")

    scored = []
    for c in cands:
        sim = title_similarity(norm, c)
        scored.append((score(sim, year_factor(year, candidate_year(c), cfg), c, cfg), sim, c))
    scored.sort(key=lambda t: t[0], reverse=True)

    s1, sim1, best = scored[0]
    s2 = scored[1][0] if len(scored) > 1 else 0.0
    others = [_brief(c) for _, _, c in scored[1:cfg.max_candidates + 1]]
    best_year = candidate_year(best)
    diff = abs(year - best_year) if year is not None and best_year is not None else None
    if sim1 < cfg.min_title_sim or (diff or 0) > cfg.max_year_diff:
        reason = "No close title match" if sim1 < cfg.min_title_sim else f"No match near {year}"
        return _no_match(reason, [_brief(best)] + others[:cfg.max_candidates - 1])
    year_ok = diff is None or diff <= cfg.high_max_year_diff
    if sim1 >= cfg.high_title_sim and year_ok and s1 - s2 >= cfg.margin:
        confidence, reason = "high", None
    else:
        best_norm = normalize_title(best.get("title") or "")
        twins = [c for _, _, c in scored[1:]
                 if candidate_year(c) == best_year
                 and best_norm in (normalize_title(c.get("title") or ""),
                                   normalize_title(c.get("original_title") or ""))]
        if twins:
            reason = f"{len(twins) + 1} films share this title"
        elif diff:
            reason = f"Year differs by {diff}"
        elif sim1 < cfg.high_title_sim:
            reason = "Title differs"
        else:
            reason = "Close alternatives"
        confidence = "low"

    return {"tmdb_id": best["id"], "tmdb_title": best.get("title"), "tmdb_year": best_year,
            "match_confidence": confidence, "match_reason": reason, "candidates": others}


def resolve_films(films: pd.DataFrame, client: SearchClient,
                  cfg: MatchConfig | None = None) -> pd.DataFrame:
    """Return a copy of `films` with MATCH_COLUMNS added (same rows, same order).

    Uses `name` and `year`; watchlist films are matched too. Lookups run
    concurrently. A TMDBAuthError aborts the whole batch.
    """
    cfg = cfg or MatchConfig()
    out = films.copy()
    keys = [(str(n), None if pd.isna(y) else int(y))
            for n, y in zip(films["name"], films["year"])]
    with ThreadPoolExecutor(max_workers=cfg.workers) as pool:
        results: list[dict[str, Any]] = list(
            pool.map(lambda k: match_film(k[0], k[1], client, cfg), keys))

    for col in MATCH_COLUMNS:
        out[col] = [r[col] for r in results] if results else pd.Series(dtype=object)
    out["tmdb_id"] = out["tmdb_id"].astype("Int64")
    out["tmdb_year"] = out["tmdb_year"].astype("Int64")
    return out
