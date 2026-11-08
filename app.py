"""Streamlit entry point: upload export ZIP -> Boxd In / Boxd Out."""

import streamlit as st

from unboxd.config import CONFIG
from unboxd.ingest import load_export
from unboxd.weights import compute_weights

st.set_page_config(page_title="Unboxd", page_icon="🎞️", layout="wide")
st.title("Unboxd")
st.caption("Upload your Letterboxd export (Settings → Import & Export → Export Your Data).")

upload = st.file_uploader("Letterboxd export ZIP", type="zip")
if not upload:
    st.stop()

films = load_export(upload.getvalue())
films["weight"] = compute_weights(films, CONFIG.weights)
watched = films[films["watched"]]
st.write(f"{len(watched)} films watched, {int(watched['rating'].notna().sum())} rated, "
         f"{int(films['on_watchlist'].sum())} on watchlist.")

boxd_in, boxd_out, data = st.tabs(["Boxd In", "Boxd Out", "Your data"])

with boxd_in:
    st.info("Comfort picks: coming soon (unboxd/boxd_in.py).")

with boxd_out:
    st.info("Edge-of-taste picks: coming soon (unboxd/boxd_out.py).")

with data:
    st.dataframe(watched.sort_values("weight", ascending=False), use_container_width=True)

st.caption("This product uses the TMDB API but is not endorsed or certified by TMDB.")
