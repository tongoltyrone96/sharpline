"""
Weather polling task.

Fires every 30 min (Celery Beat). Fetches weather for all events whose
commence_time is within the next 24 hours. Indoor venues get a flag row
written immediately; outdoor venues call the OpenWeatherMap API.

A 401 from OpenWeatherMap (key not yet active) is logged and the stale
row is preserved — the poll cycle never crashes.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.adapters.weather_openweathermap import OpenWeatherAdapter
from app.models import Event, Sport
from app.services.weather_service import write_weather
from app.tasks.celery_app import celery_app
from app.tasks.recompute import recompute_event_task

log = logging.getLogger(__name__)

# OpenWeatherMap's free tier 5-day/3-hour forecast reaches ~120 hours out,
# so we cover every fixture on the current dashboard (games are typically
# scheduled ≤5 days ahead). Beyond 5 days the API returns nothing and we
# gracefully leave the weather row null.
_WINDOW_HOURS = 120


@celery_app.task(name="app.tasks.poll_weather.poll_weather", bind=True, max_retries=3)
def poll_weather(self):
    db: Session = SessionLocal()
    adapter = OpenWeatherAdapter(settings.OPENWEATHER_API_KEY)

    try:
        now = datetime.now(tz=timezone.utc)
        cutoff = now + timedelta(hours=_WINDOW_HOURS)

        events = (
            db.query(Event)
            .join(Event.sport)
            .filter(
                Sport.is_available == True,
                Event.commence_time >= now,
                Event.commence_time <= cutoff,
            )
            .all()
        )

        written = 0
        skipped = 0
        for event in events:
            try:
                ok = write_weather(db, event, adapter)
                if ok:
                    written += 1
                    recompute_event_task.delay(event.id)
                else:
                    skipped += 1
            except Exception as exc:
                log.warning("weather write failed for event %s: %s", event.id, exc)
                skipped += 1

        log.info("poll_weather done: %d events in window, %d written, %d skipped", len(events), written, skipped)

    finally:
        db.close()
