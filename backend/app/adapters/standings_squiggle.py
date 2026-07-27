"""
Squiggle AFL standings adapter.

Squiggle (https://api.squiggle.com.au) is a free public API that exposes the
AFL ladder. We use it to replace the previously seeded pseudo-random ladder
position and W-L record for AFL teams.

Graceful degradation:
  - Any HTTP / network error → log warning, return None.
  - Squiggle expects a User-Agent identifying the caller (per their docs), so
    we send one.
  - No API key required.
"""

import logging
from datetime import datetime, timezone

import httpx

from app.adapters.base import StandingsAdapter

log = logging.getLogger(__name__)

_BASE = "https://api.squiggle.com.au/"
_TIMEOUT = 10
# Squiggle's usage policy requires a User-Agent that identifies the caller
# with a way to contact you (name + email). Without an email address they
# return HTTP 403.
_USER_AGENT = "Sharpline (tongoltyrone84@gmail.com) — AFL standings for match dashboard"


def _normalise(name: str) -> str:
    return " ".join((name or "").lower().split())


class SquiggleStandingsAdapter(StandingsAdapter):
    """AFL standings via api.squiggle.com.au (free, no auth)."""

    def fetch(self, sport_key: str) -> dict[str, dict] | None:
        # Squiggle only covers AFL — return None for other sports so the
        # service can fall back to whatever else it has (e.g. seeded).
        if "afl" not in (sport_key or "").lower():
            return None

        year = datetime.now(timezone.utc).year
        try:
            resp = httpx.get(
                _BASE,
                params={"q": "standings", "year": year},
                headers={"User-Agent": _USER_AGENT},
                timeout=_TIMEOUT,
            )
        except Exception as exc:
            log.warning("Squiggle fetch network error: %s", exc)
            return None

        if not resp.is_success:
            log.warning("Squiggle standings HTTP %d", resp.status_code)
            return None

        try:
            data = resp.json()
        except Exception as exc:
            log.warning("Squiggle JSON parse error: %s", exc)
            return None

        # Squiggle returns {"standings": [ {..}, ... ]}
        rows = data.get("standings") or []
        if not rows:
            log.warning("Squiggle returned empty standings for %d", year)
            return None

        out: dict[str, dict] = {}
        for row in rows:
            name = row.get("name")
            if not name:
                continue
            out[_normalise(name)] = {
                "rank":     row.get("rank"),
                "wins":     row.get("wins", 0),
                "losses":   row.get("losses", 0),
                "draws":    row.get("draws", 0),
                "played":   row.get("played", 0),
                "points":   row.get("pts"),
                "source":   "squiggle",
            }
        return out or None
