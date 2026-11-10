"""Candidate machinery shared by Boxd In and Boxd Out: seeds, profile inputs, TMDB lookups and filters."""

from __future__ import annotations

import math
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import numpy as np
import pandas as pd

from .config import RecommendConfig
from .features import FacetMatrix, Key, facet_tokens, fetch_details
from .profile import TasteProfile

CANDIDATE_COLUMNS = ["tmdb_id", "title", "year", "released", "poster_path", "vote_count", "vote_average", "strength",
                     "because", "because_ids", "via", "via_crew"]


def select_seeds(films: pd.DataFrame, cfg: RecommendConfig) -> pd.DataFrame:
    """Top `seed_pct` of rated films by w', ties included, within the seed limits."""
    rated = films[films["watched"] & films["rating"].notna()]
    pool = films[films["watched"] & (films["weight"] > 0) & (films["media_type"] == "movie") & films["tmdb_id"].notna()]
    if rated.empty or pool.empty:
        return pool
    pool = pool.sort_values(["weight", "last_watched"], ascending=False)
    k = max(math.ceil(cfg.seed_pct * len(rated)), 1)
    cutoff = rated["weight"].sort_values(ascending=False).iloc[k - 1]
    seeds = pool[pool["weight"] >= cutoff]
    if len(seeds) < cfg.min_seeds:
        seeds = pool.head(cfg.min_seeds)
    return seeds.head(cfg.max_seeds)


def profile_inputs(films: pd.DataFrame, client, cfg: RecommendConfig):
    """(watched movie ids, profile weights, their details)."""
    matched = films[films["tmdb_id"].notna()]
    watched = set(matched.loc[matched["watched"] & (matched["media_type"] == "movie"), "tmdb_id"].astype(int))
    profile_films = matched[matched["weight"].abs() >= cfg.profile_min_abs_weight]
    weights = {(mt, int(i)): w for mt, i, w in
               zip(profile_films["media_type"], profile_films["tmdb_id"], profile_films["weight"])}
    return watched, weights, fetch_details(list(weights), client, cfg.workers)


def watchlist_ids(films: pd.DataFrame) -> set[int]:
    movies = films[films["tmdb_id"].notna() & (films["media_type"] == "movie")]
    return set(movies.loc[movies["on_watchlist"], "tmdb_id"].astype(int))


def top_tokens(profile: TasteProfile, facets: FacetMatrix, facet: str, prefix: str, n: int) -> list[str]:
    """The profile's n strongest positive tokens with this prefix, without the prefix (e.g. director names)."""
    vec, vocab = profile.vectors[facet], facets.vocab[facet]
    return [vocab[i][len(prefix):] for i in np.argsort(-vec)
            if vec[i] > 0 and vocab[i].startswith(prefix)][:n]


def name_ids(details: dict[Key, dict]) -> tuple[dict[str, int], dict[str, int]]:
    """Director (or TV creator) and keyword names -> TMDB ids, for /discover filters."""
    people, keywords = {}, {}
    for (media_type, _), d in details.items():
        if media_type == "tv":
            people.update({p["name"]: p["id"] for p in d.get("created_by", [])})
            kws = d.get("keywords", {}).get("results", [])
        else:
            people.update({p["name"]: p["id"] for p in d.get("credits", {}).get("crew", []) if p["job"] == "Director"})
            kws = d.get("keywords", {}).get("keywords", [])
        keywords.update({k["name"]: k["id"] for k in kws})
    return people, keywords


def gather_candidates(seeds: pd.DataFrame, queries: list[tuple[str, dict]], exclude: set[int], client,
                      cfg: RecommendConfig, today: str | None = None) -> pd.DataFrame:
    """Released, decently-voted movies that seeds recommend (strength = Σ w') or /discover queries find."""
    today = today or date.today().isoformat()
    with ThreadPoolExecutor(max_workers=cfg.workers) as pool:
        recommended = list(pool.map(client.recommendations, [int(i) for i in seeds["tmdb_id"]]))
        found = list(pool.map(lambda q: client.discover(**q[1]), queries))

    cands: dict[int, dict] = {}

    def eligible(results: list[dict]):
        for r in results:
            released = r.get("release_date") or ""
            if (r.get("media_type", "movie") == "movie" and r["id"] not in exclude and released
                    and released <= today and (r.get("vote_count") or 0) >= cfg.min_votes):
                yield cands.setdefault(r["id"], {
                    "tmdb_id": r["id"], "title": r.get("title"), "year": int(released[:4]), "released": released,
                    "poster_path": r.get("poster_path"), "vote_count": r.get("vote_count"),
                    "vote_average": r.get("vote_average") or 0.0,
                    "strength": 0.0, "because": [], "because_ids": [], "via": [], "via_crew": []})

    for name, seed_id, w, results in zip(seeds["name"], seeds["tmdb_id"], seeds["weight"], recommended):
        for c in eligible(results):
            c["strength"] += w
            c["because"].append(name)
            c["because_ids"].append(int(seed_id))
    for (reason, filters), results in zip(queries, found):
        for c in eligible(results):
            c["via"].append(reason)
            c["via_crew"].append(filters.get("with_crew"))

    df = pd.DataFrame(list(cands.values()), columns=CANDIDATE_COLUMNS).sort_values("strength", ascending=False)
    by_seeds = df[df["because"].map(bool)].head(cfg.max_candidates)  # discover picks are exempt from the cap
    return pd.concat([by_seeds, df[~df["because"].map(bool)]]).reset_index(drop=True)


def drop_genres(cands: pd.DataFrame, details: dict[Key, dict], genres: tuple[str, ...]) -> pd.DataFrame:
    """Candidates without any of the given TMDB genres (e.g. "TV Movie")."""
    excluded = {f"genre:{g}" for g in genres}
    keep = [not excluded & set(facet_tokens(details[("movie", int(i))], "movie")["form"]) for i in cands["tmdb_id"]]
    return cands[keep].reset_index(drop=True)


def verify_crew(cands: pd.DataFrame, details: dict[Key, dict]) -> pd.DataFrame:
    """/discover's with_crew matches any crew job, so a director query can find films the person only wrote,
    produced or storyboarded. Keep those picks but say what the person actually did."""
    vias = []
    for tmdb_id, via, crew in zip(cands["tmdb_id"], cands["via"], cands["via_crew"]):
        jobs = defaultdict(list)
        for p in details.get(("movie", int(tmdb_id)), {}).get("credits", {}).get("crew", []):
            jobs[p["id"]].append(p["job"])
        kept = []
        for reason, person in zip(via, crew):
            if person is None or "Director" in jobs[person] or not jobs[person]:
                kept.append(reason)
            elif {"Writer", "Screenplay", "Story"} & set(jobs[person]):
                kept.append(reason.replace("From ", "Written by ", 1))
            else:
                kept.append(reason.replace("From ", "With ", 1) + f", as {jobs[person][0].lower()}")
        vias.append(kept)
    return cands.assign(via=vias)
