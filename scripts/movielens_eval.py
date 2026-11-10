"""Boxd In / Boxd Out across MovieLens users (GroupLens ml-latest-small), a wider test set than one export.

Usage: python scripts/movielens_eval.py data/movielens/ml-latest-small [--split tune|test] [--users 40] [--compare]
  --split    users are split once into two fixed, disjoint halves: pick settings on "tune",
             then confirm them on "test" (untouched until then)
  --compare  also run the alternative configs below, to re-check tuning decisions
  --lambdas  sweep MMR lambda instead, e.g. --lambdas 0.5 0.7 0.9

Get the data from https://grouplens.org/datasets/movielens/latest/ into data/ (git-ignored; not redistributable).
MovieLens has no likes, rewatches or watchlist, and ends in 2018, so new-release handling isn't tested here.
"""

import argparse
import re
import time
from dataclasses import replace
from pathlib import Path

import pandas as pd

from unboxd import boxd_in, boxd_out
from unboxd.config import ExploreConfig, RecommendConfig
from unboxd.evaluate import explore_leave_one_out, leave_one_out, list_metrics
from unboxd.tmdb import TMDBClient
from unboxd.weights import compute_weights

YEAR = re.compile(r"\s*\((\d{4})\)\s*$")
IN, OUT = RecommendConfig(), ExploreConfig()
IN_CONFIGS = {
    "now": IN,
    "previous commit": replace(IN, min_votes=50, lone_seed_penalty=0.0, new_release_m_mult=1.0, exclude_genres=()),
    "min_votes 50": replace(IN, min_votes=50),
    "no lone-seed discount": replace(IN, lone_seed_penalty=0.0),
    "TV movies kept": replace(IN, exclude_genres=()),
}
OUT_CONFIGS = {
    "now": OUT,
    "novelty 0.5/0.5, floor 0.5": replace(OUT, novelty_min=0.5, novelty_facets={**OUT.novelty_facets, "form": 0.5,
                                                                                 "place": 0.5}),
    "bridge 0.5": replace(OUT, bridge_weight=0.5),
}


def load_users(path: Path, split: str = "tune", min_ratings: int = 50, max_ratings: int = 500, n: int = 40,
               seed: int = 0) -> dict[int, pd.DataFrame]:
    """A fixed sample of users with min..max ratings from one half ("tune" or "test"), as weighted film tables."""
    ratings = pd.read_csv(path / "ratings.csv")
    movies = pd.read_csv(path / "movies.csv").merge(pd.read_csv(path / "links.csv"), on="movieId")
    movies = movies[movies["tmdbId"].notna()]
    movies["year"] = movies["title"].str.extract(YEAR, expand=False).astype("Int64")
    movies["name"] = movies["title"].str.replace(YEAR, "", regex=True)
    ratings = ratings.merge(movies[["movieId", "name", "year", "tmdbId"]], on="movieId")
    counts = ratings["userId"].value_counts()
    eligible = counts[(counts >= min_ratings) & (counts <= max_ratings)].index.sort_values()
    shuffled = pd.Series(eligible).sample(frac=1, random_state=seed)
    half = len(shuffled) // 2
    picked = (shuffled[:half] if split == "tune" else shuffled[half:]).head(n).sort_values()
    users = {}
    for uid in picked:
        r = ratings[ratings["userId"] == uid]
        films = pd.DataFrame({
            "name": r["name"].to_numpy(), "year": r["year"].to_numpy(), "rating": r["rating"].to_numpy(),
            "liked": False, "rewatch_count": 0, "watched": True, "on_watchlist": False,
            "last_watched": pd.to_datetime(r["timestamp"].to_numpy(), unit="s"),
            "tmdb_id": r["tmdbId"].astype(int).to_numpy(), "media_type": "movie", "match_confidence": "high"})
        films["weight"] = compute_weights(films)
        users[int(uid)] = films
    return users


def eval_in(users: dict[int, pd.DataFrame], client, cfg: RecommendConfig, max_held: int) -> dict:
    pool = top = held = 0
    metrics = []
    for films in users.values():
        r = leave_one_out(films, client, cfg, max_held=max_held)
        pool, top, held = pool + r["in_pool"].sum(), top + r["in_top_k"].sum(), held + len(r)
        metrics.append(list_metrics(boxd_in.recommend(films, client, cfg), client))
    return {"pool": f"{pool}/{held}", "top50": f"{top}/{held}", "top50 %": round(100 * top / max(held, 1), 1),
            **pd.DataFrame(metrics)[["rating", "median_votes", "languages", "english"]].mean().round(2)}


def eval_out(users: dict[int, pd.DataFrame], client, cfg: ExploreConfig, max_held: int) -> dict:
    pool = top = held = 0
    metrics = []
    for films in users.values():
        r = explore_leave_one_out(films, client, cfg, IN, max_held=max_held)
        pool, top, held = pool + r["in_pool"].sum(), top + r["in_top_k"].sum(), held + len(r)
        shown = set(boxd_in.recommend(films, client, IN)["tmdb_id"])
        picks = boxd_out.recommend(films, client, cfg, IN, exclude=frozenset(shown))
        metrics.append(list_metrics(picks, client, set(boxd_in.recommend(films, client, IN, k=50)["tmdb_id"])))
    cols = ["rating", "novelty", "languages", "decades", "genres", "english", "bridged", "overlap"]
    return {"pool": f"{pool}/{held}", "top50": f"{top}/{held}", **pd.DataFrame(metrics)[cols].mean().round(2)}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", type=Path)
    ap.add_argument("--split", choices=("tune", "test"), default="tune")
    ap.add_argument("--users", type=int, default=40)
    ap.add_argument("--max-held", type=int, default=10, help="held-out films per user in leave-one-out")
    ap.add_argument("--compare", action="store_true")
    ap.add_argument("--lambdas", type=float, nargs="+")
    args = ap.parse_args()

    users = load_users(args.path, args.split, n=args.users)
    sizes = pd.Series([len(f) for f in users.values()])
    print(f"{args.split} split: {len(users)} users, {sizes.min()}-{sizes.max()} ratings (median {sizes.median():.0f})")
    client = TMDBClient()
    pd.set_option("display.width", 200)
    for title, configs, run in (("Boxd In", IN_CONFIGS, eval_in), ("Boxd Out", OUT_CONFIGS, eval_out)):
        rows = []
        if args.lambdas:
            configs = {f"lambda {lam}": replace(configs["now"], mmr_lambda=lam) for lam in args.lambdas}
        elif not args.compare:
            configs = {"now": configs["now"]}
        for name, cfg in configs.items():
            start = time.perf_counter()
            rows.append({"config": name, **run(users, client, cfg, args.max_held),
                         "secs": round(time.perf_counter() - start)})
            print(f"  {title} / {name} done in {rows[-1]['secs']}s", flush=True)
        print(f"\n{title}\n{pd.DataFrame(rows).to_string(index=False)}\n", flush=True)


if __name__ == "__main__":
    main()
