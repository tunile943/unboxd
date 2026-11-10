"""Record the API's answers for the sample diary, for the Playwright tests (needs TMDB_READ_TOKEN).

Usage: python scripts/record_e2e_fixtures.py
"""

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))  # for api.index

from api.index import app  # noqa: E402
from unboxd.ingest import EXPORT_FILES  # noqa: E402
OUT = ROOT / "e2e" / "fixtures" / "sample-api.json"


def main() -> None:
    client = TestClient(app)
    files = {f: (ROOT / "public" / "sample" / f).read_text() for f in EXPORT_FILES}
    films = client.post("/api/films", json={"files": files}).json()["films"]
    resolved = client.post("/api/resolve", json={"films": films}).json()["films"]
    slim = [{k: v for k, v in f.items() if k != "candidates"} for f in resolved]
    picks_in = client.post("/api/recommend", json={"mode": "in", "films": slim}).json()["picks"]
    exclude = [p["tmdb_id"] for p in picks_in]
    picks_out = client.post("/api/recommend", json={"mode": "out", "films": slim, "exclude": exclude}).json()["picks"]
    data = {"films": films, "resolved": resolved, "picks_in": picks_in, "picks_out": picks_out}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
