import numpy as np

from conftest import movie
from unboxd.features import build_facets
from unboxd.profile import build_profile, similarity

EQUAL = {"people": 1, "form": 1, "place": 1, "theme": 1}
LIKED, DISLIKED, LIKE_LIKED, LIKE_DISLIKED = ("movie", 1), ("movie", 2), ("movie", 3), ("movie", 4)
FACETS = build_facets({
    LIKED: movie("Wes Anderson", ["Comedy"], ["quirky"]),
    DISLIKED: movie("Michael Bay", ["Action"], ["explosion"]),
    LIKE_LIKED: movie("Wes Anderson", ["Comedy"], ["quirky"]),
    LIKE_DISLIKED: movie("Michael Bay", ["Action"], ["explosion"]),
})


def test_single_liked_film_matches_itself():
    sim = similarity(build_profile({LIKED: 0.9}, FACETS), FACETS, [LIKE_LIKED], EQUAL)
    assert np.isclose(sim.loc[[LIKE_LIKED], "total"].iloc[0], 1.0)


def test_dislike_lowers_similarity():
    without = similarity(build_profile({LIKED: 0.9}, FACETS), FACETS, [LIKE_DISLIKED], EQUAL)["total"].iloc[0]
    sim = similarity(build_profile({LIKED: 0.9, DISLIKED: -0.4}, FACETS), FACETS, [LIKE_LIKED, LIKE_DISLIKED], EQUAL)
    liked, disliked = sim["total"]
    assert liked > disliked and disliked < without


def test_no_usable_weights():
    sim = similarity(build_profile({LIKED: float("nan"), ("movie", 99): 0.5}, FACETS), FACETS, [LIKE_LIKED], EQUAL)
    assert (sim["total"] == 0).all()
