"""
Lineup polling task.

Fires every 15 min (Celery Beat). Fetches team lineups / injury reports for
all events whose commence_time is within the next 48 hours.

Gate: if every adapter crashes, manual lineups written via the admin panel
are untouched — the app keeps working with admin-provided data only.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import Event, Sport
from app.adapters.lineups.squiggle import SquiggleAdapter
from app.adapters.lineups.espn import ESPNAdapter
from app.adapters.lineups.nrl import NRLAdapter
from app.services.lineup_merge import upsert_auto
from app.tasks.celery_app import celery_app
from app.tasks.recompute import recompute_event_task

log = logging.getLogger(__name__)

_WINDOW_HOURS = 48

# sport_key → adapter instance
_ADAPTERS = {
    "aussierules_afl":      SquiggleAdapter(),
    "rugbyleague_nrl":      NRLAdapter(),
    "americanfootball_nfl": ESPNAdapter("americanfootball_nfl"),
    "basketball_nba":       ESPNAdapter("basketball_nba"),
    # MLB: no reliable free lineup source
}


@celery_app.task(name="app.tasks.poll_lineups.poll_lineups", bind=True, max_retries=3)
def poll_lineups(self):
    db: Session = SessionLocal()

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

        total_written = 0

        for event in events:
            sport = event.sport
            adapter = _ADAPTERS.get(sport.key)
            if adapter is None:
                continue

            home_team = event.home_team
            away_team = event.away_team
            if home_team is None or away_team is None:
                continue

            try:
                lineup_rows = adapter.fetch(
                    home_team.name,
                    away_team.name,
                    event.commence_time,
                )
            except Exception as exc:
                # Adapters should never raise, but belt-and-suspenders
                log.warning("lineup adapter %s raised for %s: %s", sport.key, event.id, exc)
                lineup_rows = []

            if not lineup_rows:
                continue

            # Split rows by team side, resolve to team_id
            home_rows = [r for r in lineup_rows if r.get("team_side") == "home"]
            away_rows = [r for r in lineup_rows if r.get("team_side") == "away"]

            if home_rows:
                n = upsert_auto(db, event.id, home_team.id, home_rows)
                total_written += n
            if away_rows:
                n = upsert_auto(db, event.id, away_team.id, away_rows)
                total_written += n

            if home_rows or away_rows:
                recompute_event_task.delay(event.id)

        log.info(
            "poll_lineups done: %d events in window, %d lineup rows written",
            len(events),
            total_written,
        )

    finally:
        db.close()
