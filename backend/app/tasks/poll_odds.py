"""
Odds polling task.

Fires every 30 s (Celery Beat), but the Quota Governor decides whether
each sport actually gets an API call. On a lean key most invocations
return immediately after the governor check.
"""

import logging
import ssl

import redis as redis_lib
from celery import shared_task
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import Sport
from app.adapters.odds_theoddsapi import TheOddsApiAdapter
from app.services.normalise import normalise_payload, record_quota
from app.services.quota import QuotaGovernor
from app.tasks.celery_app import celery_app
from app.tasks.recompute import recompute_event_task

log = logging.getLogger(__name__)


def _make_redis():
    opts = {}
    if settings.REDIS_URL.startswith("rediss://"):
        opts["ssl_cert_reqs"] = ssl.CERT_NONE
    return redis_lib.from_url(settings.REDIS_URL, **opts)


@celery_app.task(name="app.tasks.poll_odds.poll_odds", bind=True, max_retries=3)
def poll_odds(self):
    db: Session = SessionLocal()
    redis = _make_redis()
    adapter = TheOddsApiAdapter(settings.ODDS_API_KEY)
    governor = QuotaGovernor(db, redis)

    try:
        sports = (
            db.query(Sport)
            .filter(Sport.is_available == True, Sport.in_season == True)
            .order_by(Sport.poll_priority)
            .all()
        )

        for sport in sports:
            if not governor.should_poll_now(sport):
                log.debug("skip %s — governor hold", sport.key)
                continue

            # Everything from fetch through normalise is wrapped per-sport so
            # one sport failing (statement timeout on a big NFL payload, DB
            # blip, whatever) never kills the whole sweep. Without this, a
            # crash on the NFL slot means the remaining sports (MLB, NBA)
            # never get processed on this pass.
            try:
                try:
                    payload, quota_headers = adapter.fetch_odds(sport.key)
                except Exception as exc:
                    log.warning("fetch_odds %s failed: %s", sport.key, exc)
                    continue

                if not payload:
                    log.info("%s returned empty payload (between rounds)", sport.key)
                    governor.record_poll(sport)
                    continue

                stats = normalise_payload(db, payload, sport.id)
                record_quota(db, "theoddsapi", quota_headers)
                governor.record_poll(sport)

                log.info(
                    "polled %s: events=%d odds=%d history=%d remaining=%s",
                    sport.key,
                    stats["events"],
                    stats["odds_upserted"],
                    stats["history_rows"],
                    quota_headers.get("x-requests-remaining"),
                )

                # Dispatch recompute for each event in the payload
                for event_data in payload:
                    eid = event_data.get("id")
                    if eid:
                        recompute_event_task.delay(eid)
            except Exception as exc:
                # normalise / record_quota / record_poll can hit DB timeouts
                # on large sport payloads. Roll back so the session is clean
                # for the next sport, log it, and move on.
                log.exception("poll cycle for %s crashed: %s", sport.key, exc)
                try:
                    db.rollback()
                except Exception:
                    pass
                continue

    finally:
        db.close()
        redis.close()
