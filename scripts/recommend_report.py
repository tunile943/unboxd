"""Boxd In (and Boxd Out) on a real export: timing, top picks, and leave-one-out recall.

Usage: python scripts/recommend_report.py <export.zip> [--cold] [--out] [--loo]
  --cold  empty cache, to time a first-time visitor
  --out   also Boxd Out, with list metrics
  --loo   leave-one-out: hide each favorite (or, for Boxd Out, each novel liked film) and check it comes back
"""

import argparse
import tempfile
import time
from dataclasses import replace
from pathlib import Path

import pandas as pd

from unboxd import boxd_out
from unboxd.boxd_in import recommend, select_seeds
from unboxd.cache import SQLiteCache
from unboxd.config import ExploreConfig, RecommendConfig
from unboxd.evaluate import explore_leave_one_out, leave_one_out, list_metrics
from unboxd.ingest import load_export
from unboxd.resolve import resolve_films
from unboxd.tmdb import TMDBClient
from unboxd.weights import compute_weights


def report_loo(films: pd.DataFrame, client, cfg: RecommendConfig) -> None:
    print("\nleave-one-out (hide one favorite, does it come back?)")
    for rw in (0.0, 0.25, 0.5, 1.0):
        r = leave_one_out(films, client, replace(cfg, rec_weight=rw))
        print(f"  rec_weight={rw}: in pool {r.in_pool.sum()}/{len(r)}, in top 50 {r.in_top_k.sum()}/{len(r)}"
              f"  {list(r.loc[r.in_top_k, 'name'])}")


def report_out(films: pd.DataFrame, client, cfg: RecommendConfig, boxd_in_top50: set[int], loo: bool) -> None:
    start = time.perf_counter()
    shown = frozenset(recommend(films, client, cfg)["tmdb_id"])  # the page excludes Boxd In's top 20
    picks = boxd_out.recommend(films, client, ExploreConfig(), cfg, exclude=shown)
    print(f"\nBoxd Out ({time.perf_counter() - start:.1f}s)")
    print(picks[["title", "year", "score", "quality", "novelty", "bridge", "reason", "on_watchlist"]]
          .round(2).to_string())
    m = list_metrics(picks, client, boxd_in_top50)
    print(f"mean TMDB rating {m['rating']:.2f}, mean novelty {m['novelty']:.2f}, {m['languages']} languages, "
          f"{m['decades']} decades, {m['genres']} genres, {m['english']} in English, {m['bridged']} with a bridge, "
          f"{m['overlap']} also in Boxd In's top 50")
    if loo:
        r = explore_leave_one_out(films, client, ExploreConfig(), cfg)
        print(f"explore leave-one-out: in pool {r.in_pool.sum()}/{len(r)}, in top 50 {r.in_top_k.sum()}/{len(r)}"
              f"  {list(r.loc[r.in_top_k, 'name'])}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("export")
    ap.add_argument("--cold", action="store_true")
    ap.add_argument("--out", action="store_true")
    ap.add_argument("--loo", action="store_true")
    args = ap.parse_args()

    cache = SQLiteCache(Path(tempfile.mkdtemp()) / "cold.sqlite") if args.cold else None
    client, cfg = TMDBClient(cache=cache), RecommendConfig()
    start = time.perf_counter()
    films = load_export(args.export)
    films["weight"] = compute_weights(films)
    films = resolve_films(films, client)
    matched = time.perf_counter()
    picks = recommend(films, client, cfg)
    done = time.perf_counter()

    seeds, anti = select_seeds(films, cfg), select_seeds(films, cfg, anti=True)
    print(f"{len(seeds)} seeds (w' >= {seeds['weight'].min():.2f}), {len(anti)} anti-seeds; "
          f"matching {matched - start:.1f}s, recommending {done - matched:.1f}s")
    pd.set_option("display.width", 200, "display.max_colwidth", 70)
    cols = ["title", "year", "score", "strength", "similarity", "reason", "on_watchlist"]
    print(picks[cols].round(2).to_string())
    if args.out:
        report_out(films, client, cfg, set(recommend(films, client, cfg, k=50)["tmdb_id"]), args.loo)
    if args.loo:
        report_loo(films, client, cfg)


if __name__ == "__main__":
    main()
