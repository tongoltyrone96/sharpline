"""
NRL match team-list scraper.

The nrl.com match page embeds team lists as JSON in the initial HTML
(server-rendered). We fetch the page, extract the `players` arrays, and
return per-team squads with jersey number, position, and starter/bench
status.

Never raises — any failure returns None so the caller can fall back to
its placeholder.
"""

from __future__ import annotations

import html
import json
import logging
import re
import time
from typing import Optional

import httpx

log = logging.getLogger(__name__)

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 "
    "Sharpline (tongoltyrone84@gmail.com)"
)

_BASE_URL = "https://www.nrl.com/draw/nrl-premiership"

# NRL.com URL slugs — differ from the odds-feed team names in a few places
# (Sea Eagles / Wests Tigers / Cowboys spelling). Keys are lowercase
# whitespace-stripped short names as they appear in the odds feed.
_TEAM_SLUGS: dict[str, str] = {
    "brisbane broncos":               "broncos",
    "broncos":                        "broncos",
    "canberra raiders":               "raiders",
    "raiders":                        "raiders",
    "canterbury bulldogs":            "bulldogs",
    "canterbury-bankstown bulldogs":  "bulldogs",
    "bulldogs":                       "bulldogs",
    "cronulla sharks":                "sharks",
    "cronulla sutherland sharks":     "sharks",
    "cronulla-sutherland sharks":     "sharks",
    "sharks":                         "sharks",
    "dolphins":                       "dolphins",
    "gold coast titans":              "titans",
    "titans":                         "titans",
    "manly sea eagles":               "sea-eagles",
    "manly warringah sea eagles":     "sea-eagles",
    "sea eagles":                     "sea-eagles",
    "melbourne storm":                "storm",
    "storm":                          "storm",
    "new zealand warriors":           "warriors",
    "warriors":                       "warriors",
    "newcastle knights":              "knights",
    "knights":                        "knights",
    "north queensland cowboys":       "cowboys",
    "cowboys":                        "cowboys",
    "parramatta eels":                "eels",
    "eels":                           "eels",
    "penrith panthers":               "panthers",
    "panthers":                       "panthers",
    "south sydney rabbitohs":         "rabbitohs",
    "rabbitohs":                      "rabbitohs",
    "st george illawarra dragons":    "dragons",
    "st. george illawarra dragons":   "dragons",
    "dragons":                        "dragons",
    "sydney roosters":                "roosters",
    "roosters":                       "roosters",
    "wests tigers":                   "wests-tigers",
    "tigers":                         "wests-tigers",
}


def _slug_for(name: str) -> str | None:
    if not name:
        return None
    return _TEAM_SLUGS.get(name.strip().lower())


# Simple in-process cache — nrl.com pages are heavy (~280KB) and lineups
# only change ~1x/week. Cache for an hour.
_CACHE_TTL = 60 * 60
_cache: dict[tuple[str, str, int, int], tuple[float, Optional[dict]]] = {}


def _cache_get(key) -> Optional[dict] | str:
    entry = _cache.get(key)
    if not entry:
        return "MISS"
    ts, value = entry
    if time.time() - ts > _CACHE_TTL:
        return "MISS"
    return value


def _fetch_html(url: str) -> str | None:
    try:
        resp = httpx.get(url, headers={"User-Agent": _USER_AGENT}, timeout=15, follow_redirects=True)
    except Exception as exc:
        log.warning("nrl.com fetch error %s: %s", url, exc)
        return None
    if not resp.is_success:
        log.warning("nrl.com HTTP %d %s", resp.status_code, url)
        return None
    return resp.text


# Match blocks like `"players":[{...}, {...}]` inside the HTML-encoded
# JSON payload. There are exactly two per page (home and away).
_PLAYERS_RE = re.compile(r"&quot;players&quot;:\[(?P<body>.*?)\]", re.DOTALL)
_PLAYER_ITEM_RE = re.compile(r"\{[^{}]*\}")


def _parse_players(html_text: str) -> list[list[dict]]:
    """Extract the two `players` arrays from an nrl.com match page."""
    out: list[list[dict]] = []
    for m in _PLAYERS_RE.finditer(html_text):
        arr_text = "[" + m.group("body") + "]"
        # unescape HTML entities so the JSON becomes valid
        decoded = html.unescape(arr_text)
        try:
            parsed = json.loads(decoded)
        except Exception as exc:
            log.debug("nrl.com JSON parse error: %s", exc)
            continue
        if isinstance(parsed, list):
            out.append(parsed)
        if len(out) >= 2:
            break
    return out


def fetch_nrl_lineups(
    home_name: str,
    away_name: str,
    year: int,
    round_num: int,
) -> dict | None:
    """
    Return { 'home': [player, ...], 'away': [player, ...], 'source': 'nrl.com' }
    or None if the page can't be fetched or parsed.

    Player dicts look like:
        { 'name': 'Isaiah Iongi', 'position': 'Fullback',
          'number': 1, 'starter': True }
    """
    home_slug = _slug_for(home_name)
    away_slug = _slug_for(away_name)
    if not home_slug or not away_slug:
        log.info("nrl lineups: no slug for %s vs %s", home_name, away_name)
        return None

    cache_key = (home_slug, away_slug, year, round_num)
    cached = _cache_get(cache_key)
    if cached != "MISS":
        return cached  # type: ignore[return-value]

    url = (
        f"{_BASE_URL}/{year}/round-{round_num}/{home_slug}-v-{away_slug}/"
    )
    html_text = _fetch_html(url)
    if not html_text:
        _cache[cache_key] = (time.time(), None)
        return None

    arrays = _parse_players(html_text)
    if len(arrays) < 2:
        log.info("nrl lineups: only %d player arrays found at %s", len(arrays), url)
        _cache[cache_key] = (time.time(), None)
        return None

    def _norm(arr: list[dict]) -> list[dict]:
        out: list[dict] = []
        for p in arr:
            first = (p.get("firstName") or "").strip()
            last = (p.get("lastName") or "").strip()
            if not (first or last):
                continue
            out.append({
                "name":     (first + " " + last).strip(),
                "position": p.get("position") or "",
                "number":   p.get("number"),
                "starter":  bool(p.get("isOnField")),
            })
        return out

    result = {
        "home":   _norm(arrays[0]),
        "away":   _norm(arrays[1]),
        "source": "nrl.com",
        "url":    url,
    }
    _cache[cache_key] = (time.time(), result)
    return result


def invalidate() -> None:
    _cache.clear()
