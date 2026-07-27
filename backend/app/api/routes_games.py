"""
Recent form + H2H endpoints.

GET /api/v1/form/team/{name}?sport=...&n=5
    → { "form": ["W","W","L","W","L"], "source": "..." }
    404 if sport unsupported or team unknown

GET /api/v1/h2h?home=...&away=...&sport=...&n=10
    → { home_wins, away_wins, draws, played, last: [...], source }
    404 on any resolution failure

Both endpoints silently degrade — the frontend hook returns null and the UI
falls back to its seeded placeholder.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from app.services.games_service import recent_form, h2h

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["games"])


@router.get("/form/team/{name}")
def form_for_team(
    name: str,
    sport: str = Query(..., description="Sport key, e.g. aussierules_afl / rugby_league_nrl"),
    n: int = Query(5, ge=1, le=10),
) -> dict:
    result = recent_form(name, sport, n)
    if not result:
        raise HTTPException(status_code=404, detail="form not available")
    return {"form": result, "source": "squiggle" if "afl" in sport.lower() else "nrl-snapshot"}


@router.get("/h2h")
def h2h_endpoint(
    home: str = Query(..., description="Home team name from odds feed"),
    away: str = Query(..., description="Away team name from odds feed"),
    sport: str = Query(..., description="Sport key"),
    n: int = Query(10, ge=1, le=20),
) -> dict:
    result = h2h(home, away, sport, n)
    if not result:
        raise HTTPException(status_code=404, detail="h2h not available")
    return result
