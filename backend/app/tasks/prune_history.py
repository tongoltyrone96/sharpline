"""
odds_history retention.

odds_history is append-only. It backs the line-movement charts and, later, the
settled-results training set — neither of which needs rows from months ago.
Left unbounded it reached 8.8 M rows / 1.4 GB in seven weeks.

Two things keep it in check:
  1. normalise.changed_history_rows() stops writing a row when a bookmaker has
     not moved — that removes the great majority of the volume at the source.
  2. This task trims what is left, once a day.

The window is admin-tunable via the model_params row
`odds_history_retention_days` (no redeploy needed); the default is
_DEFAULT_RETENTION_DAYS.

Deletes run in batches so a single statement never sits long enough to hit
Supabase's statement_timeout, and the task stops after _MAX_BATCHES so one run
can't monopolise the worker — whatever is left is picked up tomorrow.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.db import SessionLocal
from app.models import ModelParam
from app.tasks.celery_app import celery_app

log = logging.getLogger(__name__)

_DEFAULT_RETENTION_DAYS = 90
_BATCH = 20_000
_MAX_BATCHES = 50          # ≤ 1 M rows per run


def _retention_days(db) -> int:
    row = db.query(ModelParam).filter(ModelParam.key == "odds_history_retention_days").first()
    if row is None or row.value is None:
        return _DEFAULT_RETENTION_DAYS
    days = int(row.value)
    # A misconfigured 0 would wipe the table; refuse anything under a week.
    return days if days >= 7 else _DEFAULT_RETENTION_DAYS


@celery_app.task(name="app.tasks.prune_history.prune_odds_history")
def prune_odds_history() -> dict:
    """Delete odds_history rows older than the retention window."""
    db = SessionLocal()
    try:
        days = _retention_days(db)
        cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)

        deleted = 0
        for _ in range(_MAX_BATCHES):
            result = db.execute(
                text(
                    "DELETE FROM odds_history WHERE id IN ("
                    "  SELECT id FROM odds_history WHERE recorded_at < :cutoff"
                    "  ORDER BY id LIMIT :batch)"
                ),
                {"cutoff": cutoff, "batch": _BATCH},
            )
            db.commit()
            n = result.rowcount or 0
            deleted += n
            if n < _BATCH:
                break

        log.info(
            "prune_odds_history: retention=%dd cutoff=%s deleted=%d",
            days, cutoff.isoformat(timespec="seconds"), deleted,
        )
        return {"retention_days": days, "deleted": deleted}
    except Exception as exc:
        db.rollback()
        log.exception("prune_odds_history failed: %s", exc)
        raise
    finally:
        db.close()
