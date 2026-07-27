"""
NRL historical match scraper — Wikipedia season results pages.

For each season, `https://en.wikipedia.org/wiki/{year}_NRL_season_results`
lists every match with home team, score, and away team. We parse those
into a flat list and cache in memory for a day (Wikipedia updates match
scores within an hour of full-time but the endpoint is heavy so we
don't want to hit it constantly).

Public surface:
  fetch_season(year) → list[dict] | None
      Each match: {'year', 'round', 'home', 'away', 'hscore', 'ascore'}
      Team names are the canonical Wikipedia titles
      (e.g. "St. George Illawarra Dragons").

Never raises — all failures return None or an empty list.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Optional

import httpx

log = logging.getLogger(__name__)

_USER_AGENT = (
    "Mozilla/5.0 (Sharpline; tongoltyrone84@gmail.com) "
    "NRL head-to-head scraper for match dashboard"
)

# The 17 current NRL teams as they appear in Wikipedia article titles.
_NRL_TEAMS: list[str] = [
    "Brisbane Broncos",
    "Canberra Raiders",
    "Canterbury-Bankstown Bulldogs",
    "Cronulla-Sutherland Sharks",
    r"Dolphins \(NRL\)",
    "Gold Coast Titans",
    "Manly Warringah Sea Eagles",
    "Melbourne Storm",
    "Newcastle Knights",
    "New Zealand Warriors",
    "North Queensland Cowboys",
    "Parramatta Eels",
    "Penrith Panthers",
    "South Sydney Rabbitohs",
    r"St\. George Illawarra Dragons",
    "Sydney Roosters",
    "Wests Tigers",
]
_TEAM_RE = "(" + "|".join(_NRL_TEAMS) + ")"

# Row shape:
#  <td align="left">…icon…<a title="TeamA">TeamA</a></td>
#  <td>NN–NN</td>
#  <td align="left">…icon…<a title="TeamB">TeamB</a></td>
# Winner is often bolded (<b>…<a…>Winner</a></b></td>), so we allow an
# optional </b> before </td>.
_MATCH_RE = re.compile(
    r'<td\s+align="left"[^>]*>.{5,3000}?'
    + f'title="{_TEAM_RE}"[^>]*>[^<]*</a>(?:</b>)?</td>'
    + r'\s*<td[^>]*>(\d{1,2})[–—\-](\d{1,2})</td>'
    + r'\s*<td\s+align="left"[^>]*>.{5,3000}?'
    + f'title="{_TEAM_RE}"',
    re.DOTALL,
)

# `id="Round_21"`, `id="Round_21_2"`, etc. — split the results page into
# per-round chunks so we can attach the round number to each match.
_ROUND_HEADING_RE = re.compile(r'id="Round_(\d+)(?:_\d+)?"')

_CACHE_TTL = 60 * 60 * 24  # 24 hours
_cache: dict[int, tuple[float, Optional[list[dict]]]] = {}


def _cache_get(year: int):
    entry = _cache.get(year)
    if not entry:
        return "MISS"
    ts, value = entry
    if time.time() - ts > _CACHE_TTL:
        return "MISS"
    return value


def _fetch_page(year: int) -> str | None:
    url = f"https://en.wikipedia.org/wiki/{year}_NRL_season_results"
    try:
        resp = httpx.get(url, headers={"User-Agent": _USER_AGENT}, timeout=20, follow_redirects=True)
    except Exception as exc:
        log.warning("wiki NRL results fetch error year=%d: %s", year, exc)
        return None
    if not resp.is_success:
        log.warning("wiki NRL results HTTP %d year=%d", resp.status_code, year)
        return None
    return resp.text


def _parse(html_text: str, year: int) -> list[dict]:
    """Split by round headings and extract matches from each round's block."""
    out: list[dict] = []
    # Split points: (round_num, start_index)
    starts: list[tuple[int, int]] = []
    for m in _ROUND_HEADING_RE.finditer(html_text):
        starts.append((int(m.group(1)), m.start()))
    if not starts:
        # No round headings — fall back to parsing the whole page with unknown round
        for m in _MATCH_RE.finditer(html_text):
            home, hs, as_, away = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
            out.append({"year": year, "round": None, "home": _clean(home), "away": _clean(away),
                        "hscore": hs, "ascore": as_})
        return out

    # Add sentinel end
    starts.append((0, len(html_text)))
    for i in range(len(starts) - 1):
        round_num, start = starts[i]
        end = starts[i + 1][1]
        block = html_text[start:end]
        for m in _MATCH_RE.finditer(block):
            home = _clean(m.group(1))
            away = _clean(m.group(4))
            hs = int(m.group(2))
            as_ = int(m.group(3))
            out.append({
                "year":   year,
                "round":  round_num,
                "home":   home,
                "away":   away,
                "hscore": hs,
                "ascore": as_,
            })
    return out


def _clean(name: str) -> str:
    # Strip the "(NRL)" disambiguator Wikipedia uses for Dolphins
    return name.replace(" (NRL)", "").strip()


def fetch_season(year: int) -> list[dict] | None:
    cached = _cache_get(year)
    if cached != "MISS":
        return cached  # type: ignore[return-value]
    html_text = _fetch_page(year)
    if not html_text:
        _cache[year] = (time.time(), None)
        return None
    parsed = _parse(html_text, year)
    _cache[year] = (time.time(), parsed)
    return parsed


def invalidate() -> None:
    _cache.clear()
