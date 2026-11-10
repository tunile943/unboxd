from dataclasses import replace

import pandas as pd

from conftest import movie
from unboxd.config import RecommendConfig
from unboxd.quality import bayesian_rating, franchise_opinions, franchise_penalty, prior_strength

CFG = RecommendConfig()


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


def test_bayesian_rating():
    avg, votes = pd.Series([8.5, 9.0, 6.0]), pd.Series([40000, 20, 40000])
    r = bayesian_rating(avg, votes, m=500)
    assert abs(r[0] - 8.5) < 0.05 and r[1] < 7.5 and abs(r[2] - 6.0) < 0.05  # few votes -> pulled to the mean


def test_new_releases_get_a_stronger_prior():
    released = pd.Series(["2025-12-01", "2020-01-01"])
    m = prior_strength(released, replace(CFG, new_release_m_mult=2), 500, today="2026-01-01")
    assert list(m) == [1000, 500]
    r = bayesian_rating(pd.Series([9.0, 9.0, 7.0]), pd.Series([600, 600, 100000]), pd.concat([m, pd.Series([500])],
                                                                                          ignore_index=True))
    assert r[0] < r[1]  # same votes and average, but the new one is trusted less
