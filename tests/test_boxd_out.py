from collections import Counter
from dataclasses import replace

from conftest import FakeTMDB, movie, rec
from test_boxd_in import films
from unboxd import boxd_out
from unboxd.boxd_in import profile_inputs
from unboxd.config import ExploreConfig, RecommendConfig
from unboxd.evaluate import explore_leave_one_out
from unboxd.features import build_facets
from unboxd.profile import build_profile
from unboxd.weights import compute_weights

RCFG = RecommendConfig(min_seeds=1, discover_people=0, discover_keywords=0)
CFG = ExploreConfig(languages=("ko", "fr"), decades=(1960,))


class WorldTMDB(FakeTMDB):
    """/discover answers by language only; every other bucket is empty."""

    def __init__(self, responses, by_lang):
        super().__init__(responses)
        self.by_lang = by_lang

    def discover(self, **filters):
        self.calls.append(("disc", filters))
        lang = filters.get("with_original_language")
        return self.by_lang.get((lang, "with_keywords" in filters), [])


def hit(id, votes=2000, avg=8.0, year=2000):
    return {**rec(id, year=year, votes=votes), "vote_average": avg}


def world(**extra_films):
    """Ten watched US 2020s action films; you loved Kim's revenge film (1) and disliked Bad's (10)."""
    rows = [{"name": f"F{i}", "tmdb_id": i, "rating": 3.0} for i in range(2, 10)]
    rows += [{"name": "F1", "tmdb_id": 1, "rating": 5.0, "liked": True}, {"name": "F10", "tmdb_id": 10, "rating": 1.0},
             {"name": "Wish", "tmdb_id": 101, "rating": None, "watched": False, "on_watchlist": True}]
    df = films(*rows, *extra_films.get("rows", []))
    df["weight"] = compute_weights(df)
    details = {f"md|{i}": movie(f"D{i}", ["Action"], ["heist"], year=2022) for i in range(2, 10)}
    details |= {
        "md|1": movie("Kim", ["Action"], ["revenge"], year=2022),
        "md|10": movie("Bad", ["Action"], ["heist"], year=2022),
        "md|100": movie("Kim", ["Drama"], ["revenge"], year=2003, country="KR", lang="ko"),
        "md|101": movie("X", ["Drama"], ["family"], year=2010, country="KR", lang="ko"),
        "md|102": movie("Z", ["Action"], ["heist"], year=2021),
        "md|103": movie("Bad", ["Drama"], ["war"], year=1965, country="FR", lang="fr"),
        "md|104": movie("Y", ["Drama", "TV Movie"], ["family"], year=2000, country="KR", lang="ko"),
        "md|105": movie("Kim", ["Drama"], ["revenge"], year=2001, country="KR", lang="ko"),
        "rec|1": [hit(102, year=2021)],
    }
    by_lang = {("ko", False): [hit(100, year=2003), hit(101, year=2010), hit(104, avg=9.0), hit(105, votes=100),
                               hit(2, year=2022)],
               ("ko", True): [hit(100, year=2003)],
               ("fr", False): [hit(103, year=1965)]}
    return df, WorldTMDB(details, by_lang)


def test_explore_queries_cover_unexplored_buckets():
    counts = Counter({"genre:Action": 10, "lang:en": 10, "lang:fr": 1, "decade:2020s": 10})
    df, client = world()
    _, weights, details = profile_inputs(df, client, RCFG)
    facets = build_facets(details)
    queries = boxd_out.explore_queries(counts, 10, build_profile(weights, facets), facets, details,
                                       replace(CFG, decades=(1960, 2020)))
    tokens = {t for t, _ in queries}
    assert {"lang:ko", "decade:1960s", "genre:War"} <= tokens
    assert not {"lang:fr", "decade:2020s", "genre:Action"} & tokens  # fr is 10% of your films: explored
    bridged = [f for _, f in queries if "with_keywords" in f]
    assert len(bridged) == len(queries) / 2
    assert all(f["sort_by"] == "vote_average.desc" and f["vote_count.gte"] == CFG.min_votes for _, f in queries)


def test_bridged_queries_or_join_top_keywords():
    df, client = world()
    client.responses["md|1"] = movie("Kim", ["Action"], ["revenge", "twins"], year=2022)
    _, weights, details = profile_inputs(df, client, RCFG)
    facets = build_facets(details)
    queries = boxd_out.explore_queries(Counter(), 10, build_profile(weights, facets), facets, details,
                                       replace(CFG, bridge_keywords=2))
    assert {f["with_keywords"] for _, f in queries if "with_keywords" in f} <= {"0|1", "1|0"}


def test_novelty_separates_familiar_from_new():
    df, client = world()
    _, _, details = profile_inputs(df, client, RCFG)
    details |= {("movie", i): client.details(i) for i in (100, 102, 103)}
    facets = build_facets(details)
    nov = boxd_out.novelty(facets, boxd_out.exposure_keys(df), [("movie", 102), ("movie", 100), ("movie", 103)], CFG)
    assert nov[0] < 0.3 < 0.9 < min(nov[1:])


def test_recommend_ranks_bridged_novel_films_first():
    df, client = world()
    picks = boxd_out.recommend(df, client, CFG, RCFG)
    ids = list(picks["tmdb_id"])
    assert ids[0] == 100
    assert not {2, 102, 104, 105} & set(ids)  # watched, too familiar, TV movie, too few votes
    assert picks.loc[0, "reason"].startswith("Your first Korean-language film · ")
    assert "you love" in picks.loc[0, "reason"]
    assert picks.set_index("tmdb_id").loc[101, "on_watchlist"]
    assert picks.set_index("tmdb_id").loc[103, "bridge"] < 0 < picks.loc[0, "bridge"]  # Bad directed it
    assert len(boxd_out.recommend(df, client, CFG, RCFG, k=2)) == 2


def test_mmr_spreads_languages():
    df, client = world()
    client.responses["md|101"] = movie("Kim", ["Drama"], ["revenge"], year=2003, country="KR", lang="ko")
    client.by_lang[("fr", False)] = [hit(103, avg=7.9, year=1965)]
    client.responses["md|103"] = movie("Q", ["Drama"], ["revenge"], year=1965, country="FR", lang="fr")
    picks = boxd_out.recommend(df, client, CFG, RCFG, k=2, mmr_lambda=0.5)
    assert set(picks["tmdb_id"]) == {100, 103}


def test_reason_without_bridge():
    df, client = world()
    reason = boxd_out.recommend(df, client, CFG, RCFG).set_index("tmdb_id").loc[103, "reason"]
    assert reason == "Your first French-language film"


def test_empty_pool():
    df = films({"name": "A", "tmdb_id": None, "rating": 4.0})
    df["weight"] = compute_weights(df)
    picks = boxd_out.recommend(df, FakeTMDB({}), CFG, RCFG)
    assert picks.empty and list(picks.columns) == boxd_out.PICK_COLUMNS


def test_explore_leave_one_out_finds_a_novel_favorite():
    df, client = world(rows=[{"name": "Kor", "tmdb_id": 100, "rating": 5.0, "liked": True}])
    client.by_lang[("ko", False)] = [hit(100, year=2003)]
    r = explore_leave_one_out(df, client, CFG, RCFG)
    assert list(r["name"]) == ["Kor"]  # the US action favorites aren't novel
    assert r.loc[0, "in_pool"] and r.loc[0, "in_top_k"]


def test_recorded_real_run():
    import sys
    from pathlib import Path

    from conftest import BOXD_IN_FIXTURES
    sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
    from record_tmdb_fixtures import BOXD_OUT_CFG
    df = films({"name": "Heat", "tmdb_id": 949, "rating": 5.0}, {"name": "Parasite", "tmdb_id": 496243, "rating": 4.5},
               {"name": "Transformers", "tmdb_id": 1858, "rating": 1.0})
    df["weight"] = compute_weights(df)
    cfg = ExploreConfig(**BOXD_OUT_CFG)
    picks = boxd_out.recommend(df, FakeTMDB(BOXD_IN_FIXTURES), cfg, RecommendConfig(min_seeds=2))
    assert 0 < len(picks) <= 20
    assert not {949, 496243, 1858} & set(picks["tmdb_id"])
    assert (picks["novelty"] >= cfg.novelty_min).all()
    assert picks["reason"].str.match("Your first|A .* film, rare|From the|Highly rated").all()


def test_exclude_skips_films_already_shown():
    df, client = world()
    picks = boxd_out.recommend(df, client, CFG, RCFG, exclude=frozenset({100}))
    assert 100 not in set(picks["tmdb_id"]) and len(picks)
