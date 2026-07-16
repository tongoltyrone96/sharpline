import logging

import httpx

from .base import OddsAdapter

log = logging.getLogger(__name__)

_MARKETS = "h2h,spreads,totals"
_REGIONS = "au"
_ODDS_FORMAT = "decimal"
_BASE_URL = "https://api.the-odds-api.com/v4"

_QUOTA_HEADERS = (
    "x-requests-remaining",
    "x-requests-used",
    "x-requests-last",
)


class TheOddsApiAdapter(OddsAdapter):
    def __init__(self, api_key: str) -> None:
        self._key = api_key

    def fetch_odds(self, sport_key: str) -> tuple[list[dict], dict]:
        url = f"{_BASE_URL}/sports/{sport_key}/odds"
        params = {
            "apiKey": self._key,
            "regions": _REGIONS,
            "markets": _MARKETS,
            "oddsFormat": _ODDS_FORMAT,
        }
        resp = httpx.get(url, params=params, timeout=30)
        resp.raise_for_status()
        quota = {h: resp.headers.get(h) for h in _QUOTA_HEADERS}
        log.info(
            "fetch_odds %s: %d events | remaining=%s used=%s cost=%s",
            sport_key,
            len(resp.json()),
            quota.get("x-requests-remaining"),
            quota.get("x-requests-used"),
            quota.get("x-requests-last"),
        )
        return resp.json(), quota

    def fetch_sports(self) -> list[dict]:
        url = f"{_BASE_URL}/sports"
        resp = httpx.get(url, params={"apiKey": self._key}, timeout=30)
        resp.raise_for_status()
        return resp.json()
