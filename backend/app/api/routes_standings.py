"""
Standings endpoint.

GET /api/v1/standings/{sport}          → { team_lower: {rank,wins,losses,...} }
GET /api/v1/standings/team/{name}?sport=... → single team row or 404

Never raises 5xx just because the upstream (Squiggle, nrl.com) is down —
returns an empty dict / 404 instead so the frontend keeps rendering with
its placeholder fallback.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from app.services.standings_service import get_all, get_team

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/standings", tags=["standings"])


@router.get("/{sport}")
def standings_for_sport(sport: str) -> dict:
    """Return every team's ladder row for the given sport, keyed by lower name."""
    table = get_all(sport)
    return table or {}


@router.get("/team/{name}")
def standings_for_team(
    name: str,
    sport: str = Query(..., description="Sport key, e.g. rugby_league_nrl or aussierules_afl"),
) -> dict:
    row = get_team(name, sport)
    if not row:
        raise HTTPException(status_code=404, detail="team not found in standings")
    return row
