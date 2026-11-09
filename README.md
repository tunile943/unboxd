# Unboxd

A personal, non-commercial Letterboxd recommender. Upload your Letterboxd export ZIP and get two lists:

- **Boxd In**: comfort picks, more of what you already love.
- **Boxd Out**: well-rated films at the edge of your taste.

Data comes from your own export (Settings → Import & Export → Export Your Data) plus TMDB metadata.

## Architecture

```
Browser (Next.js, app/ + lib/)
  unzip export locally (JSZip) → send only watched/ratings/diary/likes/watchlist CSVs
        │
        ▼
Vercel Python function (FastAPI, api/index.py), stateless
  /api/films      parse CSVs + weights
  /api/resolve    match films to TMDB ids, ≤100 per batch (300s Hobby limit)
  /api/recommend  mode=in | out
        │
        ▼
TMDB API ── cache: Upstash Redis in production, SQLite locally (unboxd/cache.py)
```

The raw ZIP and `reviews.csv` never leave the browser, and the API stores nothing.

## Setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
npm install
cp .env.example .env   # add your TMDB read token
npm run dev            # Next.js on :3000, FastAPI on :8000 (proxied at /api)
pytest                 # add -m live to also hit the real TMDB API
```

Check matching on a real export: `python scripts/match_report.py <export.zip>`. Check Boxd In: `python scripts/recommend_report.py <export.zip> --loo`. Refresh test fixtures: `python scripts/record_tmdb_fixtures.py`.

API docs while running locally: http://localhost:8000/api/docs

## Deploy (Vercel)

1. Import the repo at vercel.com/new. The framework is set to Next.js in `vercel.json`.
2. Add the `TMDB_READ_TOKEN` environment variable.
3. Optional: add Upstash Redis from the Vercel Marketplace. It sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`, which `unboxd/cache.py` picks up.

Python dependencies for the function come from `requirements.txt` (keep it in sync with `pyproject.toml`). The Python version is pinned in `.python-version`.

## Pipeline

| Stage | Module | Status |
|---|---|---|
| Unzip export in browser, send only needed CSVs | `lib/export.ts` | done |
| Parse CSVs → one row per film | `unboxd/ingest.py` | done |
| Per-film weight w' in [-1, 1] | `unboxd/weights.py` | done |
| API: `/api/films` | `api/index.py` | done |
| API: `/api/resolve` (batched TMDB matching) | `api/index.py`, `lib/export.ts` | done |
| API: `/api/recommend` (Boxd In) | `api/index.py`, `lib/export.ts` | done (Boxd Out: 501) |
| TMDB client + swappable cache (Redis / SQLite) | `unboxd/tmdb.py`, `unboxd/cache.py` | done |
| Title/year → TMDB id (movie, or TV series as fallback), confidence, reason, alternatives | `unboxd/resolve.py` | done |
| Facet vectors (people / form / place / theme) | `unboxd/features.py` | done |
| Taste profile per facet | `unboxd/profile.py` | done |
| Boxd In (exploit) | `unboxd/boxd_in.py` | done |
| Boxd Out (explore) | `unboxd/boxd_out.py` | TODO |
| MMR diversification | `unboxd/diversify.py` | done |
| Leave-one-out evaluation | `unboxd/evaluate.py` | done |

Tunables (γ, λ, explore band, Bayesian m, ...) live in `unboxd/config.py`.

### Boxd In

TMDB recommendations of your top-rated films (top 15% by w′, ties included, 10–100 seeds) plus `/discover`
results for your profile's favorite directors and keywords nominate candidates. Watched, unreleased and
low-vote (< 50) films are dropped. Candidates are ranked by similarity to your taste profile, minus a
penalty for TMDB collections you dislike on balance (average w′ ≤ −0.10, so mixed franchises aren't
penalized), then diversified with MMR. Anti-seeds (penalizing films your least-liked films recommend) are implemented
but off by default: in leave-one-out they didn't help, since dislikes already lower profile similarity.

### Weighting

1. Order films by rating, breaking ties by liked, then rewatch count.
2. Midrank percentile: `p = (below + 0.5·equal) / n`
3. Scale: `w = 2p − 1`
4. Shrink the middle: `w' = sign(w)·|w|^γ` (γ ≈ 2)
5. Dampen dislikes: negatives × λ (λ ≈ 0.5)

Watched-but-unrated films get a fixed small weight. With fewer than `min_ratings` ratings, the percentile weight is blended with a mean-centered weight.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
