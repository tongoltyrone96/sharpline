"""
NRL standings adapter.

NRL has no free JSON API for the ladder and nrl.com uses a JS-rendered page
that our simple HTML parser can't extract cleanly. As a pragmatic Phase-2
step we hardcode the current-round ladder here so the frontend can show
real ranks + W-L records for every NRL team.

Snapshot date and source are recorded below — refresh weekly during the
NRL season (Thu-Sun games → refresh Mon-Tue) by re-running:

    python scripts/refresh_nrl_ladder.py

or by manually replacing the _SNAPSHOT list below with the current
standings from https://en.wikipedia.org/wiki/2026_NRL_season (Ladder
template) or nrl.com/ladder/.

If a live scrape ever succeeds later, it can override this snapshot.
"""

import logging

from app.adapters.base import StandingsAdapter

log = logging.getLogger(__name__)


# Snapshot taken from https://en.wikipedia.org/wiki/2026_NRL_season on
# 2026-07-27 (Round 21). Update weekly.
_SNAPSHOT: list[dict] = [
    {"rank":  1, "name": "Penrith Panthers",              "wins": 14, "losses":  4, "draws": 0, "played": 18, "points": 34},
    {"rank":  2, "name": "Sydney Roosters",               "wins": 13, "losses":  5, "draws": 0, "played": 18, "points": 32},
    {"rank":  3, "name": "New Zealand Warriors",          "wins": 12, "losses":  6, "draws": 0, "played": 18, "points": 30},
    {"rank":  4, "name": "Cronulla-Sutherland Sharks",    "wins": 12, "losses":  6, "draws": 0, "played": 18, "points": 30},
    {"rank":  5, "name": "Dolphins",                      "wins": 11, "losses":  7, "draws": 0, "played": 18, "points": 28},
    {"rank":  6, "name": "South Sydney Rabbitohs",        "wins": 10, "losses":  8, "draws": 0, "played": 18, "points": 26},
    {"rank":  7, "name": "Newcastle Knights",             "wins": 11, "losses":  8, "draws": 0, "played": 19, "points": 26},
    {"rank":  8, "name": "North Queensland Cowboys",      "wins": 11, "losses":  8, "draws": 0, "played": 19, "points": 26},
    {"rank":  9, "name": "Canterbury-Bankstown Bulldogs", "wins":  9, "losses":  9, "draws": 0, "played": 18, "points": 24},
    {"rank": 10, "name": "Manly Warringah Sea Eagles",    "wins":  9, "losses": 10, "draws": 0, "played": 19, "points": 22},
    {"rank": 11, "name": "Canberra Raiders",              "wins":  9, "losses": 10, "draws": 0, "played": 19, "points": 22},
    {"rank": 12, "name": "Melbourne Storm",               "wins":  8, "losses": 11, "draws": 0, "played": 19, "points": 20},
    {"rank": 13, "name": "Gold Coast Titans",             "wins":  6, "losses": 12, "draws": 0, "played": 18, "points": 18},
    {"rank": 14, "name": "Brisbane Broncos",              "wins":  6, "losses": 12, "draws": 0, "played": 18, "points": 18},
    {"rank": 15, "name": "Parramatta Eels",               "wins":  6, "losses": 12, "draws": 0, "played": 18, "points": 18},
    {"rank": 16, "name": "Wests Tigers",                  "wins":  7, "losses": 12, "draws": 0, "played": 19, "points": 18},
    {"rank": 17, "name": "St. George Illawarra Dragons",  "wins":  2, "losses": 16, "draws": 0, "played": 18, "points": 10},
]


def _normalise(name: str) -> str:
    return " ".join((name or "").lower().split())


class NRLStandingsAdapter(StandingsAdapter):
    """NRL premiership ladder from a hardcoded weekly snapshot."""

    def fetch(self, sport_key: str) -> dict[str, dict] | None:
        if "nrl" not in (sport_key or "").lower() and "rugby_league" not in (sport_key or "").lower():
            return None

        out: dict[str, dict] = {}
        for row in _SNAPSHOT:
            out[_normalise(row["name"])] = {
                "rank":     row["rank"],
                "wins":     row["wins"],
                "losses":   row["losses"],
                "draws":    row["draws"],
                "played":   row["played"],
                "points":   row["points"],
                "source":   "nrl-snapshot-2026-07-27",
            }
        return out
