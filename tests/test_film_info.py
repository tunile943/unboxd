from types import SimpleNamespace

from conftest import movie
from unboxd.cache import SQLiteCache
from unboxd.film_info import card_info, pick_trailer, region_providers
from unboxd.tmdb import TMDBClient


def video(key, type="Trailer", official=True, lang="en", site="YouTube", date="2020-01-01"):
    return {"key": key, "type": type, "official": official, "iso_639_1": lang, "site": site,
            "published_at": date, "name": key}


def test_card_info():
    d = movie(director="Denis Villeneuve", genres=("Drama", "Mystery", "War"), cast=("A", "B", "C", "D"), lang="fr")
    info = card_info(d | {"runtime": 131, "overview": "Twins search."})
    assert info == {"runtime": 131, "genres": ["Drama", "Mystery"], "director": "Denis Villeneuve",
                    "cast": ["A", "B", "C"], "overview": "Twins search.", "language": "fr"}
    assert card_info({}) == {"runtime": None, "genres": [], "director": None, "cast": [], "overview": None,
                             "language": None}


def test_pick_trailer():
    assert pick_trailer([]) is None
    assert pick_trailer([video("v", site="Vimeo")]) is None
    assert pick_trailer([video("teaser", type="Teaser"), video("trailer", official=False)])["key"] == "trailer"
    assert pick_trailer([video("fan", official=False), video("official")])["key"] == "official"
    assert pick_trailer([video("de", lang="de", date="2021"), video("fr", lang="fr", date="2020")], "fr")["key"] == "fr"
    assert pick_trailer([video("ja", lang="ja", date="2025"), video("en", date="2020")], "ja")["key"] == "en"
    assert pick_trailer([video("old", date="2019"), video("new", date="2022")])["key"] == "new"
    assert pick_trailer([video("clip", type="Clip")]) is None


def test_region_providers():
    p = lambda i, name, prio: {"provider_id": i, "provider_name": name, "logo_path": f"/{i}.png", "display_priority": prio}
    results = {"US": {"link": "https://tmdb/w", "flatrate": [p(2, "Max", 5)], "free": [p(1, "Kanopy", 1)],
                      "ads": [p(2, "Max", 5), p(9, "Max Amazon Channel", 3)], "rent": [p(3, "Apple TV", 2)], "buy": [p(3, "Apple TV", 2)]}}
    us = region_providers(results, "US")
    assert [o["name"] for o in us["stream"]] == ["Kanopy", "Max"]
    assert us["rent"] == us["buy"] == [{"name": "Apple TV", "logo": "/3.png"}] and us["link"] == "https://tmdb/w"
    assert region_providers(results, "FR") == {"link": None, "stream": [], "rent": [], "buy": []}


def test_providers_cache_for_a_day(tmp_path):
    client = TMDBClient(token="test", cache=SQLiteCache(tmp_path / "c.sqlite"))
    ttls = []
    client.cache = SimpleNamespace(get=lambda k: None, set=lambda k, v, ttl: ttls.append(ttl))
    client.session.get = lambda url, params, timeout: SimpleNamespace(
        status_code=200, headers={}, json=lambda: {"results": {}}, raise_for_status=lambda: None)
    client.watch_providers(1)
    client.videos(1)
    assert ttls == [24 * 3600, 14 * 24 * 3600]
