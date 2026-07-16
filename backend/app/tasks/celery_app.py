import ssl

from celery import Celery

from app.config import settings

_broker = settings.REDIS_URL
_backend = settings.REDIS_URL

celery_app = Celery(
    "sharpline",
    broker=_broker,
    backend=_backend,
    include=[
        "app.tasks.poll_odds",
        "app.tasks.poll_weather",
        "app.tasks.poll_lineups",
        "app.tasks.recompute",
    ],
)

_conf: dict = {
    "task_serializer": "json",
    "result_serializer": "json",
    "accept_content": ["json"],
    "timezone": "UTC",
    "enable_utc": True,
    "task_track_started": True,
}

if _broker.startswith("rediss://"):
    _ssl_opts = {"ssl_cert_reqs": ssl.CERT_NONE}
    _conf["broker_use_ssl"] = _ssl_opts
    _conf["redis_backend_use_ssl"] = _ssl_opts

celery_app.conf.update(**_conf)

# Import beat schedule here to avoid circular imports in task modules
from app.tasks.beat_schedule import BEAT_SCHEDULE  # noqa: E402
celery_app.conf.beat_schedule = BEAT_SCHEDULE
