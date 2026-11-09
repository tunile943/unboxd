import json
from dataclasses import replace

import pandas as pd

from conftest import BOXD_IN_FIXTURES, FakeTMDB, movie, rec
from unboxd.boxd_in import franchise_opinions, franchise_penalty, gather_candidates, recommend, select_seeds
from unboxd.config import RecommendConfig
from unboxd.evaluate import leave_one_out

CFG = RecommendConfig(min_seeds=1, anti_min_seeds=1, discover_people=0, discover_keywords=0)


def films(*rows):
    defaults = {"year": 2000, "rating": 3.0, "liked": False, "rewatch_count": 0, "watched": True,
                "on_watchlist": False, "last_watched": pd.NaT, "media_type": "movie"}
    df = pd.DataFrame([{**defaults, **r} for r in rows])
    df["last_watched"] = pd.to_datetime(df["last_watched"])
    return df


def ladder(n=20, top=(0.9, 0.8, 0.8, 0.8)):
    weights = list(top) + [0.1] * (n - len(top) - 1) + [-0.4]
    return films(*({"name": f"F{i}", "tmdb_id": i, "weight": w} for i, w in enumerate(weights, 1)))


def test_seed_cutoff_includes_ties():
    assert list(select_seeds(ladder(), CFG)["tmdb_id"]) == [1, 2, 3, 4]  # top 15% of 20 = 3, plus the tie


def test_seed_floor():
    assert len(select_seeds(ladder(), replace(CFG, min_seeds=10))) == 10


def test_seed_cap_breaks_ties_by_recency():
    df = ladder()
    df.loc[1:3, "last_watched"] = pd.to_datetime(["2024-01-01", "2025-06-01", "2023-01-01"])
    assert list(select_seeds(df, replace(CFG, max_seeds=2))["tmdb_id"]) == [1, 3]


def test_seeds_are_matched_positive_movies():
    df = ladder()
    df.loc[0, "media_type"] = "tv"
    df.loc[1, "tmdb_id"] = None
    assert list(select_seeds(df, CFG)["tmdb_id"]) == [3, 4]


def test_anti_seeds():
    assert list(select_seeds(ladder(), CFG, anti=True)["tmdb_id"]) == [20]


def test_gather_candidates_filters_and_aggregates():
    client = FakeTMDB({
        "rec|1": [rec(100), rec(101), rec(102, year=2099), rec(103, votes=3), {**rec(104), "media_type": "tv"}],
        "rec|2": [rec(100), rec(105)],
        "rec|20": [rec(105), rec(106)],
        "disc|" + json.dumps({"with_crew": 7}, sort_keys=True): [rec(107)],
    })
    seeds = films({"name": "A", "tmdb_id": 1, "weight": 0.9}, {"name": "B", "tmdb_id": 2, "weight": 0.5})
    anti = films({"name": "Z", "tmdb_id": 20, "weight": -0.4})
    c = gather_candidates(seeds, anti, [("From Someone", {"with_crew": 7})], {101}, client,
                          replace(CFG, anti_weight=0.5), today="2026-01-01").set_index("tmdb_id")
    assert set(c.index) == {100, 105, 107}  # 101 watched, 102 unreleased, 103 few votes, 104 TV, 106 only disliked
    assert c.loc[100, "strength"] == 1.4 and c.loc[100, "because"] == ["A", "B"]
    assert round(c.loc[105, "strength"], 2) == 0.3  # 0.5 - 0.5 * 0.4
    assert c.loc[107, "via"] == ["From Someone"] and c.loc[107, "strength"] == 0


def recommend_setup():
    details = {
        "md|1": movie("Wes Anderson", ["Comedy"], ["quirky"]),
        "md|2": movie("Wes Anderson", ["Comedy"], ["quirky", "family"]),
        "md|3": movie("Michael Bay", ["Action"], ["explosion"]),
        "md|10": movie("Wes Anderson", ["Comedy"], ["quirky"]),  # near-duplicates of each other
        "md|11": movie("Wes Anderson", ["Comedy"], ["quirky"]),
        "md|12": movie("Noah Baumbach", ["Comedy"], ["family"]),
        "md|13": movie("Michael Bay", ["Action"], ["explosion"]),
    }
    client = FakeTMDB({**details, "rec|1": [rec(10), rec(11), rec(12), rec(13), rec(2)], "rec|2": [rec(12)]})
    df = films({"name": "Rushmore", "tmdb_id": 1, "weight": 0.9, "rating": 5.0},
               {"name": "Moonrise Kingdom", "tmdb_id": 2, "weight": 0.6, "rating": 4.5},
               {"name": "Transformers", "tmdb_id": 3, "weight": -0.4, "rating": 1.0},
               {"name": "Watchlisted", "tmdb_id": 12, "weight": float("nan"), "watched": False,
                "on_watchlist": True, "rating": float("nan")})
    return df, client


ALL_SEEDS = replace(CFG, seed_pct=1.0)


def test_recommend():
    df, client = recommend_setup()
    picks = recommend(df, client, ALL_SEEDS, k=2, mmr_lambda=0.5).set_index("tmdb_id")
    assert len({10, 11} & set(picks.index)) == 1 and 12 in picks.index  # MMR skips the near-duplicate
    all_picks = recommend(df, client, ALL_SEEDS, k=10)["tmdb_id"].tolist()
    assert 2 not in all_picks  # watched
    assert all_picks[-1] == 13  # like the disliked film: last
    assert picks.loc[12, "on_watchlist"] and picks.loc[12, "reason"] == "Because you liked Rushmore and Moonrise Kingdom"


def test_leave_one_out():
    df, client = recommend_setup()
    r = leave_one_out(df, client, ALL_SEEDS, k=5).set_index("name")
    assert r.loc["Moonrise Kingdom", "in_pool"]  # Rushmore recommends it
    assert not r.loc["Rushmore", "in_pool"]


def test_recorded_real_run():
    df = films({"name": "Heat", "tmdb_id": 949, "rating": 5.0}, {"name": "Parasite", "tmdb_id": 496243, "rating": 4.5},
               {"name": "Transformers", "tmdb_id": 1858, "rating": 1.0})
    from unboxd.weights import compute_weights
    df["weight"] = compute_weights(df)
    picks = recommend(df, FakeTMDB(BOXD_IN_FIXTURES), RecommendConfig(min_seeds=2))
    assert len(picks) == 20
    assert not {949, 496243, 1858} & set(picks["tmdb_id"])
    assert picks["reason"].str.contains("Heat|Parasite|director|theme").all()


def in_collection(d, cid):
    return {**d, "belongs_to_collection": {"id": cid}}


def test_franchise_opinion_is_the_average():
    details = {("movie", 1): in_collection(movie(), 7), ("movie", 2): in_collection(movie(), 7),
               ("movie", 3): in_collection(movie(), 8), ("tv", 4): {}}
    ops = franchise_opinions({("movie", 1): 0.4, ("movie", 2): -0.35, ("movie", 3): -0.35, ("tv", 4): -0.5}, details)
    assert round(ops[7], 3) == 0.025 and ops[8] == -0.35 and len(ops) == 2


def test_franchise_penalty():
    ops = {7: 0.025, 8: -0.35, 9: -0.05}
    assert franchise_penalty(in_collection(movie(), 8), ops, CFG) == 0.35  # disliked on balance
    assert franchise_penalty(in_collection(movie(), 7), ops, CFG) == 0  # split opinion
    assert franchise_penalty(in_collection(movie(), 9), ops, CFG) == 0  # "it was fine": dead zone
    assert franchise_penalty(movie(), ops, CFG) == 0  # standalone film


def test_sequel_of_disliked_film_ranks_below_its_twin():
    df, client = recommend_setup()
    client.responses["md|3"] = in_collection(client.responses["md|3"], 60)  # Transformers, disliked
    client.responses["md|11"] = in_collection(client.responses["md|11"], 60)  # its "sequel", otherwise = film 10
    picks = list(recommend(df, client, ALL_SEEDS, k=10, mmr_lambda=1.0)["tmdb_id"])
    assert picks.index(10) < picks.index(11)
