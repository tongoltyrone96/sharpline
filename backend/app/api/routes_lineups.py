"""
GET /api/v1/lineups/{event_id}

Returns the scraped team lists for a match (NRL only for now, AFL falls
back to null). Never raises on adapter failure — a missing lineup just
returns 404 so the frontend keeps its "not yet announced" placeholder.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import Event
from app.services.lineups_service import get_lineups

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["lineups"])


@router.get("/lineups/{event_id}")
def lineups_for_event(event_id: str, db: Session = Depends(get_db)) -> dict:
    event = (
        db.query(Event)
        .options(
            joinedload(Event.home_team),
            joinedload(Event.away_team),
            joinedload(Event.sport),
        )
        .filter(Event.id == event_id)
        .first()
    )
    if not event:
        raise HTTPException(status_code=404, detail="event not found")

    home_name = event.home_team.name if event.home_team else ""
    away_name = event.away_team.name if event.away_team else ""
    sport_key = event.sport.title if event.sport else ""

    result = get_lineups(home_name, away_name, sport_key, event.commence_time)
    if not result:
        raise HTTPException(status_code=404, detail="lineups not available")
    return result
