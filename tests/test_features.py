import numpy as np

from conftest import movie
from unboxd.features import build_facets, facet_tokens, item_similarity


def test_movie_tokens():
    d = movie("Michael Mann", ["Crime"], ["heist"], cast=list("ABCDEFG"), year=1995)
    d["credits"]["crew"].append({"id": 2, "name": "Dante Spinotti", "job": "Director of Photography"})
    t = facet_tokens(d, "movie")
    assert t["people"] == ["director:Michael Mann", "dop:Dante Spinotti",
                           "cast:A", "cast:B", "cast:C", "cast:D", "cast:E"]
    assert t["form"] == ["genre:Crime", "decade:1990s"]
    assert t["place"] == ["country:US", "lang:en"]
    assert t["theme"] == ["kw:heist"]


def test_cast_follows_billing_order():
    d = movie(cast=["X"])
    d["credits"]["cast"] = [{"name": "Second", "order": 1}, {"name": "First", "order": 0}]
    assert facet_tokens(d, "movie")["people"][:2] == ["cast:First", "cast:Second"]


def test_tv_tokens():
    d = {"created_by": [{"id": 9, "name": "Lauren LeFranc"}], "first_air_date": "2024-09-19",
         "genres": [{"name": "Sci-Fi & Fantasy"}, {"name": "Crime"}],
         "aggregate_credits": {"crew": [{"name": "Darran Tiernan", "jobs": [{"job": "Director of Photography"}]}],
                               "cast": [{"name": "Colin Farrell", "order": 0}]},
         "keywords": {"results": [{"id": 1, "name": "gangster"}]},
         "origin_country": ["US"], "original_language": "en"}
    t = facet_tokens(d, "tv")
    assert t["people"] == ["director:Lauren LeFranc", "dop:Darran Tiernan", "cast:Colin Farrell"]
    assert t["form"] == ["genre:Science Fiction", "genre:Fantasy", "genre:Crime", "decade:2020s"]
    assert t["theme"] == ["kw:gangster"]


def test_build_facets_rows_are_normalized():
    f = build_facets({("movie", 1): movie("A", ["Drama"], ["x"]), ("movie", 2): movie("B", ["Comedy"], ["y", "z"])})
    for m in f.matrices.values():
        assert np.allclose(np.linalg.norm(m.toarray(), axis=1), 1.0)
    assert f.index[("movie", 2)] == 1


def test_empty_facet_does_not_crash():
    f = build_facets({("movie", 1): movie(), ("movie", 2): movie()})
    assert f.matrices["theme"].shape == (2, 0)


def test_item_similarity():
    f = build_facets({("movie", 1): movie("A", ["Drama"], ["x"]), ("movie", 2): movie("A", ["Drama"], ["x"]),
                      ("movie", 3): movie("B", ["Comedy"], ["y"], country="FR", lang="fr")})
    sim = item_similarity(f, [("movie", 1), ("movie", 2), ("movie", 3)], {"people": 1, "form": 1, "place": 1, "theme": 1})
    assert np.isclose(sim[0, 1], 1.0) and sim[0, 2] < 0.1


def test_meta_keywords_are_not_themes():
    from conftest import movie
    from unboxd.features import facet_tokens
    tokens = facet_tokens(movie(keywords=["heist", "aftercreditsstinger", "woman director"]), "movie")
    assert tokens["theme"] == ["kw:heist"]


def test_build_facets_can_drop_tokens():
    details = {("movie", 1): movie(genres=["Drama"], year=2015), ("movie", 2): movie(genres=["Drama"], year=1995)}
    assert build_facets(details).vocab["form"] == ["decade:1990s", "decade:2010s", "genre:Drama"]
    assert build_facets(details, ("decade:",)).vocab["form"] == ["genre:Drama"]
