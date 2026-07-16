"""
Sports listing endpoint.

GET /api/v1/sports
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Sport
from app.schemas import SportOut

router = APIRouter(prefix="/api/v1", tags=["sports"])


@router.get("/sports", response_model=list[SportOut])
def list_sports(db: Session = Depends(get_db)) -> list[SportOut]:
    sports = (
        db.query(Sport)
        .order_by(Sport.poll_priority.asc())
        .all()
    )
    return [
        SportOut(
            id=s.id,
            key=s.key,
            title=s.title,
            in_season=s.in_season,
            is_available=s.is_available,
        )
        for s in sports
    ]
