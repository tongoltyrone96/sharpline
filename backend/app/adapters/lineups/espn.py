"""
ESPN public injuries adapter — NFL and NBA.

Uses site.api.espn.com (no auth required, no API key).

Returns players who appear on the injury report with status Out or Doubtful.
"Questionable" is included with lower importance. "Probable" is skipped
(effectively healthy).

Never raises. Returns [] on any failure.
"""

import logging
from datetime import datetime

import httpx

from app.adapters.base import LineupAdapter

log = logging.getLogger(__name__)

_TIMEOUT = 10

# sport_key → ESPN sport/league path
_ESPN_PATHS: dict[str, str] = {
    "americanfootball_nfl": "football/nfl",
    "basketball_nba":       "basketball/nba",
}

_STATUS_MAP: dict[str, str] = {
    "Out":          "out",
    "Doubtful":     "doubtful",
    "Questionable": "questionable",
    "Injured Reserve": "out",
    "Physically Unable to Perform": "out",
}

# Status → importance weight (absence significance)
_STATUS_IMPORTANCE: dict[str, float] = {
    "out":          0.75,
    "doubtful":     0.55,
    "questionable": 0.35,
}


class ESPNAdapter(LineupAdapter):
    """Adapter for NFL and NBA via ESPN public API."""

    def __init__(self, sport_key: str) -> None:
        self._sport_key = sport_key
        self._espn_path = _ESPN_PATHS.get(sport_key)

    def fetch(
        self,
        home_team: str,
        away_team: str,
        commence_time: datetime,
    ) -> list[dict]:
        if self._espn_path is None:
            log.debug("ESPNAdapter: no path for sport %s", self._sport_key)
            return []
        try:
            return self._fetch(home_team, away_team)
        except Exception as exc:
            log.warning("ESPNAdapter failed for %s vs %s: %s", home_team, away_team, exc)
            return []

    def _fetch(self, home_team: str, away_team: str) -> list[dict]:
        url = f"https://site.api.espn.com/apis/site/v2/sports/{self._espn_path}/injuries"
        resp = httpx.get(url, timeout=_TIMEOUT)
        if not resp.is_success:
            log.warning("ESPN injuries HTTP %d for %s", resp.status_code, self._espn_path)
            return []

        data = resp.json()
        results: list[dict] = []

        for team_entry in data.get("items", []):
            espn_team = team_entry.get("team", {}).get("displayName", "")
            team_side = _match_side(espn_team, home_team, away_team)
            if team_side is None:
                continue

            for injury in team_entry.get("injuries", []):
                status_raw = injury.get("status", "")
                status = _STATUS_MAP.get(status_raw)
                if status is None:
                    continue
                athlete = injury.get("athlete", {})
                name = athlete.get("displayName", "").strip()
                if not name:
                    continue
                results.append({
                    "player_name": name,
                    "team_side":   team_side,
                    "status":      status,
                    "reason":      injury.get("shortComment") or None,
                    "importance":  _STATUS_IMPORTANCE.get(status, 0.5),
                })

        return results


def _match_side(espn_name: str, home_team: str, away_team: str) -> str | None:
    """
    Fuzzy-match ESPN team name against our home/away team strings.
    ESPN uses "New England Patriots"; we store "New England Patriots".
    Falls back to checking if any word of ESPN name appears in our name.
    """
    espn_lower = espn_name.lower()
    if home_team.lower() in espn_lower or espn_lower in home_team.lower():
        return "home"
    if away_team.lower() in espn_lower or espn_lower in away_team.lower():
        return "away"
    # Word-level fallback
    espn_words = set(espn_lower.split())
    home_words = set(home_team.lower().split())
    away_words = set(away_team.lower().split())
    if espn_words & home_words:
        return "home"
    if espn_words & away_words:
        return "away"
    return None
