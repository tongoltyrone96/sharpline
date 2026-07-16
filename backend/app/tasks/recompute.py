"""
Celery task: recompute model for one event and publish the Redis update.
"""

import logging
import ssl

import redis as redis_lib

from app.config import settings
from app.db import SessionLocal
from app.services.recompute import recompute_event
from app.tasks.celery_app import celery_app

log = logging.getLogger(__name__)


def _make_redis():
    opts = {}
    if settings.REDIS_URL.startswith("rediss://"):
        opts["ssl_cert_reqs"] = ssl.CERT_NONE
    return redis_lib.from_url(settings.REDIS_URL, **opts)


@celery_app.task(name="app.tasks.recompute.recompute_event")
def recompute_event_task(event_id: str):
    """Recompute model for one event and publish the update."""
    db = SessionLocal()
    redis_client = _make_redis()
    try:
        result = recompute_event(db, event_id, redis_client)
        if result is None:
            log.info("recompute_event_task: no odds for %s", event_id)
        else:
            log.info(
                "recompute_event_task: done for %s  margin=%s  home_prob=%s",
                event_id,
                result.get("projected_margin"),
                result.get("home_win_prob"),
            )
        return result
    except Exception as exc:
        log.error("recompute_event_task failed for %s: %s", event_id, exc)
        raise
    finally:
        db.close()
        redis_client.close()
