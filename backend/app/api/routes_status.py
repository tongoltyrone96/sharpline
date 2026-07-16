"""
Status endpoint.

GET /api/v1/status
"""

from __future__ import annotations

import logging
import ssl
from datetime import datetime

import redis as redis_lib
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal, get_db
from app.models import ApiQuota, Sport
from app.schemas import AdapterStatus, StatusResponse
from app.services.quota import QuotaGovernor

router = APIRouter(prefix="/api/v1", tags=["status"])
log = logging.getLogger(__name__)


def _make_sync_redis():
    opts = {}
    if settings.REDIS_URL.startswith("rediss://"):
        opts["ssl_cert_reqs"] = ssl.CERT_NONE
    return redis_lib.from_url(settings.REDIS_URL, **opts)


@router.get("/status", response_model=StatusResponse)
def get_status(db: Session = Depends(get_db)) -> StatusResponse:
    redis_client = _make_sync_redis()

    try:
        governor = QuotaGovernor(db, redis_client)

        credits_remaining = governor.credits_remaining()
        mode = governor.mode()
        days_until_reset = governor.days_until_reset()
        credits_per_day = governor.credits_per_day()

        # Find most recent poll across all active sports
        active_sports = (
            db.query(Sport)
            .filter(Sport.is_available == True, Sport.in_season == True)
            .all()
        )

        last_poll: datetime | None = None
        for sport in active_sports:
            redis_key = f"sharpline:last_polled:{sport.key}"
            try:
                val = redis_client.get(redis_key)
                if val is not None:
                    dt = datetime.fromisoformat(val.decode())
                    if last_poll is None or dt > last_poll:
                        last_poll = dt
            except Exception as exc:
                log.warning("Could not read last_polled for %s: %s", sport.key, exc)

        # Adapters: mark all healthy for Phase 7
        adapter_names = ["odds_api", "openweather", "squiggle", "espn", "nrl"]
        adapters = {name: AdapterStatus(healthy=True, last_error=None) for name in adapter_names}

    finally:
        redis_client.close()

    return StatusResponse(
        credits_remaining=credits_remaining,
        mode=mode,
        days_until_reset=days_until_reset,
        credits_per_day=credits_per_day,
        last_poll=last_poll,
        adapters=adapters,
    )
