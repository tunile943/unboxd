# Unboxd

A personal, non-commercial Letterboxd recommender. Upload your Letterboxd export ZIP and get two lists:

- **Boxd In**: comfort picks, more of what you already love.
- **Boxd Out**: highly rated films beyond the genres and styles you've rated.

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

Check matching on a real export: `python scripts/match_report.py <export.zip>`. Check Boxd In and Boxd Out: `python scripts/recommend_report.py <export.zip> --out --loo`. Refresh test fixtures: `python scripts/record_tmdb_fixtures.py`.

The "Try with sample data" button loads a hand-written demo diary from `public/sample/` (described in `app/components/SampleLabel.tsx`; `tests/test_sample.py` keeps the two in sync).

Frontend tests: `npm run test:e2e` (Playwright; the API is mocked from `e2e/fixtures/sample-api.json`, re-recorded with `python scripts/record_e2e_fixtures.py`). CI (`.github/workflows/ci.yml`) runs pytest, pyflakes, `next build` and Playwright on every push.

Wider check across many users: download [MovieLens ml-latest-small](https://grouplens.org/datasets/movielens/latest/)
(GroupLens, University of Minnesota; not redistributable) into `data/movielens/`, then run
`python scripts/movielens_eval.py data/movielens/ml-latest-small --split tune --compare`. Users are split once into
fixed `tune` and `test` halves: compare settings on `tune`, and confirm the final choice on `test`.

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
| API: `/api/recommend` (Boxd In / Boxd Out) | `api/index.py`, `lib/export.ts` | done |
| TMDB client + swappable cache (Redis / SQLite) | `unboxd/tmdb.py`, `unboxd/cache.py` | done |
| Title/year → TMDB id (movie, or TV series as fallback), confidence, reason, alternatives | `unboxd/resolve.py` | done |
| Facet vectors (people / form / place / theme) | `unboxd/features.py` | done |
| Taste profile per facet | `unboxd/profile.py` | done |
| Candidates shared by both modes (seeds, TMDB lookups, filters) | `unboxd/candidates.py` | done |
| Bayesian rating, franchise penalty | `unboxd/quality.py` | done |
| Boxd In (exploit) | `unboxd/boxd_in.py` | done |
| Boxd Out (explore) | `unboxd/boxd_out.py` | done |
| MMR diversification | `unboxd/diversify.py` | done |
| Leave-one-out evaluation | `unboxd/evaluate.py` | done |

Tunables (γ, λ, facet weights, Bayesian m, ...) live in `unboxd/config.py`.

### Boxd In

TMDB recommendations of your top-rated films (top 15% by w′, ties included, 10–100 seeds) plus `/discover`
results for your profile's favorite directors and keywords nominate candidates. Watched, unreleased and
low-vote (< 300) films are dropped. Candidates are ranked by similarity to your taste profile (people and
theme weigh most) plus a Bayesian TMDB rating (vote average pulled toward the mean when votes are few, twice as
hard for films out less than a year, whose early ratings run high), minus a small discount for films only one
seed recommends, minus a
penalty for TMDB collections you dislike on balance (average w′ ≤ −0.10, so mixed franchises aren't
penalized) and minus a discount for films nominated only by seeds with thin TMDB data (< 500 votes),
then diversified with MMR (relevance rescaled to 0–1 within the pool; λ 0.6 for Boxd In, 0.5 for Boxd Out).
Tried and removed: a bonus for agreement between seeds (it favors blockbusters) and anti-seeds (penalizing
films your least-liked films recommend), which didn't help since dislikes already lower profile similarity.

### Boxd Out

Two scores answer two questions. **Novelty** is how unlike everything you've watched (liked or not) a film's
form (genre, decade; weighs 3×) and place (country, language) are. **Bridge** is how well its people and themes match
your taste profile. Candidates are your seeds' TMDB recommendations plus top-rated `/discover` picks
(≥ 300 votes) in each genre, language and decade that's in under 5% of your films, once plain and once
narrowed to your top keywords. TV movies and the Boxd In picks already shown are dropped. Films with novelty ≥ 0.6 are ranked by Bayesian rating
+ 0.5 × novelty + 0.25 × bridge (rescaled so the best is 1; more lets familiar films back in), minus
disliked franchises, then diversified with MMR over all facets, so the list spreads across languages and
decades. Reasons name what's new for you and, when it's one of your top people or themes, the bridge.

### Weighting

1. Order films by rating, breaking ties by liked, then rewatch count.
2. Midrank percentile: `p = (below + 0.5·equal) / n`
3. Scale: `w = 2p − 1`
4. Shrink the middle: `w' = sign(w)·|w|^γ` (γ ≈ 2)
5. Dampen dislikes: negatives × λ (λ ≈ 0.5)

Watched-but-unrated films get a fixed small weight. With fewer than `min_ratings` ratings, the percentile weight is blended with a mean-centered weight.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
