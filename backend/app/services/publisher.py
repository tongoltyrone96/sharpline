"""
Redis pub/sub publisher for model update events.
"""

import json
import logging
import ssl

import redis as redis_lib

from app.config import settings

CHANNEL = "sharpline:updates"
log = logging.getLogger(__name__)


def _make_sync_redis():
    opts = {}
    if settings.REDIS_URL.startswith("rediss://"):
        opts["ssl_cert_reqs"] = ssl.CERT_NONE
    return redis_lib.from_url(settings.REDIS_URL, **opts)


def publish_model_update(redis_client, event_id: str) -> None:
    try:
        msg = json.dumps({"type": "model_update", "event_id": event_id})
        redis_client.publish(CHANNEL, msg)
    except Exception as exc:
        log.warning("publish failed for %s: %s", event_id, exc)
