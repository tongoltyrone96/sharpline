"""
NRL standings adapter.

NRL doesn't publish a free JSON API for the ladder, so we scrape the
nrl.com premiership ladder page. The scrape is deliberately defensive:
if the DOM shape changes, we just return None and callers keep using
whatever fallback they already have.

Season year is taken from the current UTC year. NRL season runs March–October
so out-of-season fetches may return an empty ladder — that's fine, we log
and return None.
"""

import logging
import re
from datetime import datetime, timezone

import httpx

from app.adapters.base import StandingsAdapter

log = logging.getLogger(__name__)

_URL = "https://www.nrl.com/ladder/"
_TIMEOUT = 10
_USER_AGENT = "Mozilla/5.0 (Sharpline standings crawler)"


def _normalise(name: str) -> str:
    return " ".join((name or "").lower().split())


class NRLStandingsAdapter(StandingsAdapter):
    """NRL premiership ladder via nrl.com HTML scrape."""

    def fetch(self, sport_key: str) -> dict[str, dict] | None:
        if "nrl" not in (sport_key or "").lower() and "rugby_league" not in (sport_key or "").lower():
            return None

        try:
            resp = httpx.get(
                _URL,
                headers={"User-Agent": _USER_AGENT, "Accept": "text/html"},
                timeout=_TIMEOUT,
                follow_redirects=True,
            )
        except Exception as exc:
            log.warning("NRL ladder network error: %s", exc)
            return None

        if not resp.is_success:
            log.warning("NRL ladder HTTP %d", resp.status_code)
            return None

        try:
            return self._parse(resp.text)
        except Exception as exc:
            log.warning("NRL ladder parse error: %s", exc)
            return None

    # ------------------------------------------------------------------ #
    # Parsing
    # ------------------------------------------------------------------ #
    @staticmethod
    def _parse(html: str) -> dict[str, dict] | None:
        # nrl.com ships an embedded JSON blob for the ladder inside the
        # page — look for a script node that contains "ladder" and
        # extract the sequence of team objects. If the shape changes we
        # give up quietly and return None.
        # First try the __PRELOADED_STATE__ pattern common on nrl.com.
        m = re.search(
            r"window\.__PRELOADED_STATE__\s*=\s*(\{.*?\});\s*</script>",
            html,
            re.DOTALL,
        )
        blob = m.group(1) if m else None
        if not blob:
            # Fallback: any big JSON object containing "ladder"
            m = re.search(r"(\{[^\{\}]{0,200}\"ladder\"\s*:.*?\})\s*[,;]", html, re.DOTALL)
            blob = m.group(1) if m else None
        if not blob:
            return None

        import json
        try:
            data = json.loads(blob)
        except Exception:
            return None

        rows = _find_ladder_rows(data)
        if not rows:
            return None

        out: dict[str, dict] = {}
        for idx, row in enumerate(rows, start=1):
            name = row.get("teamName") or row.get("name") or row.get("displayName")
            if not name:
                continue
            wins   = int(row.get("wins")    or row.get("W")  or 0)
            losses = int(row.get("losses")  or row.get("L")  or 0)
            draws  = int(row.get("draws")   or row.get("D")  or 0)
            played = wins + losses + draws or int(row.get("played") or row.get("P") or 0)
            rank   = int(row.get("position") or row.get("rank") or idx)
            points = row.get("premiershipPoints") or row.get("pts")
            out[_normalise(name)] = {
                "rank":     rank,
                "wins":     wins,
                "losses":   losses,
                "draws":    draws,
                "played":   played,
                "points":   points,
                "source":   "nrl.com",
            }
        return out or None


def _find_ladder_rows(obj) -> list[dict] | None:
    """Walk the JSON blob looking for the ladder array."""
    if isinstance(obj, dict):
        if "ladder" in obj and isinstance(obj["ladder"], list) and obj["ladder"]:
            candidate = obj["ladder"]
            if isinstance(candidate[0], dict):
                return candidate
        for v in obj.values():
            found = _find_ladder_rows(v)
            if found:
                return found
    elif isinstance(obj, list):
        for v in obj:
            found = _find_ladder_rows(v)
            if found:
                return found
    return None
