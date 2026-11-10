import pandas as pd
import pytest
import requests

from conftest import FakeTMDB
from unboxd.config import MatchConfig
from unboxd.resolve import (MATCH_COLUMNS, match_film, normalize_title, rank_candidates, resolve_films,
                            title_brief, title_similarity, year_factor)
from unboxd.tmdb import TMDBAuthError


def cand(id, title, year, votes=100, original=None):
    return {"id": id, "title": title, "original_title": original or title,
            "release_date": f"{year}-06-01" if year else "", "vote_count": votes}


def test_normalize_title():
    assert normalize_title("Amélie") == "amelie"
    assert normalize_title("Mission: Impossible") == "mission impossible"
    assert normalize_title("Fast & Furious") == "fast and furious"
    assert normalize_title("The Thing") == "thing"
    assert normalize_title("  A   Ghost Story ") == "ghost story"


def test_title_similarity_uses_original_title():
    c = cand(1, "Chungking Express", 1994, original="重慶森林")
    assert title_similarity(normalize_title("重慶森林"), c) == 1.0


def test_year_factor():
    cfg = MatchConfig()
    assert year_factor(1995, 1995, cfg) == 1.0
    assert year_factor(1995, 1996, cfg) == cfg.year_factors[1]
    assert year_factor(1995, 2010, cfg) == cfg.far_year
    assert year_factor(None, 1995, cfg) == cfg.unknown_year


@pytest.mark.parametrize("name, year, tmdb_id", [
    ("Heat", 1995, 949),
    ("Suspiria", 1977, 11906),
    ("Suspiria", 2018, 361292),
    ("Parasite", 2019, 496243),
    ("Crash", 1996, 884),
    ("Solaris", 2002, 2103),
    ("Amélie", 2001, 194),
    ("La Jetée", 1962, 662),
    ("Mission: Impossible", 1996, 954),
])
def test_real_films_match_high(fake_tmdb, name, year, tmdb_id):
    r = match_film(name, year, fake_tmdb)
    assert (r["tmdb_id"], r["match_confidence"]) == (tmdb_id, "high")


def test_festival_year_finds_film_but_flags_it(fake_tmdb):
    r = match_film("Crash", 2004, fake_tmdb)  # TMDB primary release is 2005
    assert (r["tmdb_id"], r["match_confidence"], r["match_reason"]) == (1640, "low", "Year differs by 1")


def test_no_results(fake_tmdb):
    r = match_film("Zzqx Nonexistent Film", 2020, fake_tmdb)
    assert (r["tmdb_id"], r["match_confidence"], r["match_reason"]) == (None, "none", "No results")


def test_namesakes_in_same_year_are_low():
    client = FakeTMDB({"Twin|2010": [cand(1, "Twin", 2010, votes=500), cand(2, "Twin", 2010, votes=400)]})
    r = match_film("Twin", 2010, client)
    assert (r["tmdb_id"], r["match_confidence"], r["match_reason"]) == (1, "low", "2 titles share this name")


def test_famous_film_beats_obscure_namesake():
    client = FakeTMDB({"Twin|2010": [cand(2, "Twin", 2010, votes=1), cand(1, "Twin", 2010, votes=20000)]})
    r = match_film("Twin", 2010, client)
    assert (r["tmdb_id"], r["match_confidence"]) == (1, "high")


def test_weak_title_is_none_but_keeps_candidates():
    client = FakeTMDB({"Blue|2000": [cand(1, "Completely Different", 2000)]})
    r = match_film("Blue", 2000, client)
    assert (r["match_confidence"], r["match_reason"]) == ("none", "No close title match")
    assert [c["id"] for c in r["candidates"]] == [1]


def searches(client):
    return [c for c in client.calls if c[0] != "tvd"]


def test_round_one_searches_films_and_tv_with_year_and_stops(fake_tmdb):
    match_film("Heat", 1995, fake_tmdb)
    assert sorted(searches(fake_tmdb), key=str) == [("Heat", 1995), ("tv", "Heat", 1995)]


def test_search_falls_back_to_no_year():
    client = FakeTMDB({"Old Film|None": [cand(1, "Old Film", 1958)]})
    r = match_film("Old Film", 1960, client)
    assert searches(client) == [("tv", "Old Film", 1960), ("Old Film", 1960),
                                ("tv", "Old Film", None), ("Old Film", None)]
    assert (r["tmdb_id"], r["match_confidence"], r["match_reason"]) == (1, "low", "Year differs by 2")


def test_missing_year_searches_once_without_year(fake_tmdb):
    match_film("Heat", None, fake_tmdb)
    assert searches(fake_tmdb) == [("tv", "Heat", None), ("Heat", None)]


def films(*rows):
    return pd.DataFrame(rows, columns=["name", "year"]).astype({"year": "Int64"})


def test_resolve_films_shape_and_order(fake_tmdb):
    df = films(("Solaris", 1972), ("Zzqx Nonexistent Film", 2020), ("Heat", 1995), ("Heat", None))
    out = resolve_films(df, fake_tmdb)
    assert list(out["name"]) == list(df["name"])
    assert set(MATCH_COLUMNS) <= set(out.columns)
    assert str(out["tmdb_id"].dtype) == "Int64" and str(out["tmdb_year"].dtype) == "Int64"
    assert list(out["tmdb_id"].astype(object).where(out["tmdb_id"].notna(), None)) == [593, None, 949, 949]
    for row in out.itertuples():
        assert len(row.candidates) <= MatchConfig().max_candidates
        assert row.tmdb_id not in [c["id"] for c in row.candidates]


def test_one_failed_lookup_does_not_break_batch(fake_tmdb):
    fake_tmdb.fail, fake_tmdb.error = {"Heat"}, requests.ConnectionError()
    out = resolve_films(films(("Heat", 1995), ("Solaris", 1972)), fake_tmdb)
    assert out["match_reason"].iloc[0] == "Lookup failed"
    assert out["match_confidence"].iloc[1] == "high" and pd.isna(out["match_reason"].iloc[1])


def test_auth_error_aborts_batch(fake_tmdb):
    fake_tmdb.fail, fake_tmdb.error = {"Heat"}, TMDBAuthError("bad token")
    with pytest.raises(TMDBAuthError):
        resolve_films(films(("Heat", 1995), ("Solaris", 1972)), fake_tmdb)


def test_empty_batch(fake_tmdb):
    out = resolve_films(films(), fake_tmdb)
    assert out.empty and set(MATCH_COLUMNS) <= set(out.columns)


@pytest.mark.live
def test_live_tmdb():
    from unboxd.tmdb import TMDBClient
    out = resolve_films(films(("Heat", 1995), ("Suspiria", 2018), ("Parasite", 2019),
                              ("In the Mood for Love", 2000), ("Tokyo Story", 1953)), TMDBClient())
    assert (out["match_confidence"] == "high").all()
    assert list(out["tmdb_id"])[:3] == [949, 361292, 496243]


def test_partial_title_is_not_a_match():
    client = FakeTMDB({"The Penguin|2024": [cand(1, "The Magic Penguin", 2024)]})
    r = match_film("The Penguin", 2024, client)
    assert (r["tmdb_id"], r["match_confidence"], r["match_reason"]) == (None, "none", "No close title match")


def test_same_title_far_year_is_a_different_film():
    client = FakeTMDB({"Watchmen|None": [cand(1, "Watchmen", 2009, votes=10000)]})
    r = match_film("Watchmen", 2019, client)
    assert (r["tmdb_id"], r["match_confidence"], r["match_reason"]) == (None, "none", "No match near 2019")
    assert r["candidates"][0]["id"] == 1


def test_year_off_by_one_with_clear_margin_is_high():
    client = FakeTMDB({"Perfect Blue|1997": [cand(1, "Perfect Blue", 1998, votes=5000)]})
    assert match_film("Perfect Blue", 1997, client)["match_confidence"] == "high"


@pytest.mark.parametrize("name, year, tmdb_id, media_type", [
    ("The Penguin", 2024, 194764, "tv"),
    ("Secret Invasion", 2023, 114472, "tv"),
    ("Watchmen", 2019, 79788, "tv"),
    ("Samuel", 2024, 248664, "tv"),  # beats an exact-title film from 2022
    ("Possible Love", 2026, 1483525, "movie"),  # an ongoing series with the same name is ignored
])
def test_films_and_limited_series(fake_tmdb, name, year, tmdb_id, media_type):
    r = match_film(name, year, fake_tmdb)
    assert (r["tmdb_id"], r["media_type"], r["match_confidence"]) == (tmdb_id, media_type, "high")


def test_multi_season_series_is_ignored(fake_tmdb):
    assert match_film("Breaking Bad", 2008, fake_tmdb)["media_type"] != "tv"


def test_no_film_and_no_tv_is_none():
    client = FakeTMDB({"Watchmen|None": [cand(1, "Watchmen", 2009, votes=10000)]})
    r = match_film("Watchmen", 2019, client)
    assert (r["match_confidence"], r["match_reason"], r["media_type"]) == ("none", "No match near 2019", None)


def test_tv_details_only_fetched_for_close_titles():
    tv = {"id": 7, "name": "Something Else Entirely", "first_air_date": "2020-01-01", "vote_count": 5}
    client = FakeTMDB({"tv|Blue|2020": [tv]})
    match_film("Blue", 2020, client)
    assert ("tvd", 7) not in client.calls


@pytest.mark.parametrize("name, year", [("Crash", 2004), ("Heat", 1995), ("The Penguin", 2024), ("Samuel", 2024)])
def test_rank_candidates_agrees_with_matching(fake_tmdb, name, year):
    ranked = rank_candidates(name, year, fake_tmdb)
    best = match_film(name, year, fake_tmdb)
    assert (ranked[0]["id"], ranked[0]["media_type"]) == (best["tmdb_id"], best["media_type"])
    assert set(ranked[0]) == {"id", "title", "year", "poster_path", "media_type"}


def test_rank_candidates_caps_results():
    client = FakeTMDB({"Twin|None": [cand(i, "Twin", 2000 + i) for i in range(15)]})
    assert len(rank_candidates("Twin", None, client)) == 10


def test_title_brief():
    client = FakeTMDB({"md|7": {"id": 7, "title": "Heat", "release_date": "1995-12-15", "poster_path": "/h.jpg"},
                       "tvd|9": {"id": 9, "name": "The Penguin", "first_air_date": "2024-09-19"}})
    assert title_brief("movie", 7, client) == {"id": 7, "title": "Heat", "year": 1995, "poster_path": "/h.jpg",
                                               "media_type": "movie"}
    assert title_brief("tv", 9, client)["title"] == "The Penguin" and title_brief("tv", 9, client)["media_type"] == "tv"
    assert title_brief("movie", 404, client) is None
