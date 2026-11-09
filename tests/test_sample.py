"""The sample diary in public/sample/ matches what app/SampleLabel.tsx says about it."""
from pathlib import Path

from unboxd.ingest import EXPORT_FILES, load_csvs
from unboxd.weights import compute_weights

SAMPLE = Path(__file__).parent.parent / "public" / "sample"


def test_sample_diary():
    films = load_csvs({f: (SAMPLE / f).read_text() for f in EXPORT_FILES})
    films["weight"] = compute_weights(films)
    watched = films[films["watched"]]
    assert (len(watched), watched["rating"].notna().sum(), films["liked"].sum(), films["on_watchlist"].sum()) == (
        51, 47, 12, 12)
    assert films.set_index("name")["rewatch_count"].to_dict()["Spider-Man: Into the Spider-Verse"] == 2
    w = films.set_index("name")["weight"]
    assert w["Arrival"] > w["Knives Out"] > w["Tenet"] > w["Morbius"]
    assert (films["last_watched"].dropna() <= "2026-11-01").all()
