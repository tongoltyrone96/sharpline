"""
Lineups service — resolves an event to its scraped team lists.

NRL: full squad + jersey number + position + starter/interchange, scraped
     from nrl.com match pages. Only available once teams are officially
     announced (typically Tuesday afternoon Sydney time).

AFL: not yet supported — public sources for weekly team announcements
     require login/paid API. Returns None so the frontend falls back to
     the admin-entered lineup rows on the events endpoint.

Public surface:
    get_lineups(event) → dict | None

Result shape when available:
    {
      "home": {"team": "Melbourne Storm", "players": [
          {"name": "...", "position": "Fullback", "number": 1, "starter": true},
          ...
      ]},
      "away": {"team": "...", "players": [...]},
      "source": "nrl.com",
      "url":    "https://www.nrl.com/...",
    }
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.adapters.lineups_nrl import fetch_nrl_lineups

log = logging.getLogger(__name__)

# NRL 2026 season: Round 1 opened Thursday 5 March 2026. Each round runs
# roughly Thu → Sun. We approximate the round number from the game's start
# date by dividing whole weeks since the season opener, then bracket ±1 to
# tolerate byes and shifted fixtures.
_NRL_SEASON_ROUND1_UTC = datetime(2026, 3, 5, 8, 0, tzinfo=timezone.utc)


def _estimated_nrl_round(commence_time: datetime) -> int:
    if commence_time.tzinfo is None:
        commence_time = commence_time.replace(tzinfo=timezone.utc)
    delta_days = (commence_time - _NRL_SEASON_ROUND1_UTC).days
    return max(1, min(27, delta_days // 7 + 1))


def _get_nrl_lineups(home_name: str, away_name: str, commence_time: datetime) -> dict | None:
    year = commence_time.year
    est = _estimated_nrl_round(commence_time)
    # Try the estimated round first, then bracket ±1 in case of a shifted fixture
    for r in (est, est - 1, est + 1, est + 2, est - 2):
        if r < 1 or r > 30:
            continue
        result = fetch_nrl_lineups(home_name, away_name, year, r)
        if result and (result.get("home") or result.get("away")):
            return {
                "home":   {"team": home_name, "players": result["home"]},
                "away":   {"team": away_name, "players": result["away"]},
                "source": result["source"],
                "url":    result["url"],
                "round":  r,
            }
    return None


def get_lineups(
    home_name: str,
    away_name: str,
    sport_key: str,
    commence_time: datetime,
) -> dict | None:
    sk = (sport_key or "").lower()
    if "nrl" in sk or "rugby_league" in sk:
        return _get_nrl_lineups(home_name, away_name, commence_time)
    # AFL not yet supported — see module docstring.
    return None
