"""
AFL squad roster + player-position lookup, sourced from Wikipedia.

Two entry points:
  get_squad(team_name) → [{'name': str, 'number': int|None}, ...]
      Fetches the Squad section of the team's current-season Wikipedia
      article (transcluded from Template:{Team}_current_squad) and
      returns the list of senior-list players. Names only — position is
      NOT in the squad template.

  get_player_position(player_name) → str | None
      Fetches the player's individual Wikipedia article and pulls the
      Position row out of the infobox. Cached aggressively; positions
      change very rarely.

Never raises — any Wikipedia hiccup returns None so the caller keeps
its current fallback (no position badge on the lineup entry).
"""

from __future__ import annotations

import logging
import re
import time
from typing import Optional
from urllib.parse import quote

import httpx

log = logging.getLogger(__name__)

_USER_AGENT = (
    "Mozilla/5.0 (Sharpline; tongoltyrone84@gmail.com) "
    "AFL rosters for lineup dashboard"
)

# Odds-feed name → Wikipedia article slug for the club page. We use the
# club page because the season page URL churns each year and this map
# only needs updating if a club is renamed.
_CLUB_SLUGS: dict[str, str] = {
    "Adelaide Crows":                 "Adelaide_Football_Club",
    "Brisbane Lions":                 "Brisbane_Lions",
    "Carlton Blues":                  "Carlton_Football_Club",
    "Collingwood Magpies":            "Collingwood_Football_Club",
    "Essendon Bombers":               "Essendon_Football_Club",
    "Fremantle Dockers":              "Fremantle_Football_Club",
    "Geelong Cats":                   "Geelong_Football_Club",
    "Gold Coast Suns":                "Gold_Coast_Football_Club",
    "GWS Giants":                     "Greater_Western_Sydney_Giants",
    "Greater Western Sydney Giants":  "Greater_Western_Sydney_Giants",
    "Hawthorn Hawks":                 "Hawthorn_Football_Club",
    "Melbourne Demons":               "Melbourne_Football_Club",
    "North Melbourne Kangaroos":      "North_Melbourne_Football_Club",
    "Port Adelaide Power":            "Port_Adelaide_Football_Club",
    "Richmond Tigers":                "Richmond_Football_Club",
    "St Kilda Saints":                "St_Kilda_Football_Club",
    "Sydney Swans":                   "Sydney_Swans",
    "West Coast Eagles":              "West_Coast_Eagles",
    "Western Bulldogs":               "Western_Bulldogs",
}

_SQUAD_TTL = 60 * 60 * 24 * 7       # 7 days — squads change with trade/draft windows
_POSITION_TTL = 60 * 60 * 24 * 30   # 30 days — an AFL player's listed position rarely changes

_squad_cache: dict[str, tuple[float, Optional[list[dict]]]] = {}
_position_cache: dict[str, tuple[float, Optional[str]]] = {}


def _cache_get(cache: dict, key: str, ttl: int):
    entry = cache.get(key)
    if not entry:
        return "MISS"
    ts, value = entry
    if time.time() - ts > ttl:
        return "MISS"
    return value


def _fetch(url: str) -> str | None:
    try:
        resp = httpx.get(url, headers={"User-Agent": _USER_AGENT}, timeout=15, follow_redirects=True)
    except Exception as exc:
        log.warning("wiki AFL fetch error %s: %s", url, exc)
        return None
    if not resp.is_success:
        log.info("wiki AFL HTTP %d %s", resp.status_code, url)
        return None
    return resp.text


# Match a single Rls player template row in the raw wikitext:
#   {{Rls player|no= 4|name=[[Sean Darcy]]}}
#   {{Rls player|no=25|name=[[Alex Pearce (Australian footballer)|Alex Pearce]]}}
_RLS_PLAYER_RE = re.compile(
    r"Rls player\|no=(?:&amp;nbsp;|&nbsp;|\s)*(\d{1,3})[^}]*?name=\[\[([^\]]+)\]\]"
)


def get_squad(team_name: str) -> list[dict] | None:
    """
    Return the senior list for an AFL team from Wikipedia — [{name, number}].

    We fetch the club's roster template via action=raw (pure wikitext),
    which is stable and lightweight. Two template names exist across
    clubs — some redirect from *_current_squad to *_AFL_personnel — so
    we try both and take whichever returns rows.
    """
    slug = _CLUB_SLUGS.get(team_name)
    if not slug:
        return None
    cached = _cache_get(_squad_cache, slug, _SQUAD_TTL)
    if cached != "MISS":
        return cached  # type: ignore[return-value]

    candidates = (
        f"https://en.wikipedia.org/wiki/Template:{slug}_current_squad?action=raw",
        f"https://en.wikipedia.org/wiki/Template:{slug}_AFL_personnel?action=raw",
        f"https://en.wikipedia.org/wiki/Template:{slug}_AFL_squad?action=raw",
    )
    wikitext: str | None = None
    for url in candidates:
        text = _fetch(url)
        if not text:
            continue
        # Redirects come back as `#REDIRECT [[Template:...]]` — the raw
        # endpoint doesn't auto-follow them, so we chase the target once.
        redirect = re.match(r"#REDIRECT \[\[([^\]]+)\]\]", text.strip(), re.IGNORECASE)
        if redirect:
            target = redirect.group(1).replace(" ", "_")
            text = _fetch(f"https://en.wikipedia.org/wiki/{target}?action=raw")
            if not text:
                continue
        if "Rls player" in text:
            wikitext = text
            break

    if not wikitext:
        _squad_cache[slug] = (time.time(), None)
        return None

    out: list[dict] = []
    seen: set[str] = set()
    for m in _RLS_PLAYER_RE.finditer(wikitext):
        number = int(m.group(1))
        raw = m.group(2).strip()
        # `[[Real Title|Displayed Name]]` → keep the displayed name; a
        # bare `[[Player Name]]` is already fine.
        name = raw.split("|", 1)[-1].strip() if "|" in raw else raw
        if not name or name in seen:
            continue
        seen.add(name)
        out.append({"name": name, "number": number})

    _squad_cache[slug] = (time.time(), out or None)
    return out or None


# Pull the Position row out of a player's infobox.
_POSITION_RE = re.compile(
    r"<th[^>]*>\s*Position\s*</th>\s*<td[^>]*>(.*?)</td>",
    re.DOTALL,
)


def get_player_position(player_name: str) -> str | None:
    """Look up the AFL position listed on a player's Wikipedia infobox."""
    if not player_name or not player_name.strip():
        return None
    key = player_name.strip()
    cached = _cache_get(_position_cache, key.lower(), _POSITION_TTL)
    if cached != "MISS":
        return cached  # type: ignore[return-value]

    # Wikipedia URLs use underscores in place of spaces and are
    # case-sensitive on the first character; normalise accordingly.
    slug = quote(key.replace(" ", "_"))
    url = f"https://en.wikipedia.org/wiki/{slug}"
    html_text = _fetch(url)
    if not html_text:
        _position_cache[key.lower()] = (time.time(), None)
        return None

    m = _POSITION_RE.search(html_text)
    if not m:
        _position_cache[key.lower()] = (time.time(), None)
        return None

    # Strip nested HTML tags — infobox cells often wrap the value in
    # <a>, <br />, or a wikilink.
    text = re.sub(r"<[^>]+>", " ", m.group(1))
    text = re.sub(r"\s+", " ", text).strip()
    # Keep just the primary position (before any comma or slash), so
    # 'Midfielder, forward' becomes 'Midfielder'.
    primary = re.split(r"[,/]", text)[0].strip()
    result = primary or None
    _position_cache[key.lower()] = (time.time(), result)
    return result


def invalidate() -> None:
    _squad_cache.clear()
    _position_cache.clear()
