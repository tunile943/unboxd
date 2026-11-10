import json
from dataclasses import replace

import pandas as pd

from conftest import FakeTMDB, films, rec
from unboxd.candidates import gather_candidates, select_seeds, verify_crew
from unboxd.config import RecommendConfig

CFG = RecommendConfig(min_seeds=1, discover_people=0, discover_keywords=0)


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


def test_gather_candidates_filters_and_aggregates():
    client = FakeTMDB({
        "rec|1": [rec(100), rec(101), rec(102, year=2099), rec(103, votes=3), {**rec(104), "media_type": "tv"}],
        "rec|2": [rec(100), rec(105)],
        "disc|" + json.dumps({"with_crew": 7}, sort_keys=True): [rec(107)],
    })
    seeds = films({"name": "A", "tmdb_id": 1, "weight": 0.9}, {"name": "B", "tmdb_id": 2, "weight": 0.5})
    c = gather_candidates(seeds, [("From Someone", {"with_crew": 7})], {101}, client, CFG,
                          today="2026-01-01").set_index("tmdb_id")
    assert set(c.index) == {100, 105, 107}  # 101 watched, 102 unreleased, 103 few votes, 104 TV
    assert c.loc[100, "strength"] == 1.4 and c.loc[100, "because"] == ["A", "B"]
    assert c.loc[107, "via"] == ["From Someone"] and c.loc[107, "via_crew"] == [7] and c.loc[107, "strength"] == 0


def test_cap_never_drops_discover_picks():
    client = FakeTMDB({"rec|1": [rec(100), rec(101)],
                       "disc|" + json.dumps({"with_crew": 7}, sort_keys=True): [rec(107)]})
    seeds = films({"name": "A", "tmdb_id": 1, "weight": 0.9})
    c = gather_candidates(seeds, [("From Someone", {"with_crew": 7})], set(), client,
                          replace(CFG, max_candidates=1), today="2026-01-01")
    assert set(c["tmdb_id"]) == {100, 107}  # cap applies to recommended films only


def test_director_picks_are_checked_against_credits():
    cands = pd.DataFrame({"tmdb_id": [1, 2, 3], "because": [[], [], []],
                          "via": [["From Ann, a director you love"]] * 3, "via_crew": [[7], [7], [7]]})
    crew = {1: [{"id": 7, "job": "Director"}], 2: [{"id": 7, "job": "Screenplay"}],
            3: [{"id": 7, "job": "Storyboard Artist"}]}
    out = verify_crew(cands, {("movie", i): {"credits": {"crew": c}} for i, c in crew.items()}).set_index("tmdb_id")
    assert out.loc[1, "via"] == ["From Ann, a director you love"]
    assert out.loc[2, "via"] == ["Written by Ann, a director you love"]
    assert out.loc[3, "via"] == ["With Ann, a director you love, as storyboard artist"]
