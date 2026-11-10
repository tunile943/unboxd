import numpy as np

from unboxd.diversify import mmr


def test_mmr_ignores_the_scale_of_relevance():
    sim = np.array([[1, .9, .1], [.9, 1, .1], [.1, .1, 1]])
    rel = np.array([.72, .70, .69])  # rescaled: 1, .33, 0; the near-duplicate loses to the different film
    assert mmr(rel, sim, 3, .7) == mmr(rel * 10 + 5, sim, 3, .7) == [0, 2, 1]


def test_mmr_without_diversity_keeps_the_ranking():
    sim = np.ones((3, 3))
    assert mmr(np.array([.2, .9, .5]), sim, 3, 1.0) == [1, 2, 0]
    assert mmr(np.array([.5, .5]), np.eye(2), 2, .7) == [0, 1]  # flat scores don't divide by zero
