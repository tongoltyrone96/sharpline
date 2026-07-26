"""
Standings service.

Wraps the sport-specific standings adapters (Squiggle for AFL, nrl.com scrape
for NRL) with in-process caching so we hit the upstream at most once per
sport per refresh window (default 6 hours).

Public entry points:
  - get_team(team_name, sport_key)     → dict | None
  - get_all(sport_key)                 → dict[team_name_lower, dict] | None

Contract:
  - Never raises. Any adapter failure returns None and callers fall back to
    whatever placeholder they already had.
  - Team name matching is case-insensitive and whitespace-collapsed, with a
    small alias map for common short forms ("Roosters" → "Sydney Roosters").
"""

from __future__ import annotations

import logging
import time
from typing import Dict, Optional

from app.adapters.standings_squiggle import SquiggleStandingsAdapter
from app.adapters.standings_nrl import NRLStandingsAdapter

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Adapter registry
# ---------------------------------------------------------------------------
_AFL_ADAPTER = SquiggleStandingsAdapter()
_NRL_ADAPTER = NRLStandingsAdapter()

_ADAPTERS = [_AFL_ADAPTER, _NRL_ADAPTER]

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------
_CACHE_TTL_SECONDS = 60 * 60 * 6   # 6 hours

_cache: Dict[str, tuple[float, dict | None]] = {}


def _cache_key(sport_key: str) -> str:
    return (sport_key or "").lower()


def _cache_get(sport_key: str) -> dict | None | object:
    """Returns cached dict, cached None, or sentinel _MISS if not cached."""
    key = _cache_key(sport_key)
    entry = _cache.get(key)
    if not entry:
        return _MISS
    ts, value = entry
    if (time.time() - ts) > _CACHE_TTL_SECONDS:
        return _MISS
    return value


def _cache_set(sport_key: str, value: dict | None) -> None:
    _cache[_cache_key(sport_key)] = (time.time(), value)


class _MissType:
    pass


_MISS = _MissType()


# ---------------------------------------------------------------------------
# Alias map — short forms (from odds feed) → canonical (from source)
# ---------------------------------------------------------------------------
_ALIASES = {
    # NRL
    "roosters":              "sydney roosters",
    "storm":                 "melbourne storm",
    "broncos":               "brisbane broncos",
    "cowboys":               "north queensland cowboys",
    "eels":                  "parramatta eels",
    "sharks":                "cronulla sharks",
    "titans":                "gold coast titans",
    "rabbitohs":             "south sydney rabbitohs",
    "raiders":               "canberra raiders",
    "dragons":               "st george illawarra dragons",
    "warriors":              "new zealand warriors",
    "panthers":              "penrith panthers",
    "sea eagles":            "manly warringah sea eagles",
    "bulldogs":              "canterbury bulldogs",
    "knights":               "newcastle knights",
    "wests tigers":          "wests tigers",
    "dolphins":              "dolphins",
    # AFL — Squiggle returns names like "brisbane lions", "greater western
    # sydney", "west coast" (no "eagles" suffix). Odds feed / UI often uses
    # short forms so we map both directions here.
    "hawks":                         "hawthorn",
    "hawthorn hawks":                "hawthorn",
    "eagles":                        "west coast",
    "west coast eagles":             "west coast",
    "eagles west coast":             "west coast",
    "cats":                          "geelong",
    "geelong cats":                  "geelong",
    "demons":                        "melbourne",
    "melbourne demons":              "melbourne",
    "tigers":                        "richmond",
    "richmond tigers":               "richmond",
    "bombers":                       "essendon",
    "essendon bombers":              "essendon",
    "swans":                         "sydney",
    "sydney swans":                  "sydney",
    "giants":                        "greater western sydney",
    "gws":                           "greater western sydney",
    "gws giants":                    "greater western sydney",
    "greater western sydney giants": "greater western sydney",
    "suns":                          "gold coast",
    "gold coast suns":               "gold coast",
    "power":                         "port adelaide",
    "port adelaide power":           "port adelaide",
    "crows":                         "adelaide",
    "adelaide crows":                "adelaide",
    "blues":                         "carlton",
    "carlton blues":                 "carlton",
    "lions":                         "brisbane lions",
    "brisbane":                      "brisbane lions",
    "kangaroos":                     "north melbourne",
    "north melbourne kangaroos":     "north melbourne",
    "saints":                        "st kilda",
    "st kilda saints":               "st kilda",
    "dockers":                       "fremantle",
    "fremantle dockers":             "fremantle",
    "magpies":                       "collingwood",
    "collingwood magpies":           "collingwood",
    "bulldogs afl":                  "western bulldogs",
    "footscray":                     "western bulldogs",
}


def _norm(name: str) -> str:
    return " ".join((name or "").lower().split())


def _lookup_key(team_name: str, table: dict[str, dict]) -> str | None:
    """Find the key in `table` that matches team_name, using aliases."""
    n = _norm(team_name)
    if n in table:
        return n
    alias = _ALIASES.get(n)
    if alias and alias in table:
        return alias
    # Loose contains match — e.g. "Sydney Roosters" contains "Roosters"
    for key in table:
        if n and (n in key or key in n):
            return key
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def get_all(sport_key: str) -> dict | None:
    """Return the full standings dict for a sport, or None if unavailable."""
    cached = _cache_get(sport_key)
    if cached is not _MISS:
        return cached  # may be dict or None (both are valid cached values)

    result: dict | None = None
    for adapter in _ADAPTERS:
        try:
            fetched = adapter.fetch(sport_key)
        except Exception as exc:
            log.warning("standings adapter %s raised: %s", adapter.__class__.__name__, exc)
            continue
        if fetched:
            result = fetched
            break

    _cache_set(sport_key, result)
    return result


def get_team(team_name: str, sport_key: str) -> dict | None:
    """Return {rank, wins, losses, draws, played, points, source} or None."""
    if not team_name:
        return None
    table = get_all(sport_key)
    if not table:
        return None
    key = _lookup_key(team_name, table)
    if not key:
        return None
    row = table[key]
    return {
        "rank":   row.get("rank"),
        "wins":   row.get("wins", 0),
        "losses": row.get("losses", 0),
        "draws":  row.get("draws", 0),
        "played": row.get("played", 0),
        "points": row.get("points"),
        "source": row.get("source"),
    }


def invalidate() -> None:
    """Force the cache to be refreshed on next read (used by admin refresh)."""
    _cache.clear()
