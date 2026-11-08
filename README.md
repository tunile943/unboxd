# Unboxd

A personal, non-commercial Letterboxd recommender. Upload your Letterboxd export ZIP and get two lists:

- **Boxd In**: comfort picks, more of what you already love.
- **Boxd Out**: well-rated films at the edge of your taste.

Data comes from your own export (Settings → Import & Export → Export Your Data) plus TMDB metadata.

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env   # add your TMDB read token
streamlit run app.py
pytest
```

## Pipeline

| Stage | Module | Status |
|---|---|---|
| Parse export ZIP → one row per film | `unboxd/ingest.py` | done |
| Per-film weight w' in [-1, 1] | `unboxd/weights.py` | done |
| TMDB client + SQLite cache | `unboxd/tmdb.py` | done (thin) |
| Title/year → TMDB id, confidence flag | `unboxd/resolve.py` | TODO |
| Facet vectors (people / form / place / theme) | `unboxd/features.py` | TODO |
| Taste profile per facet | `unboxd/profile.py` | TODO |
| Boxd In (exploit) | `unboxd/boxd_in.py` | TODO |
| Boxd Out (explore) | `unboxd/boxd_out.py` | TODO |
| MMR diversification | `unboxd/diversify.py` | TODO |
| Holdout evaluation | `unboxd/evaluate.py` | TODO |

Tunables (γ, λ, explore band, Bayesian m, ...) live in `unboxd/config.py`.

### Weighting

1. Order films by rating, breaking ties by liked, then rewatch count.
2. Midrank percentile: `p = (below + 0.5·equal) / n`
3. Scale: `w = 2p − 1`
4. Shrink the middle: `w' = sign(w)·|w|^γ` (γ ≈ 2)
5. Dampen dislikes: negatives × λ (λ ≈ 0.5)

Watched-but-unrated films get a fixed small weight. With fewer than `min_ratings` ratings, the percentile weight is blended with a mean-centered weight.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
