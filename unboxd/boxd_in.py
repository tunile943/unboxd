"""Boxd In: more of what you love.

Candidates come from TMDB recommendations of your top films (strength = sum of
their w'), minus those of your least-liked films (anti-seeds), plus /discover
results for your profile's favorite directors and keywords. They're ranked by a
blend of strength, similarity to your taste profile and a Bayesian TMDB rating,
minus a penalty for franchises you dislike on balance, then diversified (MMR).
"""

from __future__ import annotations

import math
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import numpy as np
import pandas as pd

from .config import RecommendConfig
from .diversify import mmr
from .features import FacetMatrix, Key, build_facets, facet_tokens, fetch_details, item_similarity
from .profile import TasteProfile, build_profile, similarity

CANDIDATE_COLUMNS = ["tmdb_id", "title", "year", "released", "poster_path", "vote_count", "vote_average", "strength",
                     "because", "because_ids", "via", "via_crew"]
PICK_COLUMNS = ["tmdb_id", "title", "year", "poster_path", "score", "strength", "similarity",
                "reason", "on_watchlist"]


def select_seeds(films: pd.DataFrame, cfg: RecommendConfig, anti: bool = False) -> pd.DataFrame:
    """Top (or, with `anti`, bottom) `seed_pct` of rated films by w', ties included, within the seed limits."""
    sign = -1 if anti else 1
    rated = films[films["watched"] & films["rating"].notna()]
    pool = films[films["watched"] & (sign * films["weight"] > 0) & (films["media_type"] == "movie")
                 & films["tmdb_id"].notna()]
    if rated.empty or pool.empty:
        return pool
    pool = pool.assign(_w=sign * pool["weight"]).sort_values(["_w", "last_watched"], ascending=False)
    k = max(math.ceil(cfg.seed_pct * len(rated)), 1)
    cutoff = (sign * rated["weight"]).sort_values(ascending=False).iloc[k - 1]
    lo, hi = (cfg.anti_min_seeds, cfg.anti_max_seeds) if anti else (cfg.min_seeds, cfg.max_seeds)
    seeds = pool[pool["_w"] >= cutoff]
    if len(seeds) < lo:
        seeds = pool.head(lo)
    return seeds.head(hi).drop(columns="_w")


def _top_tokens(profile: TasteProfile, facets: FacetMatrix, facet: str, prefix: str, n: int) -> list[str]:
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


def discover_queries(profile: TasteProfile, facets: FacetMatrix, details: dict[Key, dict],
                     cfg: RecommendConfig) -> list[tuple[str, dict]]:
    """(reason, /discover filters) for the profile's top directors and keywords."""
    people, keywords = name_ids(details)
    queries = [(f"From {name}, a director you love", {"with_crew": people[name]})
               for name in _top_tokens(profile, facets, "people", "director:", cfg.discover_people) if name in people]
    queries += [(f"More “{kw}” films, a theme you love", {"with_keywords": keywords[kw]})
                for kw in _top_tokens(profile, facets, "theme", "kw:", cfg.discover_keywords) if kw in keywords]
    return [(reason, {**f, "sort_by": "vote_count.desc"}) for reason, f in queries]


def gather_candidates(seeds: pd.DataFrame, anti: pd.DataFrame, queries: list[tuple[str, dict]],
                      exclude: set[int], client, cfg: RecommendConfig, today: str | None = None) -> pd.DataFrame:
    """Released, decently-voted movies; strength = Σ w' of recommending seeds − anti_weight·Σ |w'| of anti-seeds."""
    today = today or date.today().isoformat()
    with ThreadPoolExecutor(max_workers=cfg.workers) as pool:
        liked = list(pool.map(client.recommendations, [int(i) for i in seeds["tmdb_id"]]))
        disliked = list(pool.map(client.recommendations, [int(i) for i in anti["tmdb_id"]]))
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
                    "strength": 0.0, "penalty": 0.0, "because": [], "because_ids": [], "via": [], "via_crew": []})

    for name, seed_id, w, results in zip(seeds["name"], seeds["tmdb_id"], seeds["weight"], liked):
        for c in eligible(results):
            c["strength"] += w
            c["because"].append(name)
            c["because_ids"].append(int(seed_id))
    for (reason, filters), results in zip(queries, found):
        for c in eligible(results):
            c["via"].append(reason)
            c["via_crew"].append(filters.get("with_crew"))
    for w, results in zip(anti["weight"], disliked):
        for c in eligible(results):
            c["penalty"] -= w

    kept = [{**c, "strength": c["strength"] - cfg.anti_weight * c["penalty"]}
            for c in cands.values() if c["because"] or c["via"]]
    df = pd.DataFrame(kept, columns=CANDIDATE_COLUMNS).sort_values("strength", ascending=False)
    recommended = df[df["because"].map(bool)].head(cfg.max_candidates)
    return pd.concat([recommended, df[~df["because"].map(bool)]]).reset_index(drop=True)


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


def franchise_opinions(weights: dict[Key, float], details: dict[Key, dict]) -> dict[int, float]:
    """Average w' of your rated films per TMDB collection (near-neutral films are left out, as in the profile)."""
    by_collection = defaultdict(list)
    for key, w in weights.items():
        collection = details.get(key, {}).get("belongs_to_collection")
        if key[0] == "movie" and collection:
            by_collection[collection["id"]].append(w)
    return {cid: sum(ws) / len(ws) for cid, ws in by_collection.items()}


def franchise_penalty(d: dict, opinions: dict[int, float], cfg: RecommendConfig) -> float:
    collection = d.get("belongs_to_collection")
    opinion = opinions.get(collection["id"]) if collection else None
    return cfg.franchise_weight * -opinion if opinion is not None and opinion <= -cfg.franchise_dead_zone else 0.0


def seed_credibility(seed_ids: list[int], details: dict[Key, dict], cfg: RecommendConfig) -> float:
    """How far to trust a nomination: the most-voted recommending seed, as a share of reliable_seed_votes.
    Discover-only picks (no seeds) are fully trusted."""
    if not seed_ids:
        return 1.0
    votes = max(details.get(("movie", i), {}).get("vote_count") or 0 for i in seed_ids)
    return min(1.0, votes / cfg.reliable_seed_votes)


def prior_strength(released: pd.Series, cfg: RecommendConfig, m: int, today: str | None = None) -> pd.Series:
    """Bayesian prior strength per film: stronger for new releases, whose early ratings run high (and get brigaded)."""
    cutoff = (date.fromisoformat(today) if today else date.today()) - timedelta(days=cfg.new_release_days)
    return pd.Series(np.where(released > cutoff.isoformat(), m * cfg.new_release_m_mult, m), index=released.index)


def bayesian_rating(avg: pd.Series, votes: pd.Series, m) -> pd.Series:
    """Rating pulled toward the pool's mean when there are few votes: (v·R + m·C) / (v + m)."""
    prior = (avg * votes).sum() / max(votes.sum(), 1)
    return (votes * avg + m * prior) / (votes + m)


def _reason(because: list[str], via: list[str]) -> str:
    return "Because you liked " + " and ".join(because[:2]) if because else via[0]


def profile_inputs(films: pd.DataFrame, client, cfg: RecommendConfig):
    """(watched movie ids, profile weights, their details)."""
    matched = films[films["tmdb_id"].notna()]
    watched = set(matched.loc[matched["watched"] & (matched["media_type"] == "movie"), "tmdb_id"].astype(int))
    profile_films = matched[matched["weight"].abs() >= cfg.profile_min_abs_weight]
    weights = {(mt, int(i)): w for mt, i, w in
               zip(profile_films["media_type"], profile_films["tmdb_id"], profile_films["weight"])}
    return watched, weights, fetch_details(list(weights), client, cfg.workers)


def candidate_pool(films: pd.DataFrame, client, cfg: RecommendConfig):
    """Candidates plus what scoring needs: (candidates, profile weights, details so far)."""
    watched, weights, details = profile_inputs(films, client, cfg)
    facets = build_facets(details)
    queries = discover_queries(build_profile(weights, facets), facets, details, cfg)
    anti = select_seeds(films, cfg, anti=True) if cfg.anti_weight else films.iloc[:0]
    cands = gather_candidates(select_seeds(films, cfg), anti, queries, watched, client, cfg)
    return cands, weights, details


def recommend(films: pd.DataFrame, client, cfg: RecommendConfig | None = None,
              k: int = 20, mmr_lambda: float | None = None) -> pd.DataFrame:
    cfg = cfg or RecommendConfig()
    cands, weights, details = candidate_pool(films, client, cfg)
    if cands.empty:
        return pd.DataFrame(columns=PICK_COLUMNS)

    cand_keys = [("movie", int(i)) for i in cands["tmdb_id"]]
    details |= fetch_details([key for key in cand_keys if key not in details], client, cfg.workers)
    cands = verify_crew(drop_genres(cands, details, cfg.exclude_genres), details)
    if cands.empty:
        return pd.DataFrame(columns=PICK_COLUMNS)
    cand_keys = [("movie", int(i)) for i in cands["tmdb_id"]]
    facets = build_facets(details)
    sim = similarity(build_profile(weights, facets), facets, cand_keys, cfg.facet_weights)

    top = cands["strength"].max()
    cands["similarity"] = sim["total"].to_numpy()
    opinions = franchise_opinions(weights, details)
    cands["franchise_penalty"] = [franchise_penalty(details[key], opinions, cfg) for key in cand_keys]
    m = prior_strength(cands["released"], cfg, cfg.quality_m)
    cands["quality"] = bayesian_rating(cands["vote_average"], cands["vote_count"], m) / 10
    lone = (cands["because"].map(len) == 1) & ~cands["via"].map(bool)
    cands["credibility"] = [seed_credibility(ids, details, cfg) for ids in cands["because_ids"]]
    cands["score"] = (cfg.rec_weight * (cands["strength"] / top if top > 0 else 0)
                      + (1 - cfg.rec_weight) * cands["similarity"]
                      + cfg.quality_weight * cands["quality"] - cands["franchise_penalty"]
                      - cfg.reliability_weight * (1 - cands["credibility"]) - cfg.lone_seed_penalty * lone
                      + cfg.consensus_weight * np.log(cands["because"].map(len).clip(lower=1)))
    pool = cands.nlargest(cfg.mmr_pool, "score")
    pool_keys = [("movie", int(i)) for i in pool["tmdb_id"]]
    order = mmr(pool["score"].to_numpy(), item_similarity(facets, pool_keys, cfg.facet_weights), k,
                mmr_lambda if mmr_lambda is not None else cfg.mmr_lambda)
    picks = pool.iloc[order]

    movies = films[films["tmdb_id"].notna() & (films["media_type"] == "movie")]
    watchlist = set(movies.loc[movies["on_watchlist"], "tmdb_id"].astype(int))
    return picks.assign(reason=[_reason(b, v) for b, v in zip(picks["because"], picks["via"])],
                        on_watchlist=picks["tmdb_id"].isin(watchlist))[PICK_COLUMNS].reset_index(drop=True)
