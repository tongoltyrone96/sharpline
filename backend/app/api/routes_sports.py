"""
Sports listing endpoint.

GET /api/v1/sports
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ModelParam, Sport
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


@router.get("/params")
def list_public_params(db: Session = Depends(get_db)) -> dict[str, float]:
    """
    Public read-only view of model parameters (sigma, tuning constants).

    Returns a flat {key: value} map so the frontend can read the same values
    the model uses — e.g. to render a distribution curve with the actual σ
    the admin has set for a given sport. Admin write access still requires
    the /admin routes with password auth.
    """
    rows = db.query(ModelParam.key, ModelParam.value).all()
    return {k: v for k, v in rows}
