import io
import zipfile

import pandas as pd

from unboxd.ingest import load_export


def _zip(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


EXPORT = _zip({
    "watched.csv": "Date,Name,Year,Letterboxd URI\n"
                   "2024-01-01,In the Mood for Love,2000,https://boxd.it/a\n"
                   "2024-01-02,Heat,1995,https://boxd.it/b\n"
                   "2024-01-03,Tokyo Story,1953,https://boxd.it/c\n",
    "ratings.csv": "Date,Name,Year,Letterboxd URI,Rating\n"
                   "2024-01-01,In the Mood for Love,2000,https://boxd.it/a,5\n"
                   "2024-01-02,Heat,1995,https://boxd.it/b,3.5\n",
    "diary.csv": "Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date\n"
                 "2024-01-01,In the Mood for Love,2000,https://boxd.it/x1,5,,,2023-12-31\n"
                 "2024-06-01,In the Mood for Love,2000,https://boxd.it/x2,5,Yes,,2024-06-01\n",
    "likes/films.csv": "Date,Name,Year,Letterboxd URI\n"
                       "2024-01-01,In the Mood for Love,2000,https://boxd.it/a\n",
    "watchlist.csv": "Date,Name,Year,Letterboxd URI\n"
                     "2024-02-01,Stalker,1979,https://boxd.it/d\n",
})


def test_load_export():
    films = load_export(EXPORT).set_index("name")
    assert len(films) == 4
    itmfl = films.loc["In the Mood for Love"]
    assert itmfl["rating"] == 5 and itmfl["liked"] and itmfl["rewatch_count"] == 1
    assert itmfl["last_watched"] == pd.Timestamp("2024-06-01")
    assert pd.isna(films.loc["Tokyo Story", "rating"])
    assert films.loc["Stalker", "on_watchlist"] and not films.loc["Stalker", "watched"]
