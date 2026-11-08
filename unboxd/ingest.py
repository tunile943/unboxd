"""Parse a Letterboxd export ZIP into one row per film.

Export files used (column names as Letterboxd writes them):
  watched.csv       Date, Name, Year, Letterboxd URI
  ratings.csv       Date, Name, Year, Letterboxd URI, Rating
  diary.csv         Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date
  likes/films.csv   Date, Name, Year, Letterboxd URI
  watchlist.csv     Date, Name, Year, Letterboxd URI

Films are keyed on (Name, Year). The URI is not a reliable join key: in
diary.csv it points to the log entry, not the film.

In production the browser unzips the export and sends only the files in
EXPORT_FILES as text, so `load_csvs` is the main entry point; `load_export`
(ZIP) is kept for local use and tests.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path
from typing import BinaryIO

import pandas as pd

KEY = ["name", "year"]
EXPORT_FILES = ("watched.csv", "ratings.csv", "diary.csv", "likes/films.csv", "watchlist.csv")


def _read_csv(files: dict[str, str], member: str) -> pd.DataFrame:
    text = files.get(member)
    if not text or not text.strip():
        return pd.DataFrame(columns=["Name", "Year"])
    return pd.read_csv(io.StringIO(text))


def _normalize(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={"Name": "name", "Year": "year"})
    df["name"] = df["name"].astype(str).str.strip()
    df["year"] = pd.to_numeric(df["year"], errors="coerce").astype("Int64")
    return df


def load_export(source: str | Path | BinaryIO | bytes) -> pd.DataFrame:
    """Parse an export ZIP. See `load_csvs` for the output columns."""
    if isinstance(source, bytes):
        source = io.BytesIO(source)
    with zipfile.ZipFile(source) as zf:
        names = {n.lower(): n for n in zf.namelist()}
        files = {m: zf.read(names[m]).decode("utf-8")
                 for m in EXPORT_FILES if m in names}
    return load_csvs(files)


def load_csvs(files: dict[str, str]) -> pd.DataFrame:
    """Return a DataFrame with one row per film, from {export path: CSV text}.

    Columns: name, year, rating (float, NaN if unrated), liked (bool),
    rewatch_count (int), on_watchlist (bool), watched (bool),
    last_watched (Timestamp, NaT if no diary entry).
    """
    files = {k.lower(): v for k, v in files.items()}
    watched = _normalize(_read_csv(files, "watched.csv"))
    ratings = _normalize(_read_csv(files, "ratings.csv"))
    diary = _normalize(_read_csv(files, "diary.csv"))
    likes = _normalize(_read_csv(files, "likes/films.csv"))
    watchlist = _normalize(_read_csv(files, "watchlist.csv"))

    films = pd.concat([watched[KEY], ratings[KEY], diary[KEY]]).drop_duplicates(KEY)

    if "Rating" in ratings:
        r = ratings[KEY + ["Rating"]].drop_duplicates(KEY, keep="last")
        films = films.merge(r.rename(columns={"Rating": "rating"}), on=KEY, how="left")
    else:
        films["rating"] = float("nan")

    if len(diary) and "Rewatch" in diary:
        rewatch = (
            diary.assign(_rw=diary["Rewatch"].astype(str).str.lower().eq("yes"))
            .groupby(KEY)["_rw"].sum().rename("rewatch_count").reset_index()
        )
        films = films.merge(rewatch, on=KEY, how="left")
    if len(diary) and "Watched Date" in diary:
        last = (
            diary.assign(_d=pd.to_datetime(diary["Watched Date"], errors="coerce"))
            .groupby(KEY)["_d"].max().rename("last_watched").reset_index()
        )
        films = films.merge(last, on=KEY, how="left")

    films["rewatch_count"] = films.get("rewatch_count", 0)
    films["rewatch_count"] = films["rewatch_count"].fillna(0).astype(int)
    if "last_watched" not in films:
        films["last_watched"] = pd.NaT

    liked_keys = set(map(tuple, likes[KEY].itertuples(index=False)))
    films["liked"] = [k in liked_keys for k in films[KEY].itertuples(index=False)]
    films["watched"] = True

    wl = watchlist[KEY].drop_duplicates()
    wl = wl[~wl.set_index(KEY).index.isin(films.set_index(KEY).index)]
    wl = wl.assign(rating=float("nan"), rewatch_count=0, liked=False,
                   watched=False, last_watched=pd.NaT)
    films = pd.concat([films, wl], ignore_index=True)
    watchlist_keys = set(map(tuple, watchlist[KEY].itertuples(index=False)))
    films["on_watchlist"] = [k in watchlist_keys for k in films[KEY].itertuples(index=False)]

    return films.reset_index(drop=True)
