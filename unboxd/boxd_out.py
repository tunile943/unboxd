"""Boxd Out: highly rated films beyond the genres and styles you've rated.

Two separate questions, two scores:
  novelty = 1 - similarity of a film's form (genre, decade) and place (country,
            language) to everything you've watched, liked or not
  bridge  = similarity of its people and themes to your w'-weighted taste profile
Candidates are your seeds' TMDB recommendations plus top-rated /discover picks
in genres, languages and decades you rarely watch (also narrowed to your
favorite keywords). Films novel enough are ranked by Bayesian rating + novelty
+ bridge, minus disliked franchises, then diversified (MMR).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import replace

import numpy as np
import pandas as pd

from .candidates import (drop_genres, gather_candidates, name_ids, profile_inputs, select_seeds, top_tokens,
                         watchlist_ids)
from .config import ExploreConfig, RecommendConfig
from .diversify import mmr
from .film_info import CARD_COLUMNS, with_card_info
from .features import FacetMatrix, Key, build_facets, facet_tokens, fetch_details, item_similarity
from .profile import TasteProfile, build_profile, similarity
from .quality import bayesian_rating, franchise_opinions, franchise_penalty, prior_strength

PICK_COLUMNS = ["tmdb_id", "title", "year", "poster_path", "score", "quality", "novelty", "bridge",
                "reason", "new_label", "bridge_label", "on_watchlist", "vote_average", "vote_count", *CARD_COLUMNS]
GENRE_IDS = {"Action": 28, "Adventure": 12, "Animation": 16, "Comedy": 35, "Crime": 80, "Documentary": 99,
             "Drama": 18, "Family": 10751, "Fantasy": 14, "History": 36, "Horror": 27, "Music": 10402,
             "Mystery": 9648, "Romance": 10749, "Science Fiction": 878, "Thriller": 53, "War": 10752,
             "Western": 37}
LANGUAGES = {"ar": "Arabic", "bn": "Bengali", "cn": "Cantonese", "cs": "Czech", "da": "Danish", "de": "German",
             "el": "Greek", "en": "English", "es": "Spanish", "fa": "Persian", "fi": "Finnish", "fr": "French",
             "he": "Hebrew", "hi": "Hindi", "hu": "Hungarian", "id": "Indonesian", "it": "Italian", "ja": "Japanese",
             "ko": "Korean", "lv": "Latvian", "ml": "Malayalam", "nl": "Dutch", "no": "Norwegian", "pl": "Polish",
             "pt": "Portuguese", "ro": "Romanian", "ru": "Russian", "sr": "Serbian", "sv": "Swedish", "ta": "Tamil",
             "te": "Telugu", "th": "Thai", "tl": "Tagalog", "tr": "Turkish", "uk": "Ukrainian", "vi": "Vietnamese",
             "zh": "Chinese"}
NOVEL_KINDS = ("lang", "genre", "decade")  # reason preference on ties


def exposure_keys(films: pd.DataFrame) -> list[Key]:
    """Every watched, matched film or series: what you've tried, liked or not."""
    seen = films[films["watched"] & films["tmdb_id"].notna()]
    return list(dict.fromkeys(zip(seen["media_type"], seen["tmdb_id"].astype(int))))


def exposure_counts(details: dict[Key, dict], exposure: list[Key]) -> Counter:
    """Form and place token -> number of watched films with it."""
    return Counter(t for k in exposure for f in ("form", "place") for t in set(facet_tokens(details[k], k[0])[f]))


def novelty(facets: FacetMatrix, exposure: list[Key], keys: list[Key], cfg: ExploreConfig) -> np.ndarray:
    tried = build_profile({k: 1.0 for k in exposure}, facets)
    return 1 - similarity(tried, facets, keys, cfg.novelty_facets)["total"].to_numpy()


def explore_queries(counts: Counter, n_watched: int, profile: TasteProfile, facets: FacetMatrix,
                    details: dict[Key, dict], cfg: ExploreConfig) -> list[tuple[str, dict]]:
    """Top-rated /discover queries for each unexplored genre, language and decade, plain and keyword-bridged."""
    def rare(token):
        return counts[token] < cfg.unexplored_share * n_watched

    buckets = [(f"genre:{g}", {"with_genres": GENRE_IDS[g]}) for g in cfg.genres if rare(f"genre:{g}")]
    buckets += [(f"lang:{c}", {"with_original_language": c}) for c in cfg.languages if rare(f"lang:{c}")]
    buckets += [(f"decade:{d}s", {"primary_release_date.gte": f"{d}-01-01", "primary_release_date.lte": f"{d + 9}-12-31"})
                for d in cfg.decades if rare(f"decade:{d}s")]
    _, keyword_ids = name_ids(details)
    kws = "|".join(str(keyword_ids[k]) for k in top_tokens(profile, facets, "theme", "kw:", cfg.bridge_keywords)
                   if k in keyword_ids)
    base = {"sort_by": "vote_average.desc", "vote_count.gte": cfg.min_votes}
    queries = [(token, {**f, **base}) for token, f in buckets]
    if kws:
        queries += [(token, {**f, **base, "with_keywords": kws}) for token, f in buckets]
    return queries


def loved_tokens(taste: TasteProfile, cfg: ExploreConfig) -> dict[str, set[int]]:
    """Per bridge facet, the indices of your top positive tokens (so reasons saying "you love" are true)."""
    return {f: {i for i in np.argsort(-taste.vectors[f])[:cfg.bridge_reason_top] if taste.vectors[f][i] > 0}
            for f in ("people", "theme") if cfg.bridge_facets[f]}


def _bridge_token(facets: FacetMatrix, taste: TasteProfile, loved: dict[str, set[int]], key: Key,
                  cfg: ExploreConfig) -> str | None:
    """The loved person or theme adding most to the bridge."""
    best, best_val = None, 0.0
    for f, top in loved.items():
        row = facets.matrices[f][facets.index[key]]
        for i, x in zip(row.indices, row.data):
            if i in top and (v := cfg.bridge_facets[f] * x * taste.vectors[f][i]) > best_val:
                best, best_val = facets.vocab[f][i], v
    return best


def _novel_text(token: str, count: int) -> str:
    kind, value = token.split(":", 1)
    if kind == "decade":
        return f"Your first film from the {value}" if not count else f"From the {value}, a decade you rarely watch"
    name = f"{LANGUAGES.get(value, value)}-language" if kind == "lang" else value.lower()
    return f"Your first {name} film" if not count else f"A {name} film, rare in your diary"


BRIDGE_TEXT = {"director": "from {}, a director you love", "dop": "shot by {}, a cinematographer you love",
               "cast": "with {}, an actor you love", "kw": "about “{}”, a theme you love"}


def _novel_token(d: dict, key: Key, counts: Counter, n_watched: int, cfg: ExploreConfig) -> str | None:
    """The rarest unexplored language, genre or decade of a film."""
    tokens = facet_tokens(d, key[0])
    novel = [t for t in tokens["form"] + tokens["place"]
             if t.split(":")[0] in NOVEL_KINDS and counts[t] < cfg.unexplored_share * n_watched]
    return min(novel, key=lambda t: (counts[t], NOVEL_KINDS.index(t.split(":")[0])), default=None)


def _label(token: str | None) -> str | None:
    """Display name of a token: "lang:ko" -> "Korean", "genre:War" -> "War", "director:Kim" -> "Kim"."""
    if not token:
        return None
    kind, value = token.split(":", 1)
    return LANGUAGES.get(value, value) if kind == "lang" else value


def _reason(novel_token: str | None, counts: Counter, bridge_token: str | None) -> str:
    parts = [_novel_text(novel_token, counts[novel_token]) if novel_token else "Highly rated, off your usual path"]
    if bridge_token:
        kind, value = bridge_token.split(":", 1)
        parts.append(BRIDGE_TEXT[kind].format(value))
    return " · ".join(parts)


def scored_pool(films: pd.DataFrame, client, cfg: ExploreConfig | None = None, rcfg: RecommendConfig | None = None,
                exclude: frozenset[int] = frozenset()) -> tuple[pd.DataFrame, FacetMatrix]:
    """Every candidate with quality, novelty, bridge, score, reason and labels (before the novelty floor and MMR).
    `exclude`: TMDB ids to skip besides watched films, e.g. the Boxd In picks already shown."""
    cfg, rcfg = cfg or ExploreConfig(), rcfg or RecommendConfig()
    watched, weights, details = profile_inputs(films, client, rcfg)
    exposure = exposure_keys(films)
    details |= fetch_details([k for k in exposure if k not in details], client, rcfg.workers)
    facets = build_facets(details)
    counts = exposure_counts(details, exposure)
    queries = explore_queries(counts, len(exposure), build_profile(weights, facets), facets, details, cfg)
    seeds = select_seeds(films, rcfg)
    cands = gather_candidates(seeds, queries, watched | exclude, client,
                              replace(rcfg, min_votes=cfg.min_votes))
    if cands.empty:
        return cands, facets

    m = prior_strength(cands["released"], rcfg, cfg.bayes_m)
    cands["quality"] = bayesian_rating(cands["vote_average"], cands["vote_count"], m) / 10
    recommended = cands["because"].map(bool)
    cands = pd.concat([cands[recommended], cands[~recommended].nlargest(cfg.max_candidates, "quality")])
    keys = [("movie", int(i)) for i in cands["tmdb_id"]]
    details |= fetch_details([k for k in keys if k not in details], client, rcfg.workers)
    cands = drop_genres(cands, details, rcfg.exclude_genres)
    keys = [("movie", int(i)) for i in cands["tmdb_id"]]
    facets = build_facets(details)
    taste = build_profile(weights, facets)
    opinions = franchise_opinions(weights, details)
    cands["novelty"] = novelty(facets, exposure, keys, cfg)
    bridge = similarity(taste, facets, keys, cfg.bridge_facets)["total"]
    top = bridge[cands["novelty"].to_numpy() >= cfg.novelty_min].max()
    cands["bridge"] = (bridge / top if top > 0 else bridge).to_numpy()  # raw cosines are tiny; 1 = best novel bridge
    cands["score"] = (cfg.quality_weight * cands["quality"] + cfg.novelty_weight * cands["novelty"]
                      + cfg.bridge_weight * cands["bridge"]
                      - [franchise_penalty(details[k], opinions, rcfg) for k in keys])
    loved = loved_tokens(taste, cfg)
    novel = [_novel_token(details[k], k, counts, len(exposure), cfg) for k in keys]
    bridges = [_bridge_token(facets, taste, loved, k, cfg) for k in keys]
    cands["reason"] = [_reason(n, counts, b) for n, b in zip(novel, bridges)]
    cands["new_label"] = [_label(n) for n in novel]
    cands["bridge_label"] = [_label(b) for b in bridges]
    return with_card_info(cands, details).reset_index(drop=True), facets


def recommend(films: pd.DataFrame, client, cfg: ExploreConfig | None = None, rcfg: RecommendConfig | None = None,
              k: int = 20, mmr_lambda: float | None = None, exclude: frozenset[int] = frozenset()) -> pd.DataFrame:
    cfg = cfg or ExploreConfig()
    cands, facets = scored_pool(films, client, cfg, rcfg, exclude)
    pool = cands[cands["novelty"] >= cfg.novelty_min].nlargest(cfg.mmr_pool, "score") if len(cands) else cands
    if pool.empty:
        return pd.DataFrame(columns=PICK_COLUMNS)
    keys = [("movie", int(i)) for i in pool["tmdb_id"]]
    picks = pool.iloc[mmr(pool["score"].to_numpy(), item_similarity(facets, keys, cfg.mmr_facets), k,
                          mmr_lambda if mmr_lambda is not None else cfg.mmr_lambda)]
    return picks.assign(on_watchlist=picks["tmdb_id"].isin(watchlist_ids(films)))[PICK_COLUMNS].reset_index(drop=True)
