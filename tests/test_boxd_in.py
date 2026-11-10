from dataclasses import replace

import pytest

from conftest import BOXD_IN_FIXTURES, FakeTMDB, films, movie, rec
from test_quality import in_collection
import pandas as pd

from unboxd.boxd_in import keyword_only, recommend, seed_credibility
from unboxd.config import RecommendConfig
from unboxd.evaluate import leave_one_out

CFG = RecommendConfig(min_seeds=1, discover_people=0, discover_keywords=0)


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


def test_sequel_of_disliked_film_ranks_below_its_twin():
    df, client = recommend_setup()
    client.responses["md|3"] = in_collection(client.responses["md|3"], 60)  # Transformers, disliked
    client.responses["md|11"] = in_collection(client.responses["md|11"], 60)  # its "sequel", otherwise = film 10
    picks = list(recommend(df, client, ALL_SEEDS, k=10, mmr_lambda=1.0)["tmdb_id"])
    assert picks.index(10) < picks.index(11)


def test_lone_seed_nominations_are_discounted():
    df, client = recommend_setup()
    client.responses["rec|1"] = [{**rec(10), "vote_average": 7.0}, {**rec(11), "vote_average": 7.0}]
    client.responses["rec|2"] = [{**rec(11), "vote_average": 7.0}]
    client.responses["md|10"] = client.responses["md|11"] = movie()
    scores = {}
    for penalty in (0.0, 0.5):
        picks = recommend(df, client, replace(ALL_SEEDS, lone_seed_penalty=penalty), k=10, mmr_lambda=1.0)
        scores[penalty] = picks.set_index("tmdb_id")["score"]
    assert scores[0.5][10] == pytest.approx(scores[0.0][10] - 0.5) and scores[0.5][11] == pytest.approx(scores[0.0][11])


def test_tv_movies_are_dropped():
    df, client = recommend_setup()
    client.responses["md|10"] = movie("Wes Anderson", ["Comedy", "TV Movie"], ["quirky"])
    assert 10 not in set(recommend(df, client, ALL_SEEDS, k=10)["tmdb_id"])
    assert 10 in set(recommend(df, client, replace(ALL_SEEDS, exclude_genres=()), k=10)["tmdb_id"])


def test_quality_breaks_ties():
    df, client = recommend_setup()
    client.responses["rec|1"] = [{**rec(10), "vote_average": 6.0, "vote_count": 5000},
                                 {**rec(11), "vote_average": 8.5, "vote_count": 5000}]  # 10 and 11 are twins
    picks = list(recommend(df, client, ALL_SEEDS, k=10, mmr_lambda=1.0)["tmdb_id"])
    assert picks.index(11) < picks.index(10)


def test_seed_credibility():
    details = {("movie", 1): {"vote_count": 12000}, ("movie", 2): {"vote_count": 100}}
    cfg = replace(CFG, reliable_seed_votes=500)
    assert seed_credibility([2], details, cfg) == 0.2
    assert seed_credibility([2, 1], details, cfg) == 1.0  # the most reliable recommending seed counts
    assert seed_credibility([], details, cfg) == 1.0  # discover picks


def test_unreliable_seed_is_discounted():
    df, client = recommend_setup()
    client.responses["md|1"] = {**client.responses["md|1"], "vote_count": 50}  # Rushmore: thin TMDB data
    client.responses["md|2"] = {**client.responses["md|2"], "vote_count": 9000}
    client.responses["rec|1"] = [rec(10)]  # twins: 10 only via the unreliable seed, 11 via the reliable one
    client.responses["rec|2"] = [rec(11)]
    picks = list(recommend(df, client, replace(ALL_SEEDS, reliability_weight=0.5), k=10, mmr_lambda=1.0)["tmdb_id"])
    assert picks.index(11) < picks.index(10)


def test_keyword_only():
    c = pd.DataFrame({"because": [["Heat"], [], [], []], "via_crew": [[None], [None], [42], [None, 42]]})
    assert keyword_only(c).tolist() == [False, True, False, False]



@pytest.mark.parametrize("found_by, kept", [("keyword", False), ("keyword+seed", True), ("director", True)])
def test_thin_keyword_only_finds_are_dropped(found_by, kept):
    df, client = recommend_setup()
    cfg = replace(ALL_SEEDS, discover_keywords=int("keyword" in found_by), discover_people=int(found_by == "director"),
                  min_votes=1)
    thin = rec(77, votes=400)
    for key in list(client.responses):
        if key.startswith("disc|"):
            del client.responses[key]
    client.responses["md|77"] = movie("Wes Anderson", ["Comedy"], ["quirky"])
    if found_by == "keyword+seed":
        client.responses["rec|1"] = client.responses["rec|1"] + [thin]
    orig = client.discover
    client.discover = lambda **f: [thin] + orig(**f)
    assert 77 in set(recommend(df, client, replace(cfg, discover_min_votes=0), k=10)["tmdb_id"])  # found at all
    assert (77 in set(recommend(df, client, cfg, k=10)["tmdb_id"])) == kept
