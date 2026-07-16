"""
AFL lineup adapter — Squiggle API (free, public, no API key required).

https://api.squiggle.com.au/

Returns selected players for AFL games. Players listed by Squiggle with
a jumper number are "in" (selected). Players NOT listed may be out, but
we cannot know without a full-squad comparison, so we only return positives
(status="in"). The admin panel is the authoritative source for absences.

Never raises. Returns [] on any failure.
"""

import logging
from datetime import datetime, timedelta

import httpx

from app.adapters.base import LineupAdapter

log = logging.getLogger(__name__)

_BASE = "https://api.squiggle.com.au/"
_TIMEOUT = 10
_MATCH_WINDOW_H = 12  # hours either side of commence_time to match a game

# Squiggle team name → our canonical team name (The Odds API string)
_SQUIGGLE_TO_OURS: dict[str, str] = {
    "Adelaide":              "Adelaide Crows",
    "Brisbane":              "Brisbane Lions",
    "Carlton":               "Carlton Blues",
    "Collingwood":           "Collingwood Magpies",
    "Essendon":              "Essendon Bombers",
    "Fremantle":             "Fremantle Dockers",
    "Geelong":               "Geelong Cats",
    "Gold Coast":            "Gold Coast Suns",
    "Greater Western Sydney":"Greater Western Sydney Giants",
    "GWS Giants":            "Greater Western Sydney Giants",
    "Hawthorn":              "Hawthorn Hawks",
    "Melbourne":             "Melbourne Demons",
    "North Melbourne":       "North Melbourne Kangaroos",
    "Port Adelaide":         "Port Adelaide Power",
    "Richmond":              "Richmond Tigers",
    "St Kilda":              "St Kilda Saints",
    "Sydney":                "Sydney Swans",
    "West Coast":            "West Coast Eagles",
    "Western Bulldogs":      "Western Bulldogs",
    "Footscray":             "Western Bulldogs",
}

# Explicit our-name → squiggle-name (avoids ambiguity from reversing the dict)
_OURS_TO_SQUIGGLE: dict[str, str] = {
    "Adelaide Crows":                "Adelaide",
    "Brisbane Lions":                "Brisbane",
    "Carlton Blues":                 "Carlton",
    "Collingwood Magpies":           "Collingwood",
    "Essendon Bombers":              "Essendon",
    "Fremantle Dockers":             "Fremantle",
    "Geelong Cats":                  "Geelong",
    "Gold Coast Suns":               "Gold Coast",
    "Greater Western Sydney Giants": "Greater Western Sydney",
    "Hawthorn Hawks":                "Hawthorn",
    "Melbourne Demons":              "Melbourne",
    "North Melbourne Kangaroos":     "North Melbourne",
    "Port Adelaide Power":           "Port Adelaide",
    "Richmond Tigers":               "Richmond",
    "St Kilda Saints":               "St Kilda",
    "Sydney Swans":                  "Sydney",
    "West Coast Eagles":             "West Coast",
    "Western Bulldogs":              "Western Bulldogs",
}

# Squiggle position → importance weight
_POSITION_IMPORTANCE: dict[str, float] = {
    "RK":  0.9,   # ruck
    "KF":  0.85,  # key forward
    "KB":  0.80,  # key back
    "MID": 0.70,  # midfielder
    "HF":  0.65,  # half-forward
    "HB":  0.60,  # half-back
    "WIN": 0.55,  # winger
    "INT": 0.40,  # interchange / bench
}
_DEFAULT_IMPORTANCE = 0.5


class SquiggleAdapter(LineupAdapter):
    def fetch(
        self,
        home_team: str,
        away_team: str,
        commence_time: datetime,
    ) -> list[dict]:
        try:
            return self._fetch(home_team, away_team, commence_time)
        except Exception as exc:
            log.warning("SquiggleAdapter failed for %s vs %s: %s", home_team, away_team, exc)
            return []

    def _fetch(self, home_team: str, away_team: str, commence_time: datetime) -> list[dict]:
        year = commence_time.year
        games = self._get_games(year)
        if not games:
            return []

        game_id = self._match_game(games, home_team, away_team, commence_time)
        if game_id is None:
            log.debug("Squiggle: no game match for %s vs %s on %s", home_team, away_team, commence_time.date())
            return []

        return self._get_lineup(game_id, home_team, away_team)

    def _get_games(self, year: int) -> list[dict]:
        resp = httpx.get(
            _BASE,
            params={"q": "games", "year": year},
            headers={"User-Agent": "Sharpline/1.0 (sharpline-app)"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json().get("games", [])

    def _match_game(
        self,
        games: list[dict],
        home_team: str,
        away_team: str,
        commence_time: datetime,
    ) -> int | None:
        home_sq = _our_to_squiggle(home_team)
        away_sq = _our_to_squiggle(away_team)
        window = timedelta(hours=_MATCH_WINDOW_H)

        for g in games:
            if g.get("hteam") != home_sq or g.get("ateam") != away_sq:
                continue
            game_dt = _parse_squiggle_date(g.get("date", ""))
            if game_dt is None:
                continue
            if abs(game_dt - commence_time) <= window:
                return g["id"]
        return None

    def _get_lineup(self, game_id: int, home_team: str, away_team: str) -> list[dict]:
        resp = httpx.get(
            _BASE,
            params={"q": "lineup", "game": game_id},
            headers={"User-Agent": "Sharpline/1.0 (sharpline-app)"},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        lineup_data = resp.json().get("lineups", [])

        home_sq = _our_to_squiggle(home_team)
        results: list[dict] = []

        for entry in lineup_data:
            # Squiggle lineups include hq (jumper number); 0 = not selected / emergency
            if not entry.get("hq"):
                continue
            pos = entry.get("squadpos", "")
            importance = _POSITION_IMPORTANCE.get(pos, _DEFAULT_IMPORTANCE)
            # Squiggle game records include hteam/ateam in the game; lineup entries
            # have a "hteam" field indicating which side the player is on.
            team_side = "home" if entry.get("hteam") == home_sq else "away"
            results.append({
                "player_name": entry["player"],
                "team_side":   team_side,
                "status":      "in",
                "reason":      None,
                "importance":  importance,
            })

        return results


def _our_to_squiggle(name: str) -> str:
    return _OURS_TO_SQUIGGLE.get(name, name)


def _parse_squiggle_date(date_str: str) -> datetime | None:
    try:
        from datetime import timezone
        # Squiggle dates: "2026-07-18 16:15:00"
        dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
        return dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None
