"""
Weather persistence service.

write_weather(db, event, adapter) — main entry point called by poll_weather.

Indoor venues skip the API call entirely and mark the row is_indoor=True.
Stale rows are kept if the adapter returns None (key not yet active).
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.adapters.base import WeatherAdapter
from app.models import Event, Weather

log = logging.getLogger(__name__)


def write_weather(
    db: Session,
    event: Event,
    adapter: WeatherAdapter,
) -> bool:
    """
    Fetch and persist weather for one event.

    Returns True if a row was written, False if skipped or adapter returned None.
    """
    home_team = event.home_team
    if home_team is None:
        log.debug("event %s has no home_team — skip weather", event.id)
        return False

    # Indoor venues: mark once, never call the API
    if home_team.is_indoor:
        _upsert_indoor(db, event.id)
        return True

    lat = home_team.venue_lat
    lon = home_team.venue_lon
    if lat is None or lon is None:
        log.debug("event %s home team has no venue coords — skip weather", event.id)
        return False

    data = adapter.fetch(lat, lon, event.commence_time)
    if data is None:
        log.info("event %s weather unavailable (adapter returned None) — keeping stale row", event.id)
        return False

    _upsert_row(db, event.id, data)
    return True


def _upsert_indoor(db: Session, event_id: str) -> None:
    stmt = pg_insert(Weather.__table__).values(
        event_id=event_id,
        is_indoor=True,
        fetched_at=datetime.now(tz=timezone.utc),
    )
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=["event_id"],
            set_={"is_indoor": True, "fetched_at": stmt.excluded.fetched_at},
        )
    )
    db.commit()


def _upsert_row(db: Session, event_id: str, data: dict) -> None:
    stmt = pg_insert(Weather.__table__).values(
        event_id=event_id,
        temp_c=data.get("temp_c"),
        wind_kmh=data.get("wind_kmh"),
        rain_prob=data.get("rain_prob"),
        humidity=data.get("humidity"),
        condition=data.get("condition"),
        is_indoor=data.get("is_indoor", False),
        fetched_at=datetime.now(tz=timezone.utc),
    )
    db.execute(
        stmt.on_conflict_do_update(
            index_elements=["event_id"],
            set_={
                "temp_c":     stmt.excluded.temp_c,
                "wind_kmh":   stmt.excluded.wind_kmh,
                "rain_prob":  stmt.excluded.rain_prob,
                "humidity":   stmt.excluded.humidity,
                "condition":  stmt.excluded.condition,
                "is_indoor":  stmt.excluded.is_indoor,
                "fetched_at": stmt.excluded.fetched_at,
            },
        )
    )
    db.commit()
