"""
Games service — recent form and head-to-head history per team.

Public entry points:
  - recent_form(team_name, sport_key, n=5) → list[str] ('W'/'L'/'D'), latest first
  - h2h(home_name, away_name, sport_key, n=10) → { home_wins, away_wins, draws, last: [{date, home, away, winner, home_score, away_score}, ...] }

Data sources:
  - AFL: Squiggle games endpoint (current year + 2 previous for H2H depth)
  - NRL: hardcoded snapshot (see NRL_FORM below)

Never raises — any adapter failure returns None so the frontend keeps its
seeded fallback.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.services.standings_service import _norm, _lookup_key, _ALIASES

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Squiggle games cache
# ---------------------------------------------------------------------------
_SQUIGGLE_UA = "Sharpline (tongoltyrone84@gmail.com) - AFL games/H2H"
_SQUIGGLE_URL = "https://api.squiggle.com.au/"
_CACHE_TTL = 60 * 60 * 6  # 6 hours

# key: (sport_key, year) → (timestamp, list[game])
_games_cache: dict[tuple[str, int], tuple[float, list[dict] | None]] = {}


def _cache_get(sport: str, year: int) -> list[dict] | None | str:
    entry = _games_cache.get((sport, year))
    if not entry:
        return "MISS"
    ts, value = entry
    if time.time() - ts > _CACHE_TTL:
        return "MISS"
    return value


def _fetch_squiggle_games(year: int) -> list[dict] | None:
    """Fetch all AFL games for a year from Squiggle. Never raises."""
    try:
        resp = httpx.get(
            _SQUIGGLE_URL,
            params={"q": "games", "year": year},
            headers={"User-Agent": _SQUIGGLE_UA},
            timeout=15,
        )
    except Exception as exc:
        log.warning("Squiggle games network error year=%d: %s", year, exc)
        return None
    if not resp.is_success:
        log.warning("Squiggle games HTTP %d year=%d", resp.status_code, year)
        return None
    try:
        data = resp.json()
    except Exception as exc:
        log.warning("Squiggle games JSON error: %s", exc)
        return None
    return data.get("games", [])


def _squiggle_games_for(sport_key: str, year: int) -> list[dict] | None:
    cached = _cache_get(sport_key, year)
    if cached != "MISS":
        return cached  # type: ignore[return-value]
    result = _fetch_squiggle_games(year)
    _games_cache[(sport_key, year)] = (time.time(), result)
    return result


def _match_team(name: str, candidate: str) -> bool:
    """Compare a target team name against a squiggle game side name."""
    n = _norm(name)
    c = _norm(candidate)
    if n == c:
        return True
    if n in _ALIASES and _ALIASES[n] == c:
        return True
    # Loose match ignoring 'cats' 'eagles' 'giants' etc suffixes already
    # handled by the alias map, but do a substring safety net
    return n in c or c in n


# ---------------------------------------------------------------------------
# AFL implementations via Squiggle
# ---------------------------------------------------------------------------
def _afl_recent_form(team_name: str, n: int) -> list[str] | None:
    year = datetime.now(timezone.utc).year
    games = _squiggle_games_for("aussierules_afl", year) or []
    completed = [g for g in games if g.get("complete") == 100]
    # If early season and not enough games yet, pull previous year too
    if len([g for g in completed if _team_played(team_name, g)]) < n:
        prev = _squiggle_games_for("aussierules_afl", year - 1) or []
        completed.extend([g for g in prev if g.get("complete") == 100])

    my_games = [g for g in completed if _team_played(team_name, g)]
    my_games.sort(key=lambda g: g.get("unixtime", 0), reverse=True)

    if not my_games:
        return None

    out: list[str] = []
    for g in my_games[:n]:
        is_home = _match_team(team_name, g.get("hteam") or "")
        my_score = g.get("hscore" if is_home else "ascore") or 0
        opp_score = g.get("ascore" if is_home else "hscore") or 0
        out.append("W" if my_score > opp_score else ("L" if my_score < opp_score else "D"))
    return out


def _team_played(team_name: str, game: dict) -> bool:
    return _match_team(team_name, game.get("hteam") or "") or _match_team(team_name, game.get("ateam") or "")


def _afl_h2h(home_name: str, away_name: str, n: int) -> dict | None:
    year = datetime.now(timezone.utc).year
    all_games: list[dict] = []
    for y in range(year - 3, year + 1):
        gs = _squiggle_games_for("aussierules_afl", y)
        if gs:
            all_games.extend(gs)

    filtered = [
        g for g in all_games
        if g.get("complete") == 100
        and _team_played(home_name, g)
        and _team_played(away_name, g)
    ]
    filtered.sort(key=lambda g: g.get("unixtime", 0), reverse=True)
    filtered = filtered[:n]

    if not filtered:
        return None

    home_wins = 0
    away_wins = 0
    draws = 0
    last: list[dict] = []
    for g in filtered:
        winner = g.get("winner") or ""
        home_played_as_home = _match_team(home_name, g.get("hteam") or "")
        home_score = g.get("hscore") or 0
        away_score = g.get("ascore") or 0
        if not winner or home_score == away_score:
            draws += 1
            result = "D"
        elif _match_team(home_name, winner):
            home_wins += 1
            result = "H"
        elif _match_team(away_name, winner):
            away_wins += 1
            result = "A"
        else:
            # Winner name matched neither team — skip
            continue
        last.append({
            "date":       (g.get("date") or "")[:10],
            "hteam":      g.get("hteam"),
            "ateam":      g.get("ateam"),
            "hscore":     home_score,
            "ascore":     away_score,
            "winner":     winner,
            "for_home_side": result,  # 'H' home wins, 'A' away wins, 'D' draw
        })
    return {
        "home_wins": home_wins,
        "away_wins": away_wins,
        "draws":     draws,
        "played":    len(last),
        "last":      last,
        "source":    "squiggle",
    }


# ---------------------------------------------------------------------------
# NRL snapshots (hardcoded — refresh weekly)
# Recent form is the last 5 completed matches, latest first ('W'/'L'/'D').
# H2H is the aggregate + list of the last N regular-season meetings.
# Snapshot date: 2026-07-27 (Round 21). Update alongside the ladder snapshot.
# ---------------------------------------------------------------------------
_NRL_FORM: dict[str, list[str]] = {
    "penrith panthers":               ["W", "L", "W", "W", "L"],
    "sydney roosters":                ["W", "W", "L", "W", "W"],
    "new zealand warriors":           ["W", "W", "W", "L", "W"],
    "cronulla-sutherland sharks":     ["L", "W", "W", "W", "L"],
    "dolphins":                       ["W", "L", "W", "W", "L"],
    "south sydney rabbitohs":         ["W", "W", "L", "L", "W"],
    "newcastle knights":              ["W", "L", "W", "L", "W"],
    "north queensland cowboys":       ["L", "W", "W", "W", "L"],
    "canterbury-bankstown bulldogs":  ["L", "W", "L", "W", "W"],
    "manly warringah sea eagles":     ["L", "L", "W", "W", "L"],
    "canberra raiders":               ["W", "L", "L", "W", "L"],
    "melbourne storm":                ["L", "L", "W", "L", "L"],
    "gold coast titans":              ["L", "L", "W", "L", "L"],
    "brisbane broncos":               ["L", "W", "L", "L", "L"],
    "parramatta eels":                ["L", "L", "L", "W", "L"],
    "wests tigers":                   ["L", "L", "L", "W", "L"],
    "st. george illawarra dragons":   ["L", "L", "L", "L", "L"],
}


def _nrl_recent_form(team_name: str, n: int) -> list[str] | None:
    key = _lookup_nrl(team_name)
    if not key:
        return None
    form = _NRL_FORM.get(key)
    if not form:
        return None
    return form[:n]


def _lookup_nrl(team_name: str) -> str | None:
    n = _norm(team_name)
    if n in _NRL_FORM:
        return n
    alias = _ALIASES.get(n)
    if alias and alias in _NRL_FORM:
        return alias
    for k in _NRL_FORM:
        if n in k or k in n:
            return k
    return None


def _nrl_h2h(home_name: str, away_name: str, n: int) -> dict | None:
    """
    NRL H2H — without an easy games API we return a coarse plausible split
    derived from where the two teams sit on the ladder. Better than showing
    seeded random values; will get upgraded to real historical data once we
    hook up a games source.
    """
    hk = _lookup_nrl(home_name)
    ak = _lookup_nrl(away_name)
    if not hk or not ak:
        return None
    # Use recent form to bias the plausible H2H: stronger recent form → more historical wins
    hf = _NRL_FORM.get(hk, [])
    af = _NRL_FORM.get(ak, [])
    hw = sum(1 for r in hf if r == "W")
    aw = sum(1 for r in af if r == "W")
    total = 10
    # Normalise to a 10-game split with a floor of 1 each
    if hw + aw == 0:
        home_wins = away_wins = 5
    else:
        home_wins = max(1, min(9, round(hw / (hw + aw) * total)))
        away_wins = total - home_wins
    return {
        "home_wins": home_wins,
        "away_wins": away_wins,
        "draws":     0,
        "played":    total,
        "last":      [],   # no per-game detail for NRL yet
        "source":    "nrl-form-proxy",
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def recent_form(team_name: str, sport_key: str, n: int = 5) -> list[str] | None:
    sk = (sport_key or "").lower()
    if "afl" in sk or "aussierules" in sk:
        return _afl_recent_form(team_name, n)
    if "nrl" in sk or "rugby_league" in sk:
        return _nrl_recent_form(team_name, n)
    return None


def h2h(home_name: str, away_name: str, sport_key: str, n: int = 10) -> dict | None:
    sk = (sport_key or "").lower()
    if "afl" in sk or "aussierules" in sk:
        return _afl_h2h(home_name, away_name, n)
    if "nrl" in sk or "rugby_league" in sk:
        return _nrl_h2h(home_name, away_name, n)
    return None


def invalidate() -> None:
    _games_cache.clear()
