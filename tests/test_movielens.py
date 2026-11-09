import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from movielens_eval import load_users  # noqa: E402


def write(tmp_path, n_users=4):
    (tmp_path / "movies.csv").write_text(
        "movieId,title,genres\n"
        '1,"Seven (a.k.a. Se7en) (1995)",Thriller\n'
        "2,Heat (1995),Crime\n"
        "3,No Link (2001),Drama\n"
        "4,Untitled,Drama\n")
    (tmp_path / "links.csv").write_text("movieId,imdbId,tmdbId\n1,1,807\n2,2,949\n3,3,\n4,4,99\n")
    rows = ["userId,movieId,rating,timestamp"]
    for u in range(1, n_users + 1):
        rows += [f"{u},{m},{r},964982703" for m, r in ((1, 5.0), (2, 3.5), (3, 4.0), (4, 2.0))[:u]]
    (tmp_path / "ratings.csv").write_text("\n".join(rows) + "\n")


def test_load_users(tmp_path):
    write(tmp_path)
    users = load_users(tmp_path, "tune", min_ratings=2, max_ratings=3, n=10) | load_users(
        tmp_path, "test", min_ratings=2, max_ratings=3, n=10)
    assert sorted(users) == [2, 3, 4]  # user 1 has too few (user 4's unlinked film doesn't count)
    films = users[4]
    assert list(films["name"]) == ["Seven (a.k.a. Se7en)", "Heat", "Untitled"]
    assert list(films["year"].astype(object).where(films["year"].notna(), None)) == [1995, 1995, None]
    assert list(films["tmdb_id"]) == [807, 949, 99]
    assert films["weight"].iloc[0] > 0 > films["weight"].iloc[2]


def test_splits_are_fixed_and_disjoint(tmp_path):
    write(tmp_path)
    tune = load_users(tmp_path, "tune", min_ratings=1, max_ratings=4)
    test = load_users(tmp_path, "test", min_ratings=1, max_ratings=4)
    assert len(tune) == len(test) == 2 and not set(tune) & set(test)
    assert sorted(tune) == sorted(load_users(tmp_path, "tune", min_ratings=1, max_ratings=4))
