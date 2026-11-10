"""What a pick card shows beyond the ranking: quick facts from details, plus trailer and where to watch."""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor

import pandas as pd

CARD_COLUMNS = ["runtime", "genres", "director", "cast", "overview", "language"]
TRAILER_TYPES = ("Trailer", "Teaser")
RESOLD = re.compile(r" (Amazon|Roku Premium|Apple TV) Channel$")  # a service resold inside another store


def card_info(d: dict) -> dict:
    crew = d.get("credits", {}).get("crew", [])
    return {
        "runtime": d.get("runtime") or None,
        "genres": [g["name"] for g in d.get("genres", [])[:2]],
        "director": next((p["name"] for p in crew if p.get("job") == "Director"), None),
        "cast": [p["name"] for p in d.get("credits", {}).get("cast", [])[:3]],
        "overview": d.get("overview") or None,
        "language": d.get("original_language") or None,
    }


def with_card_info(cands: pd.DataFrame, details: dict) -> pd.DataFrame:
    """Adds CARD_COLUMNS to candidate rows (movies) from their cached details."""
    info = [card_info(details.get(("movie", int(i)), {})) for i in cands["tmdb_id"]]
    return cands.assign(**{c: [row[c] for row in info] for c in CARD_COLUMNS})


def pick_trailer(videos: list[dict], language: str | None = None) -> dict | None:
    """Best YouTube trailer: Trailer over Teaser, official first, then English, the film's language, newest."""
    ok = [v for v in videos if v.get("site") == "YouTube" and v.get("type") in TRAILER_TYPES and v.get("key")]
    if not ok:
        return None
    best = max(ok, key=lambda v: (v["type"] == "Trailer", bool(v.get("official")),
                                  v.get("iso_639_1") == "en", v.get("iso_639_1") == language,
                                  v.get("published_at", "")))
    return {"key": best["key"], "name": best.get("name", "Trailer")}


def region_providers(results: dict, region: str) -> dict:
    """One region's offers. Free and ad-supported count as streaming; channels resold by other stores are dropped."""
    r = results.get(region, {})

    def offers(*kinds: str) -> list[dict]:
        seen, out = set(), []
        for p in sorted((p for k in kinds for p in r.get(k, [])), key=lambda p: p.get("display_priority", 99)):
            if p["provider_id"] not in seen and not RESOLD.search(p["provider_name"]):
                seen.add(p["provider_id"])
                out.append({"name": p["provider_name"], "logo": p.get("logo_path")})
        return out

    return {"link": r.get("link"), "stream": offers("flatrate", "free", "ads"),
            "rent": offers("rent"), "buy": offers("buy")}


def extras(films: list[tuple[int, str | None]], region: str, client, workers: int = 8) -> dict[int, dict]:
    """{tmdb_id: {trailer, providers}} for (tmdb_id, original language) pairs."""
    def one(film: tuple[int, str | None]) -> tuple[int, dict]:
        tmdb_id, language = film
        return tmdb_id, {"trailer": pick_trailer(client.videos(tmdb_id, language), language),
                         "providers": region_providers(client.watch_providers(tmdb_id), region)}

    with ThreadPoolExecutor(max_workers=workers) as pool:
        return dict(pool.map(one, dict.fromkeys(films)))
