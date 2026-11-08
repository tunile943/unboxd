import numpy as np
import pandas as pd

from unboxd.config import WeightConfig
from unboxd.weights import compute_weights

NO_SHRINK = WeightConfig(gamma=1.0, neg_damp=1.0, min_ratings=0)


def _films(ratings, liked=None, rewatch=None):
    n = len(ratings)
    return pd.DataFrame({
        "rating": ratings,
        "liked": liked or [False] * n,
        "rewatch_count": rewatch or [0] * n,
        "watched": [True] * n,
    })


def test_midrank_is_symmetric():
    w = compute_weights(_films([1.0, 2.0, 3.0, 4.0]), NO_SHRINK)
    assert np.allclose(w, [-0.75, -0.25, 0.25, 0.75])


def test_ties_share_midrank():
    w = compute_weights(_films([3.0, 3.0, 5.0, 1.0]), NO_SHRINK)
    assert w[0] == w[1] == 0.0


def test_liked_breaks_ties():
    w = compute_weights(_films([4.0, 4.0], liked=[True, False]), NO_SHRINK)
    assert w[0] > w[1]


def test_shrink_and_damp():
    cfg = WeightConfig(gamma=2.0, neg_damp=0.5, min_ratings=0)
    w = compute_weights(_films([1.0, 2.0, 3.0, 4.0]), cfg)
    assert np.allclose(w, [-0.5625 * 0.5, -0.0625 * 0.5, 0.0625, 0.5625])


def test_unrated_and_unwatched():
    films = _films([4.0, np.nan, np.nan])
    films.loc[2, "watched"] = False
    w = compute_weights(films, WeightConfig(unrated_weight=0.1))
    assert w[1] == 0.1
    assert np.isnan(w[2])


def test_invariant_to_rating_curve():
    harsh = compute_weights(_films([1.0, 1.5, 2.0, 2.5]), NO_SHRINK)
    generous = compute_weights(_films([3.5, 4.0, 4.5, 5.0]), NO_SHRINK)
    assert np.allclose(harsh, generous)
