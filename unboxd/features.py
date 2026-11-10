"""TMDB details -> TF-IDF vectors per facet (people / form / place / theme)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer

FACETS = ("people", "form", "place", "theme")
Key = tuple[str, int]  # (media_type, tmdb_id)
# TMDB keywords about how a film was made or released, not what it's about
META_KEYWORDS = {"aftercreditsstinger", "duringcreditsstinger", "woman director"}

TV_GENRES = {
    "Sci-Fi & Fantasy": ["Science Fiction", "Fantasy"],
    "Action & Adventure": ["Action", "Adventure"],
    "War & Politics": ["War"],
    "Kids": ["Family"],
}


@dataclass
class FacetMatrix:
    keys: list[Key]
    matrices: dict[str, csr_matrix]  # facet -> (n_films x n_tokens), L2-normalized rows
    vocab: dict[str, list[str]]
    index: dict[Key, int] = field(init=False)

    def __post_init__(self):
        self.index = {k: i for i, k in enumerate(self.keys)}


def fetch_details(keys: list[Key], client, workers: int = 8) -> dict[Key, dict]:
    def one(key: Key) -> tuple[Key, dict]:
        media_type, tmdb_id = key
        return key, client.tv_details(tmdb_id) if media_type == "tv" else client.details(tmdb_id)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return dict(pool.map(one, dict.fromkeys(keys)))


def facet_tokens(d: dict, media_type: str) -> dict[str, list[str]]:
    if media_type == "tv":
        credits = d.get("aggregate_credits", {})
        crew = [(p["name"], j["job"]) for p in credits.get("crew", []) for j in p.get("jobs", [])]
        directors = [p["name"] for p in d.get("created_by", [])]
        keywords = d.get("keywords", {}).get("results", [])
        date = d.get("first_air_date") or ""
        genres = [g for x in d.get("genres", []) for g in TV_GENRES.get(x["name"], [x["name"]])]
    else:
        credits = d.get("credits", {})
        crew = [(p["name"], p["job"]) for p in credits.get("crew", [])]
        directors = [name for name, job in crew if job == "Director"]
        keywords = d.get("keywords", {}).get("keywords", [])
        date = d.get("release_date") or ""
        genres = [g["name"] for g in d.get("genres", [])]
    cast = sorted(credits.get("cast", []), key=lambda p: p.get("order", 999))[:5]
    dops = dict.fromkeys(name for name, job in crew if job == "Director of Photography")
    lang = d.get("original_language")
    return {
        "people": [f"director:{n}" for n in directors] + [f"dop:{n}" for n in dops]
        + [f"cast:{p['name']}" for p in cast],
        "form": [f"genre:{g}" for g in genres] + ([f"decade:{date[:3]}0s"] if date[:4].isdigit() else []),
        "place": [f"country:{c}" for c in d.get("origin_country", [])] + ([f"lang:{lang}"] if lang else []),
        "theme": [f"kw:{k['name']}" for k in keywords if k["name"] not in META_KEYWORDS],
    }


def _tokens(doc: list[str]) -> list[str]:
    return doc


def build_facets(details: dict[Key, dict], drop: tuple[str, ...] = ()) -> FacetMatrix:
    """`drop`: token prefixes to leave out (e.g. "decade:")."""
    keys = list(details)
    tokens = [{f: [t for t in toks if not t.startswith(drop)] if drop else toks
               for f, toks in facet_tokens(details[k], k[0]).items()} for k in keys]
    matrices, vocab = {}, {}
    for f in FACETS:
        docs = [t[f] for t in tokens]
        if not any(docs):
            matrices[f], vocab[f] = csr_matrix((len(keys), 0)), []
            continue
        vec = TfidfVectorizer(analyzer=_tokens)
        matrices[f] = vec.fit_transform(docs).tocsr()
        vocab[f] = list(vec.get_feature_names_out())
    return FacetMatrix(keys, matrices, vocab)


def item_similarity(facets: FacetMatrix, keys: list[Key], facet_weights: dict[str, float]) -> np.ndarray:
    """Facet-weighted cosine similarity between the given films."""
    idx = [facets.index[k] for k in keys]
    total = sum(facet_weights.values())
    return sum(w / total * (facets.matrices[f][idx] @ facets.matrices[f][idx].T).toarray()
               for f, w in facet_weights.items())
